import Anthropic from '@anthropic-ai/sdk';
import { env } from './env';
import { logEvent } from './logger';
import type { ChatMessage, ChatResult, Intent, IntentDetection } from './types';

const CLAUDE_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 1;
const RETRYABLE_STATUS_CODES = [429, 529];

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return client;
}

const INTENT_CLASSIFICATION_TIMEOUT_MS = 5_000;
const VALID_INTENTS: Intent[] = ['faq', 'lead', 'booking', 'quote', 'handoff'];

const CLASSIFY_INTENT_TOOL: Anthropic.Tool = {
  name: 'classify_intent',
  description: 'Clasifica la intención del mensaje del cliente.',
  input_schema: {
    type: 'object' as const,
    properties: {
      intent: {
        type: 'string',
        enum: VALID_INTENTS,
        description:
          'faq = consulta general, lead = intención comercial, booking = agendar/reservar, quote = cotización/presupuesto, handoff = pide humano o reclamo',
      },
      confidence: {
        type: 'string',
        enum: ['high', 'medium', 'low'],
        description: 'Nivel de confianza en la clasificación',
      },
      reason: {
        type: 'string',
        description: 'Breve explicación de por qué se eligió esta intención',
      },
    },
    required: ['intent', 'confidence', 'reason'],
  },
};

const LEAD_TOOL: Anthropic.Tool = {
  name: 'capture_lead',
  description:
    'Registra un lead cuando el cliente muestra intención comercial clara y ya tienes su nombre y motivo/necesidad. ' +
    'Llama esta herramienta ADEMÁS de responder al cliente con texto.',
  input_schema: {
    type: 'object' as const,
    properties: {
      nombre: { type: 'string', description: 'Nombre del cliente' },
      motivo: {
        type: 'string',
        description: 'Motivo de interés o necesidad del cliente',
      },
    },
    required: ['nombre', 'motivo'],
  },
};

export async function chat(
  systemPrompt: string,
  messages: ChatMessage[]
): Promise<ChatResult> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CLAUDE_TIMEOUT_MS);

    try {
      const response = await getClient().messages.create(
        {
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 400,
          system: systemPrompt,
          messages,
          tools: [LEAD_TOOL],
        },
        { signal: controller.signal }
      );

      logEvent('info', 'Claude API response', {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        stopReason: response.stop_reason,
      });

      let text = '';
      let leadCapture: ChatResult['leadCapture'] = null;

      for (const block of response.content) {
        if (block.type === 'text') {
          text += block.text;
        } else if (
          block.type === 'tool_use' &&
          block.name === 'capture_lead'
        ) {
          const input = block.input as { nombre: string; motivo: string };
          leadCapture = { nombre: input.nombre, motivo: input.motivo };
        }
      }

      return {
        text: text.trim(),
        leadCapture,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      const status = (err as { status?: number })?.status;
      if (
        attempt < MAX_RETRIES &&
        status !== undefined &&
        RETRYABLE_STATUS_CODES.includes(status)
      ) {
        const backoffMs = 1000 * (attempt + 1);
        logEvent(
          'warn',
          `Claude API retryable error (status ${status}), retrying in ${backoffMs}ms`,
          { attempt, status }
        );
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }

      throw lastError;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError!;
}

export async function classifyIntent(
  message: string,
  businessType: string
): Promise<IntentDetection | null> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    INTENT_CLASSIFICATION_TIMEOUT_MS
  );

  try {
    const response = await getClient().messages.create(
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        system:
          `Eres un clasificador de intenciones para un chatbot de WhatsApp de un negocio chileno (${businessType}). ` +
          'Analiza el mensaje del cliente y clasifica su intención usando la herramienta classify_intent. ' +
          'Considera español chileno informal: abreviaciones (agda=agenda, coti=cotización), errores tipográficos, y modismos locales.',
        messages: [{ role: 'user', content: message }],
        tools: [CLASSIFY_INTENT_TOOL],
        tool_choice: { type: 'tool', name: 'classify_intent' },
      },
      { signal: controller.signal }
    );

    for (const block of response.content) {
      if (block.type === 'tool_use' && block.name === 'classify_intent') {
        const input = block.input as {
          intent: string;
          confidence: string;
          reason: string;
        };
        if (VALID_INTENTS.includes(input.intent as Intent)) {
          return {
            intent: input.intent as Intent,
            confidence: input.confidence as IntentDetection['confidence'],
            reason: input.reason,
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
  } finally {
    clearTimeout(timeout);
  }
}
