import { createClient } from '@supabase/supabase-js';
import { env } from './env';
import type {
  BookingRequest,
  Bot,
  BotMemory,
  Conversation,
  DocumentVersion,
  Intent,
  KnowledgeBaseDocument,
  Message,
} from './types';

let supabase: ReturnType<typeof createClient<any>> | null = null;

export function getSupabaseClient() {
  if (!supabase) {
    supabase = createClient<any>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return supabase;
}

export async function getBotByPhoneNumberId(phoneNumberId: string): Promise<Bot | null> {
  const { data, error } = await getSupabaseClient()
    .from('bots')
    .select('*')
    .eq('phone_number_id', phoneNumberId)
    .single();

  if (error || !data) return null;
  return data as Bot;
}

export async function saveLead(
  botId: string,
  userPhone: string,
  name: string,
  motivo: string
): Promise<void> {
  await getSupabaseClient().from('leads').insert({
    bot_id: botId,
    user_phone: userPhone,
    name,
    message: motivo,
  });
}

export async function getOrCreateConversation(
  botId: string,
  userPhone: string,
  initialIntent: Intent | null
): Promise<Conversation> {
  const now = new Date().toISOString();

  // Try to fetch the existing conversation first so we don't overwrite current_intent.
  // The orchestrator owns intent transitions and calls updateConversationIntent explicitly.
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

  // Insert new conversation with the detected intent as the initial value.
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

  if (error) {
    throw new Error(`Failed to update conversation intent: ${error.message}`);
  }
}

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

  if (error) {
    throw new Error(`Failed to save message: ${error.message}`);
  }
}

export async function getActiveBookingRequest(
  conversationId: string
): Promise<BookingRequest | null> {
  const { data, error } = await getSupabaseClient()
    .from('booking_requests')
    .select('*')
    .eq('conversation_id', conversationId)
    .in('status', ['collecting', 'pending_confirmation'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load booking request: ${error.message}`);
  }

  return (data as BookingRequest | null) ?? null;
}

export async function upsertBookingRequest(params: {
  existingBookingId?: string;
  conversationId: string;
  botId: string;
  userPhone: string;
  customerName?: string | null;
  requestedService?: string | null;
  requestedDateText?: string | null;
  requestedTimeText?: string | null;
  notes?: string | null;
  status: BookingRequest['status'];
}): Promise<BookingRequest> {
  const payload = {
    conversation_id: params.conversationId,
    bot_id: params.botId,
    user_phone: params.userPhone,
    customer_name: params.customerName ?? null,
    requested_service: params.requestedService ?? null,
    requested_date_text: params.requestedDateText ?? null,
    requested_time_text: params.requestedTimeText ?? null,
    notes: params.notes ?? null,
    status: params.status,
    updated_at: new Date().toISOString(),
  };

  if (params.existingBookingId) {
    const { data, error } = await getSupabaseClient()
      .from('booking_requests')
      .update(payload)
      .eq('id', params.existingBookingId)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to update booking request: ${error?.message ?? 'unknown error'}`);
    }

    return data as BookingRequest;
  }

  const { data, error } = await getSupabaseClient()
    .from('booking_requests')
    .insert(payload)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create booking request: ${error?.message ?? 'unknown error'}`);
  }

  return data as BookingRequest;
}

// ---------------------------------------------------------------------------
// Phase 2 — Bots
// ---------------------------------------------------------------------------

export async function listBots(): Promise<Bot[]> {
  const { data, error } = await getSupabaseClient()
    .from('bots')
    .select('*')
    .order('business_name');

  if (error) throw new Error(`Failed to list bots: ${error.message}`);
  return (data ?? []) as Bot[];
}

export async function getBotById(botId: string): Promise<Bot | null> {
  const { data, error } = await getSupabaseClient()
    .from('bots')
    .select('*')
    .eq('id', botId)
    .single();

  if (error || !data) return null;
  return data as Bot;
}

export async function updateBotFlows(
  botId: string,
  enabledFlows: Record<string, boolean>
): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('bots')
    .update({ enabled_flows: enabledFlows })
    .eq('id', botId);

  if (error) throw new Error(`Failed to update bot flows: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Phase 2 — Conversations (admin)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Phase 2 — Knowledge base
// ---------------------------------------------------------------------------

