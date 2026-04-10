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
