import { prisma } from '../../db/prisma.js';
import { getEnv } from '../../config/env.js';

const startedAt = Date.now();

export function healthService() {
  return {
    status: 'ok',
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    version: '1.0.0',
    env: getEnv().NODE_ENV,
  };
}

export async function readiness(): Promise<{
  status: 'ok' | 'degraded';
  checks: { database: boolean; queue: boolean };
}> {
  const checks = { database: false, queue: true };
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch {
    checks.database = false;
  }
  const healthy = Object.values(checks).every(Boolean);
  return { status: healthy ? 'ok' : 'degraded', checks };
}
