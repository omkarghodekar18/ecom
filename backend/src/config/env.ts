// Environment contract, validated with zod at boot (fail fast — Section 9).
import { z } from 'zod';

const postgresUrl = z
  .string()
  .min(1)
  .refine((v) => v.startsWith('postgresql://') || v.startsWith('postgres://'), {
    message: 'DATABASE_URL/DIRECT_URL must start with postgresql:// or postgres://',
  });

const httpUrl = z
  .string()
  .min(1)
  .refine((v) => v.startsWith('http://') || v.startsWith('https://'), {
    message: 'must start with http:// or https://',
  });

/** Env files deliver strings; accept the common truthy/falsy spellings. */
const booleanFlag = (defaultValue: boolean) =>
  z.preprocess((v) => {
    if (v === undefined || v === '') return defaultValue;
    if (v === 'true' || v === '1' || v === true) return true;
    if (v === 'false' || v === '0' || v === false) return false;
    return v;
  }, z.boolean());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  // 'silent' is a real pino level — tests/bootstrap set it to keep output clean.
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  PUBLIC_API_URL: httpUrl.default('http://localhost:4000'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  REVALIDATE_SECRET: z.string().min(16),
  /// Frontend base URL the revalidation worker POSTs ISR tags to.
  FRONTEND_INTERNAL_URL: httpUrl.default('http://localhost:3000'),

  DATABASE_URL: postgresUrl,
  DIRECT_URL: postgresUrl,

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  HMAC_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_MIN: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  BREACHED_PASSWORD_CHECK_URL: z.string().default(''),

  MAIL_PROVIDER: z.enum(['file', 'smtp']).default('file'),
  SMTP_URL: z.string().default(''),
  MAIL_FROM: z.string().default('ToolHub India <no-reply@toolhub.example>'),

  QUEUE_ENABLED: booleanFlag(true),

  STORAGE_ADAPTER: z.enum(['local', 'cloudinary']).default('local'),
  CLOUDINARY_CLOUD_NAME: z.string().default(''),
  CLOUDINARY_API_KEY: z.string().default(''),
  CLOUDINARY_API_SECRET: z.string().default(''),
  CLOUDINARY_SECURE_DISTRIBUTION: z.string().default(''),

  PAYMENT_PROVIDER: z.enum(['invoice', 'razorpay', 'mock']).default('invoice'),
  RAZORPAY_KEY_ID: z.string().default(''),
  RAZORPAY_KEY_SECRET: z.string().default(''),
  RAZORPAY_WEBHOOK_SECRET: z.string().default(''),

  SEED_ADMIN_EMAIL: z.string().default('admin@example.com'),
  SEED_ADMIN_PASSWORD: z.string().default('Admin123!secure'),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

/** Validates and returns the process environment. Throws (fail-fast) on the first bad boot. */
export function getEnv(): Env {
  if (!cachedEnv) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
      // console.error is allowed by the eslint config; boot failure must be visible on stdout.
      console.error(`Invalid environment:\n${issues}`);
      process.exit(1);
    }
    cachedEnv = parsed.data;
  }
  return cachedEnv;
}

export function isProd(): boolean {
  return getEnv().NODE_ENV === 'production';
}

export function isTest(): boolean {
  return getEnv().NODE_ENV === 'test';
}

export function corsOrigins(): string[] {
  return getEnv()
    .CORS_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
