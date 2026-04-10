import { createClient } from '@supabase/supabase-js';
import { env } from '../env';

let supabase: ReturnType<typeof createClient<any>> | null = null;

export function getSupabaseClient() {
  if (!supabase) {
    supabase = createClient<any>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return supabase;
}
