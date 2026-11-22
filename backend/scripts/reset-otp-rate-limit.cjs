#!/usr/bin/env node
// Dev/e2e helper: resets the OTP rate-limit counters for the given emails by
// deleting recent OTP_REQUEST auth events and active OTP codes.
//
// Guarded for local development ONLY: refuses to run when DATABASE_URL does
// not point at 127.0.0.1/localhost. Usage (from backend/ or repo root):
//   node scripts/reset-otp-rate-limit.cjs b2c@example.com [more@emails]
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

function loadEnv() {
  // Mirror src/load-env.ts: backend/.env, explicit path, shell env wins is NOT
  // wanted here (sandbox DATABASE_URL may point elsewhere) — file wins.
  const raw = readFileSync(resolve(__dirname, '../.env'), 'utf8');
  const out = {};
  for (const line of raw.split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match) out[match[1]] = match[2].replace(/^"(.*)"$/, '$1');
  }
  return out;
}

async function main() {
  const emails = process.argv.slice(2);
  if (emails.length === 0) {
    console.error('usage: node scripts/reset-otp-rate-limit.cjs <email> [...]');
    process.exit(1);
  }
  const env = loadEnv();
  const url = env.DATABASE_URL ?? process.env.DATABASE_URL ?? '';
  if (!/\/\/[^/]*@(127\.0\.0\.1|localhost|\[::1\])[:/]/.test(url) && !/\/\/(127\.0\.0\.1|localhost|\[::1\])[:/]/.test(url)) {
    console.error(`refusing to run: DATABASE_URL is not a local dev database (${url.slice(0, 40)}…)`);
    process.exit(1);
  }
  process.env.DATABASE_URL = url;

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const since = new Date(Date.now() - 60 * 60 * 1000);
    // Both per-email AND per-IP counters derive from OTP_REQUEST events, so
    // clear every recent one (dev DB — the counter reset is the whole point).
    const events = await prisma.authEvent.deleteMany({
      where: { kind: 'OTP_REQUEST', createdAt: { gte: since } },
    });
    const codes = await prisma.otpCode.deleteMany({ where: { email: { in: emails } } });
    console.log(`reset OTP limits: ${events.count} events, ${codes.count} active codes cleared`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
