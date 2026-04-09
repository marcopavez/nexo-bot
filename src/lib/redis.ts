import { Redis } from '@upstash/redis';
import { env } from './env';
import type { ChatMessage } from './types';

let redis: Redis | null = null;

const SESSION_TTL_SECONDS = 60 * 60 * 24; // 24 hours
const MAX_HISTORY = 20; // keep last 20 messages to stay within token limits
const MESSAGE_DEDUPE_TTL_SECONDS = 60 * 60 * 48; // 48 hours

const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_MESSAGES = 10;

const CIRCUIT_BREAKER_TTL_SECONDS = 60;
const CIRCUIT_BREAKER_THRESHOLD = 3;

function key(phoneNumberId: string, userPhone: string): string {
  return `conv:${phoneNumberId}:${userPhone}`;
}

function messageKey(phoneNumberId: string, messageId: string): string {
  return `msg:${phoneNumberId}:${messageId}`;
}

function rateLimitKey(phoneNumberId: string, userPhone: string): string {
  return `rl:${phoneNumberId}:${userPhone}`;
}

function circuitBreakerKey(provider: string): string {
  return `cb:fail:${provider}`;
}

function getRedisClient(): Redis {
  if (!redis) {
    redis = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });
  }

  return redis;
}

export async function getHistory(phoneNumberId: string, userPhone: string): Promise<ChatMessage[]> {
  const messages = await getRedisClient().get<ChatMessage[]>(key(phoneNumberId, userPhone));
  return messages ?? [];
}

export async function saveHistory(
  phoneNumberId: string,
  userPhone: string,
  messages: ChatMessage[]
): Promise<void> {
  const trimmed = messages.slice(-MAX_HISTORY);
  await getRedisClient().setex(key(phoneNumberId, userPhone), SESSION_TTL_SECONDS, trimmed);
}

export async function markMessageAsProcessed(
  phoneNumberId: string,
  messageId: string
): Promise<boolean> {
  const result = await getRedisClient().set(messageKey(phoneNumberId, messageId), '1', {
    nx: true,
    ex: MESSAGE_DEDUPE_TTL_SECONDS,
  });

  return result === 'OK';
}

// ---------------------------------------------------------------------------
// Per-user rate limiting (sliding window counter)
// ---------------------------------------------------------------------------

export async function checkRateLimit(
  phoneNumberId: string,
  userPhone: string
): Promise<boolean> {
  const k = rateLimitKey(phoneNumberId, userPhone);
  const client = getRedisClient();
  const count = await client.incr(k);
  if (count === 1) {
    await client.expire(k, RATE_LIMIT_WINDOW_SECONDS);
  }
  return count <= RATE_LIMIT_MAX_MESSAGES;
}

// ---------------------------------------------------------------------------
// Circuit breaker for external providers
// ---------------------------------------------------------------------------

export async function recordProviderFailure(provider: string): Promise<number> {
  const k = circuitBreakerKey(provider);
  const client = getRedisClient();
  const count = await client.incr(k);
  if (count === 1) {
    await client.expire(k, CIRCUIT_BREAKER_TTL_SECONDS);
  }
  return count;
}

export async function isProviderDegraded(provider: string): Promise<boolean> {
  const count = await getRedisClient().get<number>(circuitBreakerKey(provider));
  return (count ?? 0) >= CIRCUIT_BREAKER_THRESHOLD;
}

export async function clearProviderFailures(provider: string): Promise<void> {
  await getRedisClient().del(circuitBreakerKey(provider));
}
