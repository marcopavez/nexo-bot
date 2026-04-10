import { randomUUID } from 'crypto';
import { after } from 'next/server';
import { NextRequest, NextResponse } from 'next/server';
import { env, validateEnv } from '@/lib/env';
import { logEvent } from '@/lib/logger';
import { processIncomingMessage } from '@/lib/orchestrator';
import { verifySignature, parseWebhookPayload } from '@/lib/whatsapp';

// Validate all required env vars at cold-start so a missing secret fails on the
// first request to this route, not buried inside message processing logic.
validateEnv();

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
  const correlationId = randomUUID();
  const rawBody = await req.text();

  // Guard against unexpectedly large bodies before doing any HMAC work.
  // Legitimate Meta webhook payloads are well under 64 KB.
  if (rawBody.length > 65_536) {
    return new NextResponse('Payload Too Large', { status: 413 });
  }

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

  // Schedule processing after the response is sent. This decouples Meta's 20s response
  // SLA from AI processing time (up to ~20s), preventing retry storms when the AI is slow.
  // `after` keeps the Vercel function alive until the work completes (no detached promises).
  after(
    processIncomingMessage({ correlationId, phoneNumberId, userPhone, userText: text, messageId })
      .catch((err) => {
        logEvent('error', 'Unhandled error while processing WhatsApp message', {
          correlationId,
          messageId,
          phoneNumberId,
          userPhone,
          error: err instanceof Error ? err.message : String(err),
        });
      })
  );

  return NextResponse.json({ status: 'ok' });
}
