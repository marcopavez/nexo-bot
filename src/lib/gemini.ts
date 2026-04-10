import {
  FunctionCallingMode,
  FunctionDeclaration,
  GoogleGenerativeAI,
  SchemaType,
} from '@google/generative-ai';
import { getOptionalEnv } from './env';
import { logEvent } from './logger';
import type { ChatMessage, ChatResult, Intent, IntentDetection } from './types';

const GEMINI_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 1;
const RETRYABLE_HTTP_CODES = [429, 503];

const MODEL_ID = 'gemini-2.5-flash';

let client: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!client) {
    const apiKey = getOptionalEnv('GEMINI_API_KEY');
    if (!apiKey) throw new Error('[nexo-bot] Missing required env var: GEMINI_API_KEY');
    client = new GoogleGenerativeAI(apiKey);
  }
  return client;
}

const INTENT_CLASSIFICATION_TIMEOUT_MS = 5_000;
const VALID_INTENTS: Intent[] = ['faq', 'lead', 'booking', 'quote', 'handoff'];

const CLASSIFY_INTENT_FN: FunctionDeclaration = {
  name: 'classify_intent',
  description: 'Clasifica la intención del mensaje del cliente.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      intent: {
        type: SchemaType.STRING,
        format: 'enum',
        enum: VALID_INTENTS,
        description:
          'faq = consulta general, lead = intención comercial, booking = agendar/reservar, quote = cotización/presupuesto, handoff = pide humano o reclamo',
      },
      confidence: {
        type: SchemaType.STRING,
        format: 'enum',
        enum: ['high', 'medium', 'low'],
        description: 'Nivel de confianza en la clasificación',
      },
      reason: {
        type: SchemaType.STRING,
        description: 'Breve explicación de por qué se eligió esta intención',
      },
    },
    required: ['intent', 'confidence', 'reason'],
  },
};

const LEAD_CAPTURE_FN: FunctionDeclaration = {
  name: 'capture_lead',
  description:
    'Registra un lead cuando el cliente muestra intención comercial clara y ya tienes su nombre y motivo/necesidad. ' +
    'Llama esta herramienta ADEMÁS de responder al cliente con texto.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      nombre: { type: SchemaType.STRING, description: 'Nombre del cliente' },
      motivo: {
        type: SchemaType.STRING,
        description: 'Motivo de interés o necesidad del cliente',
      },
    },
    required: ['nombre', 'motivo'],
  },
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(Object.assign(new Error('Request timed out'), { status: 408 })), ms)
    ),
  ]);
}

export async function chat(
  systemPrompt: string,
  messages: ChatMessage[]
): Promise<ChatResult> {
  if (messages.length === 0) {
    throw new Error('chat() requires at least one message');
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const model = getClient().getGenerativeModel({
        model: MODEL_ID,
        systemInstruction: systemPrompt,
        tools: [{ functionDeclarations: [LEAD_CAPTURE_FN] }],
      });

      // Split history: all but last go into startChat, last is the current turn.
      const historyMessages = messages.slice(0, -1);
      const currentMessage = messages[messages.length - 1];

      const geminiHistory = historyMessages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      const chatSession = model.startChat({ history: geminiHistory });
      const result = await withTimeout(
        chatSession.sendMessage(currentMessage.content),
        GEMINI_TIMEOUT_MS
      );

      const response = result.response;
      const usage = response.usageMetadata;

      logEvent('info', 'Gemini API response', {
        inputTokens: usage?.promptTokenCount ?? 0,
        outputTokens: usage?.candidatesTokenCount ?? 0,
        finishReason: response.candidates?.[0]?.finishReason,
      });

      let text = '';
      let leadCapture: ChatResult['leadCapture'] = null;

      for (const part of response.candidates?.[0]?.content?.parts ?? []) {
        if ('text' in part && part.text) {
          text += part.text;
        } else if ('functionCall' in part && part.functionCall?.name === 'capture_lead') {
          const args = part.functionCall.args as { nombre: string; motivo: string };
          leadCapture = { nombre: args.nombre, motivo: args.motivo };
        }
      }

      return {
        text: text.trim(),
        leadCapture,
        inputTokens: usage?.promptTokenCount ?? 0,
        outputTokens: usage?.candidatesTokenCount ?? 0,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      const status = (err as { status?: number })?.status;
      if (
        attempt < MAX_RETRIES &&
        status !== undefined &&
        RETRYABLE_HTTP_CODES.includes(status)
      ) {
        const backoffMs = 1000 * (attempt + 1);
        logEvent(
          'warn',
          `Gemini API retryable error (status ${status}), retrying in ${backoffMs}ms`,
          { attempt, status }
        );
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }

      throw lastError;
    }
  }

  throw lastError!;
}

export async function classifyIntent(
  message: string,
  businessType: string
): Promise<IntentDetection | null> {
  try {
    const model = getClient().getGenerativeModel({
      model: MODEL_ID,
      systemInstruction:
        `Eres un clasificador de intenciones para un chatbot de WhatsApp de un negocio chileno (${businessType}). ` +
        'Analiza el mensaje del cliente y clasifica su intención usando la función classify_intent. ' +
        'Considera español chileno informal: abreviaciones (agda=agenda, coti=cotización), errores tipográficos, y modismos locales.',
      tools: [{ functionDeclarations: [CLASSIFY_INTENT_FN] }],
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingMode.ANY,
          allowedFunctionNames: ['classify_intent'],
        },
      },
    });

    const result = await withTimeout(
      model.generateContent(message),
      INTENT_CLASSIFICATION_TIMEOUT_MS
    );

    const response = result.response;
    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if ('functionCall' in part && part.functionCall?.name === 'classify_intent') {
        const args = part.functionCall.args as {
          intent: string;
          confidence: string;
          reason: string;
        };
        if (VALID_INTENTS.includes(args.intent as Intent)) {
          return {
            intent: args.intent as Intent,
            confidence: args.confidence as IntentDetection['confidence'],
            reason: args.reason,
          };
        }
      }
    }

    return null;
  } catch (err) {
    logEvent('warn', 'Intent classification LLM call failed, falling back to keywords', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
