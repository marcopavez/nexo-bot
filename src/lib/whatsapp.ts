import { createHmac, timingSafeEqual } from 'crypto';
import { env } from './env';

const GRAPH_API_VERSION = 'v21.0';

/**
 * Send a WhatsApp text message and return the wamid (Meta's outbound message ID).
 * The wamid can be stored alongside the saved message record for delivery tracking.
 */
export async function sendMessage(phoneNumberId: string, to: string, text: string): Promise<string | null> {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.META_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`WhatsApp API error ${res.status}: ${error}`);
  }

  const data = await res.json() as { messages?: Array<{ id: string }> };
  return data.messages?.[0]?.id ?? null;
}

export function verifySignature(rawBody: string, signature: string): boolean {
  const expected = `sha256=${createHmac('sha256', env.META_APP_SECRET).update(rawBody).digest('hex')}`;

  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

// Extract the first text message from Meta's webhook payload
export interface IncomingMessage {
  phoneNumberId: string;
  userPhone: string;
  text: string;
  messageId: string;
}

export function parseWebhookPayload(body: Record<string, unknown>): IncomingMessage | null {
  try {
    const entry = (body.entry as Record<string, unknown>[])?.[0];
    const change = (entry?.changes as Record<string, unknown>[])?.[0];
    const value = change?.value as Record<string, unknown>;
    const messages = value?.messages as Record<string, unknown>[];
    const message = messages?.[0];

    if (!message || message.type !== 'text') return null;

    return {
      phoneNumberId: (value.metadata as Record<string, unknown>).phone_number_id as string,
      userPhone: message.from as string,
      text: (message.text as Record<string, unknown>).body as string,
      messageId: message.id as string,
    };
  } catch {
    return null;
  }
}
