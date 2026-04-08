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

-- Index for quick lead lookups per bot
CREATE INDEX leads_bot_id_idx ON leads(bot_id);

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
