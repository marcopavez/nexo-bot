import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { logEvent } from '@/lib/logger';
import { processIncomingMessage } from '@/lib/orchestrator';
import { verifySignature, parseWebhookPayload } from '@/lib/whatsapp';

// GET — Meta webhook verification handshake
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);

  if (
    searchParams.get('hub.mode') === 'subscribe' &&
    searchParams.get('hub.verify_token') === env.WEBHOOK_VERIFY_TOKEN
  ) {
    return new NextResponse(searchParams.get('hub.challenge'), { status: 200 });
  }

  return new NextResponse('Forbidden', { status: 403 });
}

// POST — receive WhatsApp messages
export async function POST(req: NextRequest): Promise<NextResponse> {
  // Always respond 200 quickly — Meta retries if it doesn't get 200 within 20s
  const correlationId = randomUUID();
  const rawBody = await req.text();
  const signature = req.headers.get('x-hub-signature-256') ?? '';

  if (!verifySignature(rawBody, signature)) {
    logEvent('warn', 'Rejected WhatsApp webhook with invalid signature', {
      correlationId,
    });
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const body = JSON.parse(rawBody) as Record<string, unknown>;
  const incoming = parseWebhookPayload(body);

  // Ignore non-text messages, status updates, etc.
  if (!incoming) {
    return NextResponse.json({ status: 'ok' });
  }

  const { phoneNumberId, userPhone, text } = incoming;
  const { messageId } = incoming;

  // Process asynchronously so we can return 200 immediately
  processIncomingMessage({
    correlationId,
    phoneNumberId,
    userPhone,
    userText: text,
    messageId,
  }).catch((err) => {
    logEvent('error', 'Unhandled error while processing WhatsApp message', {
      correlationId,
      messageId,
      phoneNumberId,
      userPhone,
      error: err instanceof Error ? err.message : String(err),
    });
  });

  return NextResponse.json({ status: 'ok' });
}
