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

## Roadmap — Chatbot de Producción (Funcional y Seguro)

Objetivo: pasar de demo a un chatbot en producción para WhatsApp, con seguridad, trazabilidad, observabilidad y operación continua.

### Fase 1 — Fundaciones Técnicas (Semanas 1-2)

- Definir alcance v1 para WhatsApp exclusivamente:
  - FAQ del negocio.
  - Captura de leads.
  - Agendamiento.
  - Cotizaciones.
  - Handoff a humano cuando la confianza de respuesta sea baja o la intención no coincida con la consulta.
- Definir stack inicial enfocado en costo bajo y velocidad de ejecución:
  - `Canal`: WhatsApp Cloud API oficial de Meta.
  - `Backend`: Typescript y React.
  - `LLM layer`: proveedor económico con buen costo por token. Recomendación inicial: OpenRouter para enrutar a modelos baratos y mantener flexibilidad de cambio.
  - `Base de datos`: PostgreSQL.
  - `Cache/colas`: postergar Redis en v1 si no es estrictamente necesario para no subir costos.
  - `Infraestructura`: Railway o Render para backend; Supabase para PostgreSQL si el costo y límites calzan con la etapa inicial.
- Definir estructura lógica del sistema:
  - `Webhook de WhatsApp`: recibe mensajes entrantes desde Meta.
  - `Orquestador`: clasifica intención y decide entre FAQ, lead, agenda, cotización o escalamiento.
  - `Motor de reglas`: maneja validaciones, estados de conversación y reglas de negocio.
  - `Servicio LLM`: responde consultas abiertas dentro de límites definidos.
  - `Persistencia`: guarda conversaciones, leads, cotizaciones, auditoría y estado de sesión.
- Definir política de datos desde el inicio:
  - Datos permitidos: nombre completo, edad, correo electrónico, número telefónico y dirección.
  - Datos prohibidos: RUT y cualquier otro dato sensible.
  - Guardar solo lo necesario para operar, cotizar y dar seguimiento comercial.
- Crear ambientes separados: `dev`, `staging`, `prod`.
- Configurar CI/CD con deploy automático a `staging` y deploy protegido a `prod`.
- Definir meta operativa de Fase 1:
  - Tener esta semana un backend funcional en `staging` con webhook activo, flujo básico de FAQ, captura de lead, agendamiento simple y cotización inicial.

### Fase 2 — Núcleo Funcional (Semanas 3-4)

- Implementar flujo de conversación híbrido:
  - Ruta 1: respuestas determinísticas (FAQs críticas y flujos de negocio).
  - Ruta 2: respuestas con LLM para preguntas abiertas.
  - Ruta 3: handoff a humano por reglas (intención de compra, reclamo, baja confianza).
- Implementar memoria controlada:
  - Contexto corto por sesión.
  - Datos persistentes mínimos por cliente (empresa, rubro, historial relevante).
- Implementar RAG (si aplica) con base de conocimiento del cliente:
  - Políticas, catálogo, horarios, cobertura, precios.
  - Versionado de documentos para trazabilidad.
- Implementar panel mínimo operativo:
  - Ver conversaciones.
  - Etiquetar intents.
  - Activar/desactivar flujos.

### Fase 3 — Seguridad y Cumplimiento (Semanas 5-6)

- Autenticación y autorización:
  - JWT de corta duración.
  - RBAC (admin, operador, solo lectura).
  - MFA para cuentas administrativas.
- Protección de datos:
  - Cifrado en tránsito (TLS) y en reposo (DB y backups).
  - Gestión de secretos en vault (no secretos en repo).
  - Minimización y retención de datos por política.
- Protección de aplicación:
  - Rate limiting por IP, sesión y cliente.
  - WAF + validación estricta de payloads.
  - Sanitización de inputs contra prompt injection y contenido malicioso.
- Seguridad LLM:
  - System prompts versionados y auditables.
  - Guardrails de salida (PII, toxicidad, respuestas fuera de política).
  - Deny-list de herramientas y dominios no permitidos.
- Cumplimiento y legal:
  - Consentimiento explícito para uso de datos.
  - Términos de servicio y política de privacidad públicas.
  - Registro de auditoría para acciones sensibles.

### Fase 4 — Calidad, Observabilidad y Costos (Semanas 7-8)

- Testing completo:
  - Unit tests (lógica de intents y reglas).
  - Integration tests (API, DB, CRM, WhatsApp).
  - E2E tests (conversación de punta a punta).
  - Red-team tests (prompt injection, data leakage, abuse).
- Observabilidad:
  - Logs estructurados con correlation ID.
  - Métricas clave: latencia p50/p95, error rate, tasa de handoff, costo por conversación.
  - Alertas en tiempo real (caída de canal, errores 5xx, costo anómalo).
- Optimización de costos:
  - Routing dinámico de modelos (barato por defecto, potente solo cuando haga falta).
  - Cache de respuestas frecuentes.
  - Límites de tokens por conversación.

### Fase 5 — Go-Live Controlado (Semanas 9-10)

- Lanzamiento por etapas:
  - Pilot interno.
  - 1-2 clientes beta.
  - Escalado progresivo.
- Definir SLOs iniciales:
  - Disponibilidad: `99.5%+`.
  - Primer tiempo de respuesta: `< 4s` en web.
  - Tasa de error de API: `< 1%`.
- Definir runbooks operativos:
  - Caída de proveedor LLM.
  - Falla de canal WhatsApp.
  - Incidente de seguridad.
- Backups y recuperación:
  - Backups diarios automáticos.
  - Prueba mensual de restauración.

### Arquitectura de Referencia (v1)

1. Cliente envía mensaje (web o WhatsApp).
2. API gateway valida autenticación, rate limit y formato.
3. Orquestador decide: flujo determinístico, RAG o LLM directo.
4. Guardrails validan respuesta antes de enviarla.
5. Se registra conversación, métricas y eventos de auditoría.
6. Si aplica, se crea tarea de handoff a agente humano.

### Checklist de Producción (Definition of Done)

- [ ] Ambientes `dev/staging/prod` separados
- [ ] CI/CD con tests bloqueando deploy
- [ ] Autenticación, RBAC y MFA admin
- [ ] Cifrado en tránsito/reposo + backups verificados
- [ ] Rate limiting + WAF + validación de inputs
- [ ] Guardrails LLM + pruebas de prompt injection
- [ ] Observabilidad (logs, métricas, alertas) activa
- [ ] Runbooks y plan de incidentes documentados
- [ ] Política de privacidad + términos publicados
- [ ] SLOs medidos por al menos 2 semanas en producción
