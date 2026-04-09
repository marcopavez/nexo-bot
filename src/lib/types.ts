export interface Bot {
  id: string;
  phone_number_id: string;
  business_name: string;
  business_type: 'shop' | 'clinic' | 'law_firm' | 'other';
  services: Array<{ nombre: string; precio: string; descripcion?: string }> | null;
  hours: string | null;
  address: string | null;
  owner_whatsapp: string | null;
  system_prompt: string | null;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface Conversation {
  id: string;
  bot_id: string;
  user_phone: string;
  status: 'open' | 'closed';
  current_intent: Intent | null;
  last_message_at: string;
  created_at: string;
  updated_at: string;
}

export interface BookingRequest {
  id: string;
  conversation_id: string;
  bot_id: string;
  user_phone: string;
  customer_name: string | null;
  requested_service: string | null;
  requested_date_text: string | null;
  requested_time_text: string | null;
  notes: string | null;
  status: 'collecting' | 'pending_confirmation' | 'confirmed' | 'cancelled' | 'handoff';
  created_at: string;
  updated_at: string;
}

export type Intent =
  | 'faq'
  | 'lead'
  | 'booking'
  | 'quote'
  | 'handoff';

export interface IntentDetection {
  intent: Intent;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

export interface LeadCapture {
  nombre: string;
  motivo: string;
}

export interface ChatResult {
  text: string;
  leadCapture: LeadCapture | null;
  inputTokens: number;
  outputTokens: number;
}
