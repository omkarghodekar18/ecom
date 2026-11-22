// Catalog background-job hooks: the queue name for subtree product-count
// recomputation plus the post-write hook (cache invalidation + refresh job)
// shared by every catalog/attribute admin write. Kept dependency-free of the
// catalog service so other modules (attributes) can import it without cycles.
import { logger } from '../../config/logger.js';
import { cache } from '../../services/cache/index.js';
import { scheduleRevalidate, TAGS } from '../../services/revalidate/index.js';
import { queue } from '../../services/queue/index.js';

/** pg-boss queue name for `refreshCategoryProductCounts` jobs. */
export const CATALOG_COUNTS_QUEUE = 'catalog.refresh-counts';

/**
 * Fire-and-forget count refresh. Producers must never block or fail because of
 * the queue — errors are logged and swallowed.
 */
export function scheduleCountRefresh(): void {
  void queue.enqueue(CATALOG_COUNTS_QUEUE, {}).catch((err: unknown) => {
    logger.error({ err }, 'failed to enqueue catalog.refresh-counts');
  });
}

/**
 * Post-write hook for every admin write that can change the visible catalog:
 * drop the cached navigation tree(s) and recompute subtree product counts in
 * the background. Call AFTER the write transaction committed.
 */
export function afterCatalogWrite(): void {
  cache.deletePrefix('navigation:');
  scheduleCountRefresh();
  // ISR: the drawer/tree and homepage category tiles read the navigation tree.
  scheduleRevalidate([TAGS.navigation, TAGS.home]);
}
