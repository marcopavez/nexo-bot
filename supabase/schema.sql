-- ============================================================
-- Nexo Bot — Supabase schema
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

CREATE TABLE bots (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number_id  TEXT UNIQUE NOT NULL,   -- Meta's phone_number_id for this WhatsApp number
  business_name    TEXT NOT NULL,
  business_type    TEXT NOT NULL CHECK (business_type IN ('shop', 'clinic', 'law_firm', 'other')),
  services         JSONB,                  -- [{"nombre": "...", "precio": "...", "descripcion": "..."}]
  hours            TEXT,                   -- e.g. "Lunes a Viernes 9:00–18:00"
  address          TEXT,
  owner_whatsapp   TEXT,                   -- Owner's WhatsApp number for lead notifications (56912345678)
  system_prompt    TEXT,                   -- Optional extra instructions for this bot
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE leads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id      UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  user_phone  TEXT NOT NULL,
  name        TEXT,
  message     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE conversations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id           UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  user_phone       TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  current_intent   TEXT CHECK (current_intent IN ('faq', 'lead', 'booking', 'quote', 'handoff')),
  last_message_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (bot_id, user_phone)
);

CREATE TABLE messages (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id      UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  whatsapp_message_id  TEXT,
  direction            TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  role                 TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  intent               TEXT CHECK (intent IN ('faq', 'lead', 'booking', 'quote', 'handoff')),
  content              TEXT NOT NULL,
  metadata             JSONB,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE booking_requests (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id      UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  bot_id               UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  user_phone           TEXT NOT NULL,
  customer_name        TEXT,
  requested_service    TEXT,
  requested_date_text  TEXT,
  requested_time_text  TEXT,
  notes                TEXT,
  status               TEXT NOT NULL DEFAULT 'collecting' CHECK (
    status IN ('collecting', 'pending_confirmation', 'confirmed', 'cancelled', 'handoff')
  ),
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lead lookups per bot
CREATE INDEX leads_bot_id_idx ON leads(bot_id);
CREATE INDEX conversations_bot_id_idx ON conversations(bot_id);
CREATE INDEX messages_conversation_id_idx ON messages(conversation_id);
CREATE INDEX booking_requests_bot_id_idx ON booking_requests(bot_id);
CREATE UNIQUE INDEX booking_requests_active_conversation_idx
ON booking_requests(conversation_id)
WHERE status IN ('collecting', 'pending_confirmation');

-- ============================================================
-- Demo bot: Clínica Dental (replace phone_number_id before use)
-- ============================================================
INSERT INTO bots (phone_number_id, business_name, business_type, services, hours, address, owner_whatsapp)
VALUES (
  'REPLACE_WITH_YOUR_PHONE_NUMBER_ID',
  'Clínica Dental Sonrisas',
  'clinic',
  '[
    {"nombre": "Consulta general",  "precio": "$15.000"},
    {"nombre": "Limpieza dental",   "precio": "$25.000"},
    {"nombre": "Blanqueamiento",    "precio": "$80.000"},
    {"nombre": "Ortodoncia",        "precio": "Desde $350.000", "descripcion": "Consulta sin costo"}
  ]'::jsonb,
  'Lunes a Viernes 9:00–18:00 · Sábados 9:00–13:00',
  'Av. Providencia 1234, Santiago',
  'REPLACE_WITH_OWNER_WHATSAPP_NUMBER'
);
