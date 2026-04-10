import { runBookingFlow } from '@/lib/booking';
import { chat, classifyIntent } from '@/lib/gemini';
import { detectIntent } from '@/lib/intents';
import { logEvent } from '@/lib/logger';
import { buildSystemPrompt } from '@/lib/prompts';
import { retrieveContext } from '@/lib/rag';
import {
  acquireMessageLock,
  checkRateLimit,
  clearProviderFailures,
  getCachedBot,
  getCachedBotMemory,
  setCachedBot,
  setCachedBotMemory,
  getHistory,
  isMessageProcessed,
  isProviderDegraded,
  markMessageAsProcessed,
  recordProviderFailure,
  saveHistory,
} from '@/lib/redis';
import {
  getActiveBookingRequest,
  getBotByPhoneNumberId,
  getOrCreateConversation,
  getMemories,
  formatMemoryContext,
  saveLead,
  saveConversationMessage,
  updateConversationIntent,
  upsertBookingRequest,
} from '@/lib/supabase';
import { getOptionalEnv } from '@/lib/env';
import { sendMessage } from '@/lib/whatsapp';
import type {
  BookingRequest,
  Bot,
  ChatMessage,
  Conversation,
  Intent,
  IntentDetection,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildIntentInstructions(intent: Intent): string {
  switch (intent) {
    case 'booking':
      return [
        'FLUJO ACTIVO: AGENDAMIENTO.',
        'Prioriza pedir nombre, servicio requerido y disponibilidad deseada.',
        'Si falta información para cerrar la solicitud, pregunta solo lo mínimo necesario.',
      ].join('\n');
    case 'quote':
      return [
        'FLUJO ACTIVO: COTIZACION.',
        'Prioriza entender qué producto o servicio necesita la persona y cualquier dato esencial para cotizar.',
        'Si el precio exacto no está disponible, ofrece derivar al equipo humano sin inventar valores.',
      ].join('\n');
    case 'lead':
      return [
        'FLUJO ACTIVO: CAPTURA DE LEAD.',
        'Prioriza calificar la necesidad y pedir nombre si todavía no lo tienes.',
      ].join('\n');
    case 'faq':
      return [
        'FLUJO ACTIVO: FAQ.',
        'Responde de forma breve y útil usando solo la información disponible del negocio.',
      ].join('\n');
    default:
      return '';
  }
}

function buildBookingSystemPrompt(bot: Bot, state: {
  customer_name: string | null;
  requested_service: string | null;
  requested_date_text: string | null;
  requested_time_text: string | null;
  missingFields: string[];
}): string {
  const serviceList = bot.services?.map((s) => s.nombre).join(', ') ?? 'consultar directamente';
  const lines = [
    buildSystemPrompt(bot),
    'FLUJO ACTIVO: AGENDAMIENTO.',
    'Estado actual del agendamiento:',
    `- Nombre: ${state.customer_name ?? 'pendiente'}`,
    `- Servicio: ${state.requested_service ?? 'pendiente'} (disponibles: ${serviceList})`,
    `- Fecha: ${state.requested_date_text ?? 'pendiente'}`,
    `- Hora: ${state.requested_time_text ?? 'pendiente'}`,
  ];

  if (state.missingFields.length > 0) {
    lines.push(`Dato faltante a solicitar ahora: ${state.missingFields[0]}`);
    lines.push('Haz UNA sola pregunta para obtener ese dato. Sé breve, cálido y en español chileno.');
  } else {
    lines.push('Todos los datos están completos. Confirma el agendamiento de forma amigable (2 oraciones máx).');
  }
  return lines.join('\n');
}

function buildHandoffReply(businessName: string): string {
  return `Te voy a derivar con el equipo de ${businessName} para que te ayuden directamente. Te contactarán a la brevedad.`;
}

const FALLBACK_REPLY =
  'Estoy teniendo problemas técnicos en este momento. Te contactaremos pronto para ayudarte. Disculpa las molestias.';

const RATE_LIMIT_REPLY =
  'Estoy recibiendo muchos mensajes tuyos. Por favor espera un momento antes de escribir de nuevo.';

// ---------------------------------------------------------------------------
// Shared context passed through the pipeline
// ---------------------------------------------------------------------------

interface MessageContext {
  correlationId: string;
  phoneNumberId: string;
  userPhone: string;
  userText: string;
  messageId: string;
  bot: Bot;
  conversation: Conversation;
  detection: IntentDetection;
  effectiveIntent: Intent;
}

// ---------------------------------------------------------------------------
// Pipeline steps
// ---------------------------------------------------------------------------

async function handleHandoff(ctx: MessageContext): Promise<void> {
  const { bot, conversation, phoneNumberId, userPhone, userText, correlationId, messageId, effectiveIntent } = ctx;

  await saveLead(bot.id, userPhone, 'Cliente solicita humano', userText);

  if (bot.owner_whatsapp) {
    const notification =
      `Nuevo handoff requerido - ${bot.business_name}\n` +
      `Telefono: +${userPhone}\n` +
      `Motivo: ${userText}`;
    await sendMessage(phoneNumberId, bot.owner_whatsapp, notification);
  }

  const reply = buildHandoffReply(bot.business_name);
  await sendMessage(phoneNumberId, userPhone, reply);
  await saveConversationMessage({
    conversationId: conversation.id,
    direction: 'outbound',
    role: 'assistant',
    intent: effectiveIntent,
    content: reply,
  });

  logEvent('info', 'Handoff triggered by rules', {
    correlationId, messageId, phoneNumberId, userPhone,
    botId: bot.id, conversationId: conversation.id,
  });
}

async function handleBooking(
  ctx: MessageContext,
  activeBooking: BookingRequest | null,
  history: ChatMessage[]
): Promise<void> {
  const { bot, conversation, phoneNumberId, userPhone, userText, correlationId, messageId, effectiveIntent } = ctx;

  const bookingFlow = runBookingFlow({ bot, existingBooking: activeBooking, userText });

  // Compute missing fields to give the LLM context about what to ask next.
  const updates = bookingFlow.updates;
  const missingFields: string[] = [];
  if (!updates.customer_name) missingFields.push('nombre del cliente');
  if (!updates.requested_service) missingFields.push('servicio requerido');
  if (!updates.requested_date_text) missingFields.push('fecha deseada');
  if (!updates.requested_time_text) missingFields.push('hora deseada');

  // Use Claude to generate a natural reply; fall back to the template on error.
  let reply = bookingFlow.reply;
  const degraded = await isProviderDegraded('gemini');
  if (!degraded) {
    try {
      const bookingSystemPrompt = buildBookingSystemPrompt(bot, {
        customer_name: updates.customer_name ?? null,
        requested_service: updates.requested_service ?? null,
        requested_date_text: updates.requested_date_text ?? null,
        requested_time_text: updates.requested_time_text ?? null,
        missingFields,
      });
      const result = await chat(bookingSystemPrompt, history);
      if (result.text) {
        reply = result.text;
        await clearProviderFailures('gemini');
      }
    } catch (err) {
      await recordProviderFailure('gemini');
      logEvent('warn', 'Gemini unavailable for booking reply — using template fallback', {
        correlationId, messageId, phoneNumberId, userPhone,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const bookingRequest = await upsertBookingRequest({
    existingBookingId: activeBooking?.id,
    conversationId: conversation.id,
    botId: bot.id,
    userPhone,
    customerName: bookingFlow.updates.customer_name,
    requestedService: bookingFlow.updates.requested_service,
    requestedDateText: bookingFlow.updates.requested_date_text,
    requestedTimeText: bookingFlow.updates.requested_time_text,
    notes: bookingFlow.updates.notes,
    status: bookingFlow.updates.status ?? 'collecting',
  });

  history.push({ role: 'assistant', content: reply });
  await saveHistory(phoneNumberId, userPhone, history);
  await saveConversationMessage({
    conversationId: conversation.id,
    direction: 'outbound',
    role: 'assistant',
    intent: effectiveIntent,
    content: reply,
    metadata: {
      bookingRequestId: bookingRequest.id,
      bookingStatus: bookingRequest.status,
    },
  });
  await sendMessage(phoneNumberId, userPhone, reply);

  if (bookingFlow.shouldNotifyOwner && bot.owner_whatsapp) {
    const notification =
      `Nueva solicitud de agendamiento - ${bot.business_name}\n` +
      `Nombre: ${bookingRequest.customer_name ?? 'Pendiente'}\n` +
      `Servicio: ${bookingRequest.requested_service ?? 'Pendiente'}\n` +
      `Fecha: ${bookingRequest.requested_date_text ?? 'Pendiente'}\n` +
      `Hora: ${bookingRequest.requested_time_text ?? 'Pendiente'}\n` +
      `Telefono: +${userPhone}`;
    await sendMessage(phoneNumberId, bot.owner_whatsapp, notification);
  }

  logEvent('info', 'Booking flow updated', {
    correlationId, messageId, phoneNumberId, userPhone,
    botId: bot.id, conversationId: conversation.id,
    bookingRequestId: bookingRequest.id, bookingStatus: bookingRequest.status,
  });
}

async function sendFallbackReply(ctx: MessageContext, reply: string): Promise<void> {
  const { conversation, phoneNumberId, userPhone, effectiveIntent } = ctx;

  await sendMessage(phoneNumberId, userPhone, reply);
  await saveConversationMessage({
    conversationId: conversation.id,
    direction: 'outbound',
    role: 'system',
    intent: effectiveIntent,
    content: reply,
    metadata: { fallback: true },
  });
}

async function handleLLMFlow(
  ctx: MessageContext,
  history: ChatMessage[]
): Promise<void> {
  const { bot, conversation, phoneNumberId, userPhone, correlationId, messageId, effectiveIntent, detection } = ctx;

  const degraded = await isProviderDegraded('gemini');
  if (degraded) {
    logEvent('warn', 'Circuit breaker open — skipping Gemini API call', {
      correlationId, messageId, phoneNumberId, userPhone,
      botId: bot.id,
    });
    await sendFallbackReply(ctx, FALLBACK_REPLY);
    return;
  }

  try {
    // Inject RAG context and bot memory when available
    const ragEnabled = !!getOptionalEnv('OPENAI_API_KEY');
    const [ragContext, memories] = await Promise.all([
      ragEnabled
        ? retrieveContext(bot.id, ctx.userText).catch(() => '')
        : Promise.resolve(''),
      (async () => {
        const cached = await getCachedBotMemory(bot.id).catch(() => null);
        if (cached) return cached;
        const fresh = await getMemories(bot.id).catch(() => []);
        await setCachedBotMemory(bot.id, fresh).catch(() => {});
        return fresh;
      })(),
    ]);
    const memoryContext = formatMemoryContext(memories);

    const systemPrompt = [
      buildSystemPrompt(bot),
      ragContext ? `CONTEXTO DE BASE DE CONOCIMIENTO:\n${ragContext}` : '',
      memoryContext,
      `INTENCION DETECTADA: ${effectiveIntent}`,
      `CONFIANZA DE CLASIFICACION: ${detection.confidence}`,
      `MOTIVO DE CLASIFICACION: ${detection.reason}`,
      buildIntentInstructions(effectiveIntent),
    ]
      .filter(Boolean)
      .join('\n\n');

    const result = await chat(systemPrompt, history);
    await clearProviderFailures('gemini');

    if (result.leadCapture) {
      const { nombre, motivo } = result.leadCapture;
      await saveLead(bot.id, userPhone, nombre, motivo);

      if (bot.owner_whatsapp) {
        const notification =
          `Nuevo lead - ${bot.business_name}\n` +
          `Nombre: ${nombre}\n` +
          `Telefono: +${userPhone}\n` +
          `Motivo: ${motivo}`;
        await sendMessage(phoneNumberId, bot.owner_whatsapp, notification);
      }

      logEvent('info', 'Lead captured from conversation', {
        correlationId, messageId, phoneNumberId, userPhone,
        botId: bot.id, conversationId: conversation.id,
        leadName: nombre,
      });
    }

    history.push({ role: 'assistant', content: result.text });
    await saveHistory(phoneNumberId, userPhone, history);
    await saveConversationMessage({
      conversationId: conversation.id,
      direction: 'outbound',
      role: 'assistant',
      intent: effectiveIntent,
      content: result.text,
      metadata: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      },
    });
    await sendMessage(phoneNumberId, userPhone, result.text);

    logEvent('info', 'WhatsApp reply sent', {
      correlationId, messageId, phoneNumberId, userPhone,
      botId: bot.id, conversationId: conversation.id,
      intent: effectiveIntent,
    });
  } catch (err) {
    const failCount = await recordProviderFailure('gemini');
    logEvent('error', 'Gemini API call failed, sending fallback reply', {
      correlationId, messageId, phoneNumberId, userPhone,
      botId: bot.id, conversationId: conversation.id,
      error: err instanceof Error ? err.message : String(err),
      consecutiveFailures: failCount,
    });
    await sendFallbackReply(ctx, FALLBACK_REPLY);
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const MAX_USER_TEXT_LENGTH = 2000;

export async function processIncomingMessage(params: {
  correlationId: string;
  phoneNumberId: string;
  userPhone: string;
  userText: string;
  messageId: string;
}): Promise<void> {
  const { correlationId, phoneNumberId, userPhone, messageId } = params;
  // Hard-truncate user input to prevent token exhaustion and DB bloat.
  const userText = params.userText.slice(0, MAX_USER_TEXT_LENGTH);

  // Step 1: Acquire a short-lived processing lock (30s) to guard against concurrent
  // duplicate deliveries from Meta. This is separate from the permanent dedup key.
  const lockAcquired = await acquireMessageLock(phoneNumberId, messageId);
  if (!lockAcquired) {
    logEvent('info', 'Message processing lock held by another worker — skipping', {
      correlationId, messageId, phoneNumberId, userPhone,
    });
    return;
  }

  // Step 2: Check if already permanently processed (successful previous run).
  if (await isMessageProcessed(phoneNumberId, messageId)) {
    logEvent('info', 'Duplicate WhatsApp message ignored', {
      correlationId, messageId, phoneNumberId, userPhone,
    });
    return;
  }

  const withinLimit = await checkRateLimit(phoneNumberId, userPhone);
  if (!withinLimit) {
    logEvent('warn', 'Rate limit exceeded for user', {
      correlationId, messageId, phoneNumberId, userPhone,
    });
    await sendMessage(phoneNumberId, userPhone, RATE_LIMIT_REPLY);
    // Mark processed so rate-limited messages aren't retried endlessly.
    await markMessageAsProcessed(phoneNumberId, messageId);
    return;
  }

  // Bot config — served from Redis cache (60s TTL) to avoid a DB hit per message.
  let bot = await getCachedBot(phoneNumberId).catch(() => null);
  if (!bot) {
    bot = await getBotByPhoneNumberId(phoneNumberId);
    if (bot) await setCachedBot(phoneNumberId, bot).catch(() => {});
  }
  if (!bot) {
    logEvent('warn', 'No bot configured for incoming phone_number_id', {
      correlationId, messageId, phoneNumberId, userPhone,
    });
    return;
  }

  const keywordDetection = detectIntent(userText);
  const detection: IntentDetection =
    keywordDetection.confidence === 'low'
      ? (await classifyIntent(userText, bot.business_type)) ?? keywordDetection
      : keywordDetection;
  const conversation = await getOrCreateConversation(bot.id, userPhone, detection.intent);
  const activeBooking = await getActiveBookingRequest(conversation.id);
  const effectiveIntent: Intent =
    activeBooking && detection.intent !== 'handoff' ? 'booking' : detection.intent;

  if (effectiveIntent !== detection.intent) {
    await updateConversationIntent(conversation.id, effectiveIntent);
  }

  await saveConversationMessage({
    conversationId: conversation.id,
    whatsappMessageId: messageId,
    direction: 'inbound',
    role: 'user',
    intent: effectiveIntent,
    content: userText,
    metadata: {
      detectedIntent: detection.intent,
      confidence: detection.confidence,
      reason: detection.reason,
    },
  });

  logEvent('info', 'Incoming WhatsApp message classified', {
    correlationId, messageId, phoneNumberId, userPhone,
    botId: bot.id, conversationId: conversation.id,
    intent: effectiveIntent, confidence: detection.confidence,
  });

  // Check if the effective intent is enabled for this bot
  const flowEnabled = bot.enabled_flows?.[effectiveIntent] !== false;
  if (!flowEnabled) {
    const disabledReply = 'Este servicio no está disponible en este momento.';
    await sendMessage(phoneNumberId, userPhone, disabledReply);
    await saveConversationMessage({
      conversationId: conversation.id,
      direction: 'outbound',
      role: 'system',
      intent: effectiveIntent,
      content: disabledReply,
      metadata: { flowDisabled: true },
    });
    logEvent('info', 'Flow disabled — skipped', {
      correlationId, messageId, phoneNumberId, userPhone,
      botId: bot.id, conversationId: conversation.id, intent: effectiveIntent,
    });
    return;
  }

  const ctx: MessageContext = {
    correlationId, phoneNumberId, userPhone, userText, messageId,
    bot, conversation, detection, effectiveIntent,
  };

  if (effectiveIntent === 'handoff') {
    await handleHandoff(ctx);
    await markMessageAsProcessed(phoneNumberId, messageId);
    return;
  }

  const history = await getHistory(phoneNumberId, userPhone);
  history.push({ role: 'user', content: userText });

  if (effectiveIntent === 'booking') {
    await handleBooking(ctx, activeBooking, history);
    await markMessageAsProcessed(phoneNumberId, messageId);
    return;
  }

  await handleLLMFlow(ctx, history);
  // Mark permanently processed only after full successful completion so that
  // failures (LLM down, DB error, etc.) allow Meta's webhook retry to re-run.
  await markMessageAsProcessed(phoneNumberId, messageId);
}
