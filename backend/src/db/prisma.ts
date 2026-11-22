// Prisma client singleton (Section 3: repositories are the only layer touching this).
import { PrismaClient } from '@prisma/client';
import { getEnv } from '../config/env.js';
import { logger } from '../config/logger.js';

const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'error' },
    { emit: 'event', level: 'warn' },
  ],
});

if (getEnv().NODE_ENV === 'development') {
  prisma.$on('error', (e) => logger.error({ err: e }, 'prisma error'));
  prisma.$on('warn', (e) => logger.warn(e, 'prisma warning'));
}

export { prisma };
