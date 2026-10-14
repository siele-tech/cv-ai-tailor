import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, '..', '..');

// Load a local .env (repo root or server/) if present. Real environment variables win.
for (const file of [path.join(repoRoot, '.env'), path.join(repoRoot, 'server', '.env')]) {
  if (existsSync(file)) {
    try {
      process.loadEnvFile(file);
    } catch {
      // A malformed .env should not crash startup; validation below reports what is missing.
    }
  }
}

const DEV_PASSWORD = 'dev-password';
const DEV_JWT_SECRET = 'dev-only-secret-do-not-use-in-production-0000';

export interface Config {
  env: 'development' | 'production' | 'test';
  isProduction: boolean;
  port: number;
  mongoUri: string;
  appPassword: string;
  jwtSecret: string;
  usingDevCredentials: boolean;
  corsOrigins: string[];
  serveClient: boolean;
  maxUploadBytes: number;
  /** AI requests per member per day; 0 means unlimited. */
  aiDailyLimit: number;
  /** AI requests per day for the owner; 0 means unlimited. */
  aiDailyLimitOwner: number;
  ai: {
    apiKey: string;
    baseUrl: string;
    model: string;
    /** Tried in order when the main model is overloaded, rate-limited or too slow. */
    fallbackModels: string[];
    jsonMode: boolean;
    temperature: number | undefined;
    timeoutMs: number;
    /** Pause before retrying a model that reported it is overloaded. */
    retryDelayMs: number;
  };
}

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Untouched placeholders copied from .env.example ("<your-key>") count as not set. */
function withoutPlaceholders(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const cleaned: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    const v = value?.trim() ?? '';
    cleaned[key] = /^<[^<>]*>$/.test(v) || /<db-user>|<db-password>|<cluster-host>/.test(v) ? '' : value;
  }
  return cleaned;
}

export function loadConfig(rawSource: NodeJS.ProcessEnv = process.env): Config {
  const source = withoutPlaceholders(rawSource);
  const rawEnv = source.NODE_ENV;
  const env: Config['env'] = rawEnv === 'production' ? 'production' : rawEnv === 'test' ? 'test' : 'development';
  const isProduction = env === 'production';

  const appPassword = source.APP_PASSWORD?.trim() || (isProduction ? '' : DEV_PASSWORD);
  const jwtSecret = source.JWT_SECRET?.trim() || (isProduction ? '' : DEV_JWT_SECRET);

  if (isProduction) {
    const problems: string[] = [];
    if (appPassword.length < 10) problems.push('APP_PASSWORD must be set to at least 10 characters');
    if (jwtSecret.length < 32) problems.push('JWT_SECRET must be set to at least 32 random characters');
    if (!source.MONGODB_URI?.trim()) problems.push('MONGODB_URI must be set (MongoDB Atlas connection string)');
    if (problems.length) {
      throw new Error(`Invalid production configuration:\n - ${problems.join('\n - ')}`);
    }
  }

  const temperature = source.AI_TEMPERATURE?.trim() ? Number(source.AI_TEMPERATURE) : undefined;

  return {
    env,
    isProduction,
    port: num(source.PORT, 4000),
    mongoUri: source.MONGODB_URI?.trim() ?? '',
    appPassword,
    jwtSecret,
    usingDevCredentials: appPassword === DEV_PASSWORD || jwtSecret === DEV_JWT_SECRET,
    corsOrigins: (source.CORS_ORIGINS ?? '')
      .split(',')
      .map((o) => o.trim().replace(/\/$/, ''))
      .filter(Boolean),
    serveClient: source.SERVE_CLIENT !== 'false',
    maxUploadBytes: num(source.MAX_UPLOAD_MB, 5) * 1024 * 1024,
    aiDailyLimit: source.AI_DAILY_LIMIT === '0' ? 0 : num(source.AI_DAILY_LIMIT, 40),
    aiDailyLimitOwner: num(source.AI_DAILY_LIMIT_OWNER, 0),
    ai: {
      apiKey: source.AI_API_KEY?.trim() ?? '',
      baseUrl: (source.AI_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(/\/$/, ''),
      model: source.AI_MODEL?.trim() || 'gpt-4o-mini',
      fallbackModels: (source.AI_FALLBACK_MODELS ?? '')
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean),
      jsonMode: source.AI_JSON_MODE !== 'false',
      temperature: Number.isFinite(temperature) ? temperature : undefined,
      timeoutMs: num(source.AI_TIMEOUT_MS, 75_000),
      retryDelayMs: env === 'test' ? 1 : 3000,
    },
  };
}

export const aiConfigured = (config: Config): boolean => config.ai.apiKey.length > 0;
