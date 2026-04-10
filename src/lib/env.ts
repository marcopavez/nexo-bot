const REQUIRED_ENV_VARS = [
  'GEMINI_API_KEY',
  'META_ACCESS_TOKEN',
  'META_APP_SECRET',
  'WEBHOOK_VERIFY_TOKEN',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
] as const;

type RequiredEnvVar = (typeof REQUIRED_ENV_VARS)[number];
type EnvShape = Record<RequiredEnvVar, string>;

function readRequiredEnv(name: RequiredEnvVar): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`[nexo-bot] Missing required env var: ${name}`);
  }

  return value;
}

export const env = new Proxy({} as EnvShape, {
  get(_target, prop: string): string {
    if (!REQUIRED_ENV_VARS.includes(prop as RequiredEnvVar)) {
      throw new Error(`[nexo-bot] Unsupported env var access: ${prop}`);
    }

    return readRequiredEnv(prop as RequiredEnvVar);
  },
});

export function getOptionalEnv(name: string): string | undefined {
  return process.env[name] || undefined;
}

/**
 * Eagerly validate all required env vars. Call this at module scope in entry-point
 * route files so a missing secret is caught at cold-start, not buried inside request
 * processing where it surfaces as a cryptic failure mid-pipeline.
 */
export function validateEnv(): void {
  for (const name of REQUIRED_ENV_VARS) {
    readRequiredEnv(name);
  }
}
