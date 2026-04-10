import { getSupabaseClient } from './client';
import type { BookingRequest } from '../types';

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

  if (error) throw new Error(`Failed to load booking request: ${error.message}`);
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
