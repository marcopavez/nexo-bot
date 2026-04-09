import { runBookingFlow } from '@/lib/booking';
import { chat, classifyIntent } from '@/lib/claude';
import { detectIntent } from '@/lib/intents';
import { logEvent } from '@/lib/logger';
import { buildSystemPrompt } from '@/lib/prompts';
import {
  checkRateLimit,
  clearProviderFailures,
  getHistory,
  isProviderDegraded,
  markMessageAsProcessed,
  recordProviderFailure,
  saveHistory,
} from '@/lib/redis';
import {
  getActiveBookingRequest,
  getBotByPhoneNumberId,
  getOrCreateConversation,
  saveLead,
  saveConversationMessage,
  updateConversationIntent,
  upsertBookingRequest,
} from '@/lib/supabase';
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

  history.push({ role: 'assistant', content: bookingFlow.reply });
  await saveHistory(phoneNumberId, userPhone, history);
  await saveConversationMessage({
    conversationId: conversation.id,
    direction: 'outbound',
    role: 'assistant',
    intent: effectiveIntent,
    content: bookingFlow.reply,
    metadata: {
      bookingRequestId: bookingRequest.id,
      bookingStatus: bookingRequest.status,
    },
  });
  await sendMessage(phoneNumberId, userPhone, bookingFlow.reply);

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

  const degraded = await isProviderDegraded('anthropic');
  if (degraded) {
    logEvent('warn', 'Circuit breaker open — skipping Claude API call', {
      correlationId, messageId, phoneNumberId, userPhone,
      botId: bot.id,
    });
    await sendFallbackReply(ctx, FALLBACK_REPLY);
    return;
  }

  try {
    const systemPrompt = [
      buildSystemPrompt(bot),
      `INTENCION DETECTADA: ${effectiveIntent}`,
      `CONFIANZA DE CLASIFICACION: ${detection.confidence}`,
      `MOTIVO DE CLASIFICACION: ${detection.reason}`,
      buildIntentInstructions(effectiveIntent),
    ]
      .filter(Boolean)
      .join('\n\n');

    const result = await chat(systemPrompt, history);
    await clearProviderFailures('anthropic');

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
    const failCount = await recordProviderFailure('anthropic');
    logEvent('error', 'Claude API call failed, sending fallback reply', {
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

export async function processIncomingMessage(params: {
  correlationId: string;
  phoneNumberId: string;
  userPhone: string;
  userText: string;
  messageId: string;
}): Promise<void> {
  const { correlationId, phoneNumberId, userPhone, userText, messageId } = params;

  const accepted = await markMessageAsProcessed(phoneNumberId, messageId);
  if (!accepted) {
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
    return;
  }

  const bot = await getBotByPhoneNumberId(phoneNumberId);
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

  const ctx: MessageContext = {
    correlationId, phoneNumberId, userPhone, userText, messageId,
    bot, conversation, detection, effectiveIntent,
  };

  if (effectiveIntent === 'handoff') {
    await handleHandoff(ctx);
    return;
  }

  const history = await getHistory(phoneNumberId, userPhone);
  history.push({ role: 'user', content: userText });

  if (effectiveIntent === 'booking') {
    await handleBooking(ctx, activeBooking, history);
    return;
  }

  await handleLLMFlow(ctx, history);
}
