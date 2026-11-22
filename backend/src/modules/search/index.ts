// Search module — public surface.
import './search.openapi.js';

export { searchRouter } from './search.routes.js';
export { searchController } from './search.controller.js';
export {
  MAX_SEARCH_CANDIDATES,
  PostgresSearchEngine,
  SUGGEST_LIMITS,
  searchEngine,
  searchService,
} from './search.service.js';
export type { SearchResponse } from './search.service.js';
export type { SearchEngine, SearchParams } from './search.types.js';
export { searchRepository } from './postgres-search.repository.js';
export type {
  ProductMatchRow,
  SuggestedBrandRow,
  SuggestedCategoryRow,
  SuggestedProductRow,
} from './postgres-search.repository.js';
