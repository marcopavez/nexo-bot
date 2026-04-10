import { getSupabaseClient } from './client';
import type { Conversation, Intent } from '../types';

export async function getOrCreateConversation(
  botId: string,
  userPhone: string,
  initialIntent: Intent | null
): Promise<Conversation> {
  const now = new Date().toISOString();

  const { data: existing } = await getSupabaseClient()
    .from('conversations')
    .select('*')
    .eq('bot_id', botId)
    .eq('user_phone', userPhone)
    .maybeSingle();

  if (existing) {
    const { data, error } = await getSupabaseClient()
      .from('conversations')
      .update({ last_message_at: now, updated_at: now, status: 'open' })
      .eq('id', (existing as Conversation).id)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to update conversation: ${error?.message ?? 'unknown error'}`);
    }
    return data as Conversation;
  }

  const { data, error } = await getSupabaseClient()
    .from('conversations')
    .insert({
      bot_id: botId,
      user_phone: userPhone,
      current_intent: initialIntent,
      status: 'open',
      last_message_at: now,
      updated_at: now,
    })
    .select('*')
    .single();

  if (error || !data) {
    // Race condition: another concurrent request created the row — fetch it.
    const { data: raceData, error: raceError } = await getSupabaseClient()
      .from('conversations')
      .select('*')
      .eq('bot_id', botId)
      .eq('user_phone', userPhone)
      .single();

    if (raceError || !raceData) {
      throw new Error(`Failed to create conversation: ${error?.message ?? 'unknown error'}`);
    }
    return raceData as Conversation;
  }

  return data as Conversation;
}

export async function updateConversationIntent(
  conversationId: string,
  currentIntent: Intent
): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('conversations')
    .update({
      current_intent: currentIntent,
      updated_at: new Date().toISOString(),
      last_message_at: new Date().toISOString(),
    })
    .eq('id', conversationId);

  if (error) throw new Error(`Failed to update conversation intent: ${error.message}`);
}

export async function getConversation(conversationId: string): Promise<Conversation | null> {
  const { data, error } = await getSupabaseClient()
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .single();

  if (error) return null;
  return data as Conversation;
}

export async function listConversations(
  botId: string,
  page: number = 1,
  pageSize: number = 20
): Promise<{ conversations: Conversation[]; total: number }> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await getSupabaseClient()
    .from('conversations')
    .select('*', { count: 'exact' })
    .eq('bot_id', botId)
    .order('last_message_at', { ascending: false })
    .range(from, to);

  if (error) throw new Error(`Failed to list conversations: ${error.message}`);
  return { conversations: (data ?? []) as Conversation[], total: count ?? 0 };
}

export async function labelConversationIntent(
  conversationId: string,
  intent: Intent
): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('conversations')
    .update({ current_intent: intent, updated_at: new Date().toISOString() })
    .eq('id', conversationId);

  if (error) throw new Error(`Failed to label conversation intent: ${error.message}`);
}

export async function updateConversationStatus(
  conversationId: string,
  status: 'open' | 'closed'
): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('conversations')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', conversationId);

  if (error) throw new Error(`Failed to update conversation status: ${error.message}`);
}
