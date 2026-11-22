// Registers the web.revalidate worker (import = side effect).
import { logger } from '../../config/logger.js';
import { queue } from '../queue/index.js';
import { REVALIDATE_QUEUE, revalidateFrontend } from './revalidate.service.js';

queue
  .work<{ tags: string[] }>(REVALIDATE_QUEUE, async (data) => {
    await revalidateFrontend(data.tags);
  })
  .catch((err: unknown) => {
    logger.error({ err }, 'failed to register web.revalidate worker');
  });
