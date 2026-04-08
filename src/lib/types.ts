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
