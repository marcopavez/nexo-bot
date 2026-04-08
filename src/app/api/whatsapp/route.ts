import { NextRequest, NextResponse } from 'next/server';
import { verifySignature, parseWebhookPayload, sendMessage } from '@/lib/whatsapp';
import { chat } from '@/lib/claude';
import { getHistory, saveHistory } from '@/lib/redis';
import { getBotByPhoneNumberId, saveLead } from '@/lib/supabase';
import { buildSystemPrompt } from '@/lib/prompts';

// Regex to extract the lead token Claude embeds in its reply
const LEAD_REGEX = /\[LEAD:nombre="([^"]+)",motivo="([^"]+)"\]/;

// GET — Meta webhook verification handshake
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);

  if (
    searchParams.get('hub.mode') === 'subscribe' &&
    searchParams.get('hub.verify_token') === process.env.WEBHOOK_VERIFY_TOKEN
  ) {
    return new NextResponse(searchParams.get('hub.challenge'), { status: 200 });
  }

  return new NextResponse('Forbidden', { status: 403 });
}

// POST — receive WhatsApp messages
export async function POST(req: NextRequest): Promise<NextResponse> {
  // Always respond 200 quickly — Meta retries if it doesn't get 200 within 20s
  const rawBody = await req.text();
  const signature = req.headers.get('x-hub-signature-256') ?? '';

  if (!verifySignature(rawBody, signature)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const body = JSON.parse(rawBody) as Record<string, unknown>;
  const incoming = parseWebhookPayload(body);

  // Ignore non-text messages, status updates, etc.
  if (!incoming) {
    return NextResponse.json({ status: 'ok' });
  }

  const { phoneNumberId, userPhone, text } = incoming;

  // Process asynchronously so we can return 200 immediately
  processMessage(phoneNumberId, userPhone, text).catch((err) => {
    console.error('[nexo-bot] processMessage error:', err);
  });

  return NextResponse.json({ status: 'ok' });
}

async function processMessage(
  phoneNumberId: string,
  userPhone: string,
  userText: string
): Promise<void> {
  // Load bot configuration for this WhatsApp number
  const bot = await getBotByPhoneNumberId(phoneNumberId);
  if (!bot) {
    console.warn(`[nexo-bot] No bot configured for phone_number_id=${phoneNumberId}`);
    return;
  }

  // Load conversation history and append new user message
  const history = await getHistory(phoneNumberId, userPhone);
  history.push({ role: 'user', content: userText });

  // Ask Claude
  const systemPrompt = buildSystemPrompt(bot);
  const rawReply = await chat(systemPrompt, history);

  // Extract and strip lead token if present
  const leadMatch = rawReply.match(LEAD_REGEX);
  const cleanReply = rawReply.replace(LEAD_REGEX, '').trim();

  if (leadMatch) {
    const [, name, motivo] = leadMatch;

    // Persist lead
    await saveLead(bot.id, userPhone, name, motivo);

    // Notify business owner via WhatsApp
    if (bot.owner_whatsapp) {
      const notification =
        `🔔 *Nuevo lead — ${bot.business_name}*\n` +
        `👤 Nombre: ${name}\n` +
        `📱 Teléfono: +${userPhone}\n` +
        `💬 Motivo: ${motivo}`;
      await sendMessage(phoneNumberId, bot.owner_whatsapp, notification);
    }
  }

  // Persist updated history
  history.push({ role: 'assistant', content: cleanReply });
  await saveHistory(phoneNumberId, userPhone, history);

  // Reply to user
  await sendMessage(phoneNumberId, userPhone, cleanReply);
}