export async function listDocuments(botId: string): Promise<KnowledgeBaseDocument[]> {
  const { data, error } = await getSupabaseClient()
    .from('knowledge_base_documents')
    .select('*')
    .eq('bot_id', botId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to list documents: ${error.message}`);
  return (data ?? []) as KnowledgeBaseDocument[];
}

export async function createDocument(params: {
  botId: string;
  title: string;
  content: string;
}): Promise<KnowledgeBaseDocument> {
  const { data, error } = await getSupabaseClient()
    .from('knowledge_base_documents')
    .insert({
      bot_id: params.botId,
      title: params.title,
      content: params.content,
      indexing_status: 'pending',
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create document: ${error?.message ?? 'unknown error'}`);
  }
  return data as KnowledgeBaseDocument;
}

export async function getDocument(documentId: string): Promise<KnowledgeBaseDocument | null> {
  const { data, error } = await getSupabaseClient()
    .from('knowledge_base_documents')
    .select('*')
    .eq('id', documentId)
    .single();

  if (error || !data) return null;
  return data as KnowledgeBaseDocument;
}

export async function updateDocument(
  documentId: string,
  params: { title?: string; content?: string; is_active?: boolean; indexing_status?: KnowledgeBaseDocument['indexing_status'] }
): Promise<KnowledgeBaseDocument> {
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseClient()
    .from('knowledge_base_documents')
    .update({ ...params, updated_at: now })
    .eq('id', documentId)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to update document: ${error?.message ?? 'unknown error'}`);
  }
  return data as KnowledgeBaseDocument;
}

export async function deleteDocument(documentId: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('knowledge_base_documents')
    .delete()
    .eq('id', documentId);

  if (error) throw new Error(`Failed to delete document: ${error.message}`);
}

export async function createDocumentVersion(params: {
  documentId: string;
  version: number;
  title: string;
  content: string;
}): Promise<void> {
  const { error } = await getSupabaseClient().from('document_versions').insert({
    document_id: params.documentId,
    version: params.version,
    title: params.title,
    content: params.content,
  });

  if (error) throw new Error(`Failed to create document version: ${error.message}`);
}

export async function listDocumentVersions(documentId: string): Promise<DocumentVersion[]> {
  const { data, error } = await getSupabaseClient()
    .from('document_versions')
    .select('*')
    .eq('document_id', documentId)
    .order('version', { ascending: false });

  if (error) throw new Error(`Failed to list document versions: ${error.message}`);
  return (data ?? []) as DocumentVersion[];
}

export async function getDocumentVersion(
  documentId: string,
  version: number
): Promise<DocumentVersion | null> {
  const { data, error } = await getSupabaseClient()
    .from('document_versions')
    .select('*')
    .eq('document_id', documentId)
    .eq('version', version)
    .single();

  if (error || !data) return null;
  return data as DocumentVersion;
}

export async function getLatestDocumentVersion(documentId: string): Promise<number> {
  const { data } = await getSupabaseClient()
    .from('document_versions')
    .select('version')
    .eq('document_id', documentId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as { version: number } | null)?.version ?? 0;
}

// ---------------------------------------------------------------------------
// Phase 2 — Bot memory
// ---------------------------------------------------------------------------

const BOT_MEMORY_LIMIT = 30;

/**
 * Used by the admin panel — no Redis caching, always fresh.
 */
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

/**
 * Used by the orchestrator — backed by Redis cache (TTL 2 min).
 * Import invalidateBotMemoryCache from redis.ts and call it on writes.
 */
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

  // Invalidate cache so orchestrator picks up the new value
  const { invalidateBotMemoryCache } = await import('./redis');
  await invalidateBotMemoryCache(params.botId).catch(() => {});

  return data as BotMemory;
}

export async function deleteBotMemory(memoryId: string, botId: string): Promise<void> {
  // Filter by both id AND bot_id to prevent IDOR — callers cannot delete memory from other bots.
  const { error } = await getSupabaseClient()
    .from('bot_memory')
    .delete()
    .eq('id', memoryId)
    .eq('bot_id', botId);
  if (error) throw new Error(`Failed to delete bot memory: ${error.message}`);

  const { invalidateBotMemoryCache } = await import('./redis');
  await invalidateBotMemoryCache(botId).catch(() => {});
}

export function formatMemoryContext(memories: BotMemory[]): string {
  if (memories.length === 0) return '';
  const lines = memories.map((m) => `- ${m.key}: ${m.value}`).join('\n');
  return `MEMORIA DEL NEGOCIO:\n${lines}`;
}
