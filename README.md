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
│           └── route.ts        ← webhook: GET (verify) + POST (messages)
└── lib/
    ├── types.ts                ← shared TypeScript types (Bot, ChatResult, Intent, etc.)
    ├── env.ts                  ← environment variable validation (Proxy pattern)
    ├── logger.ts               ← structured JSON logging with correlation IDs
    ├── prompts.ts              ← system prompt builder per business type
    ├── intents.ts              ← keyword-based intent detection (fast path)
    ├── claude.ts               ← Claude Haiku client (timeout, retry, tool use, LLM intent classification)
    ├── booking.ts              ← booking flow: field extraction, corrections, missing-field prompts
    ├── orchestrator.ts         ← message pipeline: handleHandoff → handleBooking → handleLLMFlow
    ├── whatsapp.ts             ← Meta Cloud API client + signature verification
    ├── redis.ts                ← conversation history, dedup, rate limiting, circuit breaker
    └── supabase.ts             ← bot config, conversations, leads, bookings (atomic upsert)
supabase/
└── schema.sql                  ← run once in Supabase SQL Editor
```

---

## Cost per client (estimated)

| Component | $/month (low volume) | $/month (~200 conv/day) |
|---|---|---|
| Claude Haiku | ~$8–15 | ~$70 |
| Meta Cloud API (<1K conv/mo) | Free | Free |
| Vercel (shared) | Free tier | Free tier |
| Upstash Redis (shared) | Free tier | ~$1 (paid tier) |
| Supabase (shared) | Free tier | Free–$25 (Pro at ~5 clients) |
| **Total** | **~$10–15** | **~$70–100** |

Recommended client price: $80.000–150.000 CLP/month.

> **Note:** The higher estimate accounts for LLM intent classification calls (~$0.0001/msg extra) and realistic conversation volumes. Free tiers for Upstash (10K commands/day) and Supabase (500MB DB) will be exhausted before client #5 at production volume.

---

## Project status

**Phase 1 — code complete, pending end-to-end testing.**

### What's built

- [x] WhatsApp webhook (GET verify + POST messages, returns 200 immediately)
- [x] Multi-tenant bot config via `phone_number_id` lookup
- [x] Intent detection: keyword fast path + LLM fallback for ambiguous Chilean Spanish
- [x] Booking flow with field extraction and correction handling
- [x] Lead capture via Claude tool use (`capture_lead` structured output)
- [x] Conversation context: Redis (20-msg hot window, 24h TTL) + Supabase (full history)
- [x] Owner notifications on WhatsApp for leads, bookings, and handoffs
- [x] Atomic conversation upsert (no race conditions)
- [x] Claude API: 15s timeout, retry on 429/529, token usage logging
- [x] Per-user rate limiting (10 msg/min sliding window in Redis)
- [x] Circuit breaker for Anthropic API (3 failures → 60s cooldown → fallback reply)
- [x] Environment validation via Proxy (fails loudly on missing vars)
- [x] Structured JSON logging with correlation IDs

### What's NOT built yet

- [ ] Separate environments (dev/staging/prod)
- [ ] CI/CD pipeline
- [ ] Test suite (unit, integration, E2E)
- [ ] Operations panel / frontend UI
- [ ] RAG with client knowledge bases
- [ ] RLS on Supabase tables
- [ ] Prompt injection protection / output guardrails
- [ ] Authentication (JWT, RBAC) for future admin panel

---

## Known issues and fixes needed

### Minor (low risk, can ship without)

| Issue | Description | Where |
|---|---|---|
| Owner notification is untracked | Notifications to `owner_whatsapp` are sent from the bot's own number and don't appear in any conversation record | `orchestrator.ts` |
| Log schema incomplete | Missing `service`, `environment`, `bot_id`, `durationMs` as first-class fields | `logger.ts` |
| Intent false positives | "valor" matches quote intent but "cuánto vale tu esfuerzo" is not a quote request | `intents.ts` |

### Major (must fix before production)

| Issue | Description | Where |
|---|---|---|
| No RLS on Supabase tables | `SUPABASE_SERVICE_ROLE_KEY` bypasses all Row Level Security. A bug in tenant resolution could leak data between clients | `supabase.ts`, `schema.sql` |
| No prompt injection protection | User input goes directly into the LLM context with no sanitization or output filtering | `orchestrator.ts`, `prompts.ts` |
| No test suite | Zero tests — logic changes can break booking, intent, or lead capture without detection | — |
| No CI/CD | Deploying to production has no gates, no tests, no review | — |
| Vercel cold starts | On free tier, cold start variance can push response time > 4s. No kept-warm strategy | `route.ts` |

---

## Roadmap

### Fase 1 — Fundaciones Técnicas ✅ (code complete)

- [x] WhatsApp Cloud API webhook con verificación de firma
- [x] Orquestador con pipeline: dedup → rate limit → classify → dispatch → deliver
- [x] Detección de intención: keywords (fast path) + LLM (fallback para español chileno)
- [x] Flujos: FAQ, captura de lead, agendamiento, cotización, handoff a humano
- [x] Persistencia dual: Redis (contexto caliente) + Supabase (historial completo)
- [x] Rate limiting por usuario + circuit breaker para API externa
- [x] Logging estructurado con correlation IDs
- [ ] **Pendiente:** testing end-to-end con número WhatsApp real
- [ ] **Pendiente:** ambientes separados dev/staging/prod
- [ ] **Pendiente:** CI/CD con tests bloqueando deploy

### Fase 2 — Núcleo Funcional (Semanas 3-4)

- [ ] RAG con pgvector para base de conocimiento por cliente (catálogo, políticas, cobertura, precios)
- [ ] Versionado de documentos para trazabilidad
- [ ] Panel mínimo operativo: ver conversaciones, etiquetar intents, activar/desactivar flujos
- [ ] Memoria persistente mínima por cliente (empresa, rubro, historial relevante)

### Fase 3 — Seguridad y Cumplimiento (Semanas 5-6)

- [ ] RLS en todas las tablas de Supabase (policies por `bot_id`)
- [ ] Autenticación JWT + RBAC (admin, operador, solo lectura) para panel operativo
- [ ] Sanitización de inputs contra prompt injection
- [ ] Guardrails de salida LLM (PII, toxicidad, respuestas fuera de política)
- [ ] System prompts versionados y auditables
- [ ] Consentimiento explícito + política de privacidad + términos de servicio

### Fase 4 — Calidad, Observabilidad y Costos (Semanas 7-8)

- [ ] Test suite: unit (intents, booking), integration (API, DB, WhatsApp), E2E, red-team
- [ ] Métricas clave: latencia p50/p95, error rate, tasa de handoff, costo por conversación
- [ ] Alertas en tiempo real (caída de canal, errores 5xx, costo anómalo)
- [ ] Routing dinámico de modelos (barato por defecto, potente cuando haga falta)
- [ ] Cache de respuestas frecuentes + límites de tokens por conversación

### Fase 5 — Go-Live Controlado (Semanas 9-10)

- [ ] Lanzamiento por etapas: piloto interno → 1-2 clientes beta → escalado progresivo
- [ ] SLOs: disponibilidad 99.5%+, primer tiempo de respuesta < 4s, tasa de error < 1%
- [ ] Estrategia kept-warm para Vercel (cold starts)
- [ ] Runbooks: caída de LLM, falla de WhatsApp, incidente de seguridad
- [ ] Backups diarios automáticos + prueba mensual de restauración

### Arquitectura de Referencia (v1)

```
WhatsApp → Meta Webhook → route.ts (verify + 200 fast)
                              ↓
                      orchestrator.ts
                    ┌─────────┼─────────┐
                    ↓         ↓         ↓
              handleHandoff  handleBooking  handleLLMFlow
              (notify owner) (booking.ts)   (claude.ts + tools)
                    ↓         ↓         ↓
              supabase.ts ← persist ← redis.ts (history + rate limit)
                    ↓
              whatsapp.ts → send reply
```

### Checklist de Producción (Definition of Done)

- [x] Webhook funcional con dedup + rate limiting
- [x] Multi-tenancy con aislamiento por `phone_number_id`
- [x] Circuit breaker + fallback para dependencias externas
- [x] Logging estructurado con correlation IDs
- [ ] Ambientes `dev/staging/prod` separados
- [ ] CI/CD con tests bloqueando deploy
- [ ] Autenticación, RBAC y MFA admin
- [ ] Cifrado en tránsito/reposo + backups verificados
- [ ] RLS + validación de inputs
- [ ] Guardrails LLM + pruebas de prompt injection
- [ ] Observabilidad (logs, métricas, alertas) activa
- [ ] Runbooks y plan de incidentes documentados
- [ ] Política de privacidad + términos publicados
- [ ] SLOs medidos por al menos 2 semanas en producción
