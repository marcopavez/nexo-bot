import { getSupabaseClient } from './client';
import type { BotMemory } from '../types';

const BOT_MEMORY_LIMIT = 30;

/** Used by the admin panel — no Redis caching, always fresh. */
export async function listBotMemory(botId: string): Promise<BotMemory[]> {
  const { data, error } = await getSupabaseClient()
    .from('bot_memory')
    .select('*')
    .eq('bot_id', botId)
    .order('key')
    .limit(BOT_MEMORY_LIMIT);

  if (error) throw new Error(`Failed to list bot memory: ${error.message}`);
  return (data ?? []) as BotMemory[];
}

/** Used by the orchestrator — caller is responsible for Redis cache invalidation on writes. */
export async function getMemories(botId: string): Promise<BotMemory[]> {
  const { data, error } = await getSupabaseClient()
    .from('bot_memory')
    .select('*')
    .eq('bot_id', botId)
    .order('key')
    .limit(BOT_MEMORY_LIMIT);

  if (error) throw new Error(`Failed to load bot memory: ${error.message}`);
  return (data ?? []) as BotMemory[];
}

/** Does NOT invalidate Redis cache — callers must call invalidateBotMemoryCache() after. */
export async function upsertBotMemory(params: {
  botId: string;
  key: string;
  value: string;
  source?: BotMemory['source'];
}): Promise<BotMemory> {
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseClient()
    .from('bot_memory')
    .upsert(
      {
        bot_id: params.botId,
        key: params.key,
        value: params.value,
        source: params.source ?? 'manual',
        updated_at: now,
      },
      { onConflict: 'bot_id,key' }
    )
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to upsert bot memory: ${error?.message ?? 'unknown error'}`);
  }
  return data as BotMemory;
}

/** Does NOT invalidate Redis cache — callers must call invalidateBotMemoryCache() after. */
export async function deleteBotMemory(memoryId: string, botId: string): Promise<void> {
  // Filter by both id AND bot_id to prevent IDOR.
  const { error } = await getSupabaseClient()
    .from('bot_memory')
    .delete()
    .eq('id', memoryId)
    .eq('bot_id', botId);

  if (error) throw new Error(`Failed to delete bot memory: ${error.message}`);
}

export function formatMemoryContext(memories: BotMemory[]): string {
  if (memories.length === 0) return '';
  const lines = memories.map((m) => `- ${m.key}: ${m.value}`).join('\n');
  return `MEMORIA DEL NEGOCIO:\n${lines}`;
}
