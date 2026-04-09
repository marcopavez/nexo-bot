import { createClient } from '@supabase/supabase-js';
import { env } from './env';
import type {
  BookingRequest,
  Bot,
  Conversation,
  Intent,
} from './types';

let supabase:
  | ReturnType<typeof createClient<any>>
  | null = null;

function getSupabaseClient() {
  if (!supabase) {
    supabase = createClient<any>(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
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
  currentIntent: Intent | null
): Promise<Conversation> {
  const now = new Date().toISOString();

  const { data, error } = await getSupabaseClient()
    .from('conversations')
    .upsert(
      {
        bot_id: botId,
        user_phone: userPhone,
        current_intent: currentIntent,
        status: 'open',
        last_message_at: now,
        updated_at: now,
      },
      { onConflict: 'bot_id,user_phone' }
    )
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to upsert conversation: ${error?.message ?? 'unknown error'}`);
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
