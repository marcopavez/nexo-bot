import { createClient } from '@supabase/supabase-js';
import type { Bot } from './types';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function getBotByPhoneNumberId(phoneNumberId: string): Promise<Bot | null> {
  const { data, error } = await supabase
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
  await supabase.from('leads').insert({
    bot_id: botId,
    user_phone: userPhone,
    name,
    message: motivo,
  });
}
