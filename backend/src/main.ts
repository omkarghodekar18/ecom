// Bootstrap: env validation → server listen → queue start → graceful shutdown.
import { createApp } from './app.js';
import { getEnv } from './config/env.js';
import { logger } from './config/logger.js';
import { prisma } from './db/prisma.js';
import { queue } from './services/queue/index.js';

export async function startServer(): Promise<void> {
  const env = getEnv();
  const app = createApp();

  // Import modules that register queue workers at import time (side effects).
  await import('./modules/catalog/index.js');
  await import('./modules/checkout/index.js');
  await import('./services/revalidate/index.js');

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'ToolHub API listening');
  });

  // Background jobs start after the listener so a queue problem can never
  // delay or kill boot; PgBossQueueService.start() never throws.
  await queue.start();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'graceful shutdown started');
    server.close(async () => {
      try {
        await queue.stop();
        await prisma.$disconnect();
        logger.info('shutdown complete');
        process.exit(0);
      } catch (e) {
        logger.error({ err: e }, 'error during shutdown');
        process.exit(1);
      }
    });
    // Hard stop if connections refuse to drain.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}
