import { getSupabaseClient } from './client';
import type { Intent, Message } from '../types';

export async function saveConversationMessage(params: {
  conversationId: string;
  whatsappMessageId?: string | null;
  direction: 'inbound' | 'outbound';
  role: 'user' | 'assistant' | 'system';
  intent: Intent | null;
  content: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await getSupabaseClient().from('messages').insert({
    conversation_id: params.conversationId,
    whatsapp_message_id: params.whatsappMessageId ?? null,
    direction: params.direction,
    role: params.role,
    intent: params.intent,
    content: params.content,
    metadata: params.metadata ?? null,
  });

  if (error) throw new Error(`Failed to save message: ${error.message}`);
}

export async function listMessages(
  conversationId: string,
  limit: number = 100,
  offset: number = 0
): Promise<Message[]> {
  const { data, error } = await getSupabaseClient()
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at')
    .range(offset, offset + limit - 1);

  if (error) throw new Error(`Failed to list messages: ${error.message}`);
  return (data ?? []) as Message[];
}
