import { getSupabaseClient } from './client';
import type { Bot } from '../types';

export async function getBotByPhoneNumberId(phoneNumberId: string): Promise<Bot | null> {
  const { data, error } = await getSupabaseClient()
    .from('bots')
    .select('*')
    .eq('phone_number_id', phoneNumberId)
    .single();

  if (error || !data) return null;
  return data as Bot;
}

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

export async function createBot(params: {
  phoneNumberId: string;
  businessName: string;
  businessType: Bot['business_type'];
  ownerWhatsapp?: string | null;
  systemPrompt?: string | null;
  hours?: string | null;
  address?: string | null;
  services?: Bot['services'];
}): Promise<Bot> {
  const { data, error } = await getSupabaseClient()
    .from('bots')
    .insert({
      phone_number_id: params.phoneNumberId,
      business_name: params.businessName,
      business_type: params.businessType,
      owner_whatsapp: params.ownerWhatsapp ?? null,
      system_prompt: params.systemPrompt ?? null,
      hours: params.hours ?? null,
      address: params.address ?? null,
      services: params.services ?? null,
      enabled_flows: { faq: true, lead: true, booking: true, quote: true, handoff: true },
    })
    .select('*')
    .single();

  if (error || !data) throw new Error(`Failed to create bot: ${error?.message ?? 'unknown error'}`);
  return data as Bot;
}

export async function updateBot(
  botId: string,
  params: {
    businessName?: string;
    businessType?: Bot['business_type'];
    ownerWhatsapp?: string | null;
    systemPrompt?: string | null;
    hours?: string | null;
    address?: string | null;
    services?: Bot['services'];
  }
): Promise<Bot> {
  const payload: Record<string, unknown> = {};
  if (params.businessName !== undefined) payload.business_name = params.businessName;
  if (params.businessType !== undefined) payload.business_type = params.businessType;
  if (params.ownerWhatsapp !== undefined) payload.owner_whatsapp = params.ownerWhatsapp;
  if (params.systemPrompt !== undefined) payload.system_prompt = params.systemPrompt;
  if (params.hours !== undefined) payload.hours = params.hours;
  if (params.address !== undefined) payload.address = params.address;
  if (params.services !== undefined) payload.services = params.services;

  const { data, error } = await getSupabaseClient()
    .from('bots')
    .update(payload)
    .eq('id', botId)
    .select('*')
    .single();

  if (error || !data) throw new Error(`Failed to update bot: ${error?.message ?? 'unknown error'}`);
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
