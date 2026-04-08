# Nexo Bot

Multi-tenant WhatsApp chatbot for Chilean SMBs. One deployment serves multiple clients — each with their own business config, knowledge base, and lead notifications.

Built with Next.js · Claude Haiku · Meta Cloud API · Supabase · Upstash Redis · Vercel

---

## What it does

- Responds to WhatsApp messages 24/7 using Claude AI
- Each client has isolated config (services, prices, hours, tone)
- Detects purchase/booking intent and captures leads automatically
- Notifies the business owner on WhatsApp when a new lead appears
- Keeps conversation context for 24 hours per user

---

## Setup (one time per developer)

### 1. Anthropic API key

1. Go to https://console.anthropic.com/settings/keys
2. Create a new key → copy it as `ANTHROPIC_API_KEY`

### 2. Supabase

1. Go to https://supabase.com → New project
2. Dashboard → SQL Editor → paste `supabase/schema.sql` → Run
3. Settings → API → copy:
   - **Project URL** → `SUPABASE_URL`
   - **service_role key** (not anon) → `SUPABASE_SERVICE_ROLE_KEY`

### 3. Upstash Redis

1. Go to https://console.upstash.com → Create Database → choose region closest to Vercel (US East or EU)
2. Copy **REST URL** → `UPSTASH_REDIS_REST_URL`
3. Copy **REST Token** → `UPSTASH_REDIS_REST_TOKEN`

### 4. Meta / WhatsApp Cloud API

1. Go to https://developers.facebook.com → My Apps → Create App → **Business** type
2. Add product: **WhatsApp**
3. WhatsApp → Getting Started: you get a free test phone number immediately (no business verification needed for testing)
4. Copy **Phone Number ID** → use it in the `bots` table (`phone_number_id` column)
5. Copy **Temporary access token** (or generate a permanent System User token for production) → `META_ACCESS_TOKEN`
6. App Settings → Basic → copy **App Secret** → `META_APP_SECRET`
7. Choose any random string for `WEBHOOK_VERIFY_TOKEN` (e.g. `nexo-bot-2025`)

### 5. Deploy to Vercel

```bash
npm i -g vercel
vercel --prod
```

Set all env vars from `.env.example` in Vercel Dashboard → Settings → Environment Variables.

Your webhook URL will be: `https://your-project.vercel.app/api/whatsapp`

### 6. Register the webhook with Meta

1. WhatsApp → Configuration → Webhook → Edit
2. Callback URL: `https://your-project.vercel.app/api/whatsapp`
3. Verify token: your `WEBHOOK_VERIFY_TOKEN`
4. Subscribe to: `messages`

### 7. Update the demo bot record

In Supabase SQL Editor:
```sql
UPDATE bots
SET
  phone_number_id = 'YOUR_ACTUAL_PHONE_NUMBER_ID',
  owner_whatsapp  = '56912345678'  -- owner's number WITHOUT +
WHERE business_name = 'Clínica Dental Sonrisas';
```

---

## Adding a new client

```sql
INSERT INTO bots (phone_number_id, business_name, business_type, services, hours, address, owner_whatsapp)
VALUES (
  'PHONE_NUMBER_ID',
  'Ferretería El Clavo',
  'shop',
  '[
    {"nombre": "Herramientas eléctricas", "precio": "Desde $15.000"},
    {"nombre": "Materiales de construcción", "precio": "Consultar stock"}
  ]',
  'Lunes a Sábado 8:30–19:00',
  'Calle Maipú 456, Valparaíso',
  '56987654321'
);
```

Each client needs their own WhatsApp Business number (Meta allows multiple numbers per app).

---

## Local development

```bash
cp .env.example .env.local
# fill in .env.local
npm install
npm run dev
```

To test the webhook locally, expose it with:
```bash
npx localtunnel --port 3000
```
Use the tunnel URL as your webhook callback in Meta's dashboard.

---

## Project structure

```
src/
├── app/
│   └── api/
│       └── whatsapp/
│           └── route.ts   ← webhook: GET (verify) + POST (messages)
└── lib/
    ├── types.ts            ← shared TypeScript types
    ├── prompts.ts          ← system prompt builder per business type
    ├── claude.ts           ← Claude Haiku API client
    ├── whatsapp.ts         ← Meta Cloud API client + signature verification
    ├── redis.ts            ← Upstash Redis conversation history
    └── supabase.ts         ← bot config + lead storage
supabase/
└── schema.sql              ← run once in Supabase SQL Editor
```

---

## Cost per client (estimated)

| Component | $/month |
|---|---|
| Claude Haiku (~200 conv/day) | ~$8–15 |
| Meta Cloud API (<1K conv/mo) | Free |
| Vercel (shared) | Free tier |
| Upstash Redis (shared) | Free tier |
| Supabase (shared) | Free tier |
| **Total** | **~$10–15** |

Recommended client price: $80.000–150.000 CLP/month.
