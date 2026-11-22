// Vitest bootstrap — MUST have no imports (ESM import hoisting would otherwise
// run before these assignments). Points the app at the toolhub_test database
// and disables external integrations. Individual vars may be overridden by the
// shell environment (CI secrets).
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.includes('toolhub_test')) {
  process.env.DATABASE_URL = 'postgresql://postgres@127.0.0.1:5433/toolhub_test';
}
process.env.DIRECT_URL = process.env.DATABASE_URL;

process.env.PORT ??= '4400';
process.env.PUBLIC_API_URL ??= 'http://localhost:4400';
process.env.CORS_ORIGINS ??= 'http://localhost:3000';
process.env.REVALIDATE_SECRET ??= 'test-revalidate-secret-0123456789';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-0123456789abcdef0123456789';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-0123456789abcdef0123456789';
process.env.HMAC_SECRET ??= 'test-hmac-secret-0123456789abcdef0123456789';
process.env.ACCESS_TOKEN_TTL_MIN ??= '15';
process.env.REFRESH_TOKEN_TTL_DAYS ??= '30';
process.env.BREACHED_PASSWORD_CHECK_URL ??= '';
process.env.MAIL_PROVIDER ??= 'file';
process.env.SMTP_URL ??= '';
process.env.MAIL_FROM ??= 'ToolHub Test <no-reply@test>';
process.env.QUEUE_ENABLED ??= 'false';
process.env.STORAGE_ADAPTER ??= 'local';
process.env.CLOUDINARY_CLOUD_NAME ??= '';
process.env.CLOUDINARY_API_KEY ??= '';
process.env.CLOUDINARY_API_SECRET ??= '';
process.env.PAYMENT_PROVIDER ??= 'mock';
