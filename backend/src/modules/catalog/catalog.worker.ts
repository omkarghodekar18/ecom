// Registers the background worker for subtree product-count recomputation.
// Importing this file registers the handler (idempotent per process); the
// queue service is inline in tests/dev and pg-boss-backed in production.
import { logger } from '../../config/logger.js';
import { queue } from '../../services/queue/index.js';
import { CATALOG_COUNTS_QUEUE } from './catalog.queue.js';
import { refreshCategoryProductCounts } from './catalog.service.js';

queue
  .work(CATALOG_COUNTS_QUEUE, async () => {
    const affected = await refreshCategoryProductCounts();
    logger.info({ queue: CATALOG_COUNTS_QUEUE, affected }, 'category product counts refreshed');
  })
  .catch((err: unknown) => {
    logger.error({ err }, 'failed to register catalog.refresh-counts worker');
  });
