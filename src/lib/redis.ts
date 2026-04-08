import { Redis } from '@upstash/redis';
import type { ChatMessage } from './types';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const SESSION_TTL_SECONDS = 60 * 60 * 24; // 24 hours
const MAX_HISTORY = 20; // keep last 20 messages to stay within token limits

function key(phoneNumberId: string, userPhone: string): string {
  return `conv:${phoneNumberId}:${userPhone}`;
}

export async function getHistory(phoneNumberId: string, userPhone: string): Promise<ChatMessage[]> {
  const messages = await redis.get<ChatMessage[]>(key(phoneNumberId, userPhone));
  return messages ?? [];
}

export async function saveHistory(
  phoneNumberId: string,
  userPhone: string,
  messages: ChatMessage[]
): Promise<void> {
  const trimmed = messages.slice(-MAX_HISTORY);
  await redis.setex(key(phoneNumberId, userPhone), SESSION_TTL_SECONDS, trimmed);
}
