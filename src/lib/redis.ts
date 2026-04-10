import { Redis } from '@upstash/redis';
import { createHash } from 'crypto';
import { env } from './env';
import type { Bot, BotMemory, ChatMessage } from './types';

let redis: Redis | null = null;

const SESSION_TTL_SECONDS = 60 * 60 * 24; // 24 hours
const MAX_HISTORY = 20;
const MESSAGE_DEDUPE_TTL_SECONDS = 60 * 60 * 48; // 48 hours

const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_MESSAGES = 10;

const BOT_RATE_LIMIT_WINDOW_SECONDS = 60;
const BOT_RATE_LIMIT_MAX_MESSAGES = 200;

const CIRCUIT_BREAKER_TTL_SECONDS = 60;
const CIRCUIT_BREAKER_THRESHOLD = 3;

const BOT_MEMORY_CACHE_TTL = 120; // 2 minutes
const EMBEDDING_CACHE_TTL = 600;  // 10 minutes
const BOT_CONFIG_CACHE_TTL = 60;  // 1 minute
const MESSAGE_LOCK_TTL_SECONDS = 30; // processing lock expires if worker crashes
const CONVERSATION_LOCK_TTL_SECONDS = 25; // slightly longer than Gemini timeout; serializes concurrent messages from same user

function key(phoneNumberId: string, userPhone: string): string {
  return `conv:${phoneNumberId}:${userPhone}`;
}

function messageKey(phoneNumberId: string, messageId: string): string {
  return `msg:${phoneNumberId}:${messageId}`;
}

function rateLimitKey(phoneNumberId: string, userPhone: string): string {
  return `rl:${phoneNumberId}:${userPhone}`;
}

function botRateLimitKey(phoneNumberId: string): string {
  return `rl:bot:${phoneNumberId}`;
}

function circuitBreakerKey(provider: string): string {
  return `cb:fail:${provider}`;
}

function botMemoryKey(botId: string): string {
  return `botmem:${botId}`;
}

function embeddingKey(botId: string, query: string): string {
  const hash = createHash('sha256').update(query).digest('hex').slice(0, 16);
  return `emb:${botId}:${hash}`;
}

function botConfigKey(phoneNumberId: string): string {
  return `botcfg:${phoneNumberId}`;
}

function messageLockKey(phoneNumberId: string, messageId: string): string {
  return `lock:msg:${phoneNumberId}:${messageId}`;
}

