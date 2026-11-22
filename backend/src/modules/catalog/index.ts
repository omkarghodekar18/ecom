// catalog module — public surface.
import './catalog.openapi.js';
import './catalog.worker.js';

export { catalogRouter } from './catalog.routes.js';
export { catalogService, refreshCategoryProductCounts } from './catalog.service.js';
export type { CategoryDetailDto, BrandWithCountDto } from './catalog.service.js';
export {
  CreateCategoryInputSchema,
  MoveCategoryInputSchema,
  ReorderCategoryInputSchema,
  UpdateCategoryInputSchema,
} from './catalog.service.js';
export { catalogRepository, subtreeWhere, ACTIVE_CATEGORY } from './catalog.repository.js';
export type { CategoryRow } from './catalog.repository.js';
export { iconUrl, mediaUrl } from './public-id.util.js';
export { CATALOG_COUNTS_QUEUE, scheduleCountRefresh, afterCatalogWrite } from './catalog.queue.js';