function conversationLockKey(phoneNumberId: string, userPhone: string): string {
  return `lock:conv:${phoneNumberId}:${userPhone}`;
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

/**
 * Acquire a short-lived processing lock (30s) to prevent concurrent duplicate processing.
 * Returns true if this worker won the lock, false if another worker is already processing.
 */
export async function acquireMessageLock(
  phoneNumberId: string,
  messageId: string
): Promise<boolean> {
  const result = await getRedisClient().set(
    messageLockKey(phoneNumberId, messageId),
    '1',
    { nx: true, ex: MESSAGE_LOCK_TTL_SECONDS }
  );
  return result === 'OK';
}

/**
 * Acquire a per-conversation lock to serialize concurrent messages from the same user.
 * Prevents the history read → AI call → history write race when two messages arrive
 * within the same AI processing window (~15s). TTL auto-releases the lock if the
 * worker is killed before an explicit release.
 */
export async function acquireConversationLock(
  phoneNumberId: string,
  userPhone: string
): Promise<boolean> {
  const result = await getRedisClient().set(
    conversationLockKey(phoneNumberId, userPhone),
    '1',
    { nx: true, ex: CONVERSATION_LOCK_TTL_SECONDS }
  );
  return result === 'OK';
}

export async function releaseConversationLock(
  phoneNumberId: string,
  userPhone: string
): Promise<void> {
  await getRedisClient().del(conversationLockKey(phoneNumberId, userPhone));
}

/**
 * Check if a message has already been permanently processed (48h dedup window).
 */
export async function isMessageProcessed(
  phoneNumberId: string,
  messageId: string
): Promise<boolean> {
  const val = await getRedisClient().get(messageKey(phoneNumberId, messageId));
  return val !== null;
}

/**
 * Permanently mark a message as processed. Call only after successful completion
 * so that failed processing can be retried when Meta resends the webhook.
 */
export async function markMessageAsProcessed(
  phoneNumberId: string,
  messageId: string
): Promise<void> {
  await getRedisClient().set(messageKey(phoneNumberId, messageId), '1', {
    ex: MESSAGE_DEDUPE_TTL_SECONDS,
  });
}

// ---------------------------------------------------------------------------
// Per-user rate limiting (sliding window counter)
// ---------------------------------------------------------------------------

export async function checkRateLimit(
  phoneNumberId: string,
  userPhone: string
): Promise<boolean> {
  const k = rateLimitKey(phoneNumberId, userPhone);
  // Atomic Lua: INCR + EXPIRE in a single round-trip. Without this, a crash between
  // the two commands leaves a key with no TTL — permanently locking out the user.
  const count = await getRedisClient().eval(
    `local c = redis.call('INCR', KEYS[1])
     if tonumber(c) == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
     return c`,
    [k],
    [String(RATE_LIMIT_WINDOW_SECONDS)]
  ) as number;
  return count <= RATE_LIMIT_MAX_MESSAGES;
}

/**
 * Global per-bot rate limit (sliding window). Checked before the per-user limit
 * to bound total Gemini API spend per bot per minute regardless of how many
 * distinct users are writing simultaneously.
 */
export async function checkBotRateLimit(phoneNumberId: string): Promise<boolean> {
  const k = botRateLimitKey(phoneNumberId);
  const count = await getRedisClient().eval(
    `local c = redis.call('INCR', KEYS[1])
     if tonumber(c) == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
     return c`,
    [k],
    [String(BOT_RATE_LIMIT_WINDOW_SECONDS)]
  ) as number;
  return count <= BOT_RATE_LIMIT_MAX_MESSAGES;
}

// ---------------------------------------------------------------------------
// Circuit breaker for external providers
// ---------------------------------------------------------------------------

export async function recordProviderFailure(provider: string): Promise<number> {
  const k = circuitBreakerKey(provider);
  const count = await getRedisClient().eval(
    `local c = redis.call('INCR', KEYS[1])
     if tonumber(c) == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
     return c`,
    [k],
    [String(CIRCUIT_BREAKER_TTL_SECONDS)]
  ) as number;
  return count;
}

export async function isProviderDegraded(provider: string): Promise<boolean> {
  const count = await getRedisClient().get<number>(circuitBreakerKey(provider));
  return (count ?? 0) >= CIRCUIT_BREAKER_THRESHOLD;
}

export async function clearProviderFailures(provider: string): Promise<void> {
  await getRedisClient().del(circuitBreakerKey(provider));
}

// ---------------------------------------------------------------------------
// Bot memory cache (TTL: 2 min) — invalidated on every write/delete
// ---------------------------------------------------------------------------

export async function getCachedBotMemory(botId: string): Promise<BotMemory[] | null> {
  return getRedisClient().get<BotMemory[]>(botMemoryKey(botId));
}

export async function setCachedBotMemory(botId: string, memories: BotMemory[]): Promise<void> {
  await getRedisClient().setex(botMemoryKey(botId), BOT_MEMORY_CACHE_TTL, memories);
}

export async function invalidateBotMemoryCache(botId: string): Promise<void> {
  await getRedisClient().del(botMemoryKey(botId));
}

// ---------------------------------------------------------------------------
// Embedding cache (TTL: 10 min) — embeddings are deterministic per query
// ---------------------------------------------------------------------------

export async function getCachedEmbedding(botId: string, query: string): Promise<number[] | null> {
  return getRedisClient().get<number[]>(embeddingKey(botId, query));
}

export async function setCachedEmbedding(
  botId: string,
  query: string,
  embedding: number[]
): Promise<void> {
  await getRedisClient().setex(embeddingKey(botId, query), EMBEDDING_CACHE_TTL, embedding);
}

// ---------------------------------------------------------------------------
// Bot config cache (TTL: 1 min) — avoids a DB hit on every inbound message
// ---------------------------------------------------------------------------

export async function getCachedBot(phoneNumberId: string): Promise<Bot | null> {
  return getRedisClient().get<Bot>(botConfigKey(phoneNumberId));
}

export async function setCachedBot(phoneNumberId: string, bot: Bot): Promise<void> {
  await getRedisClient().setex(botConfigKey(phoneNumberId), BOT_CONFIG_CACHE_TTL, bot);
}
