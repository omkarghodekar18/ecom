// Search controller — thin handlers. q is validated with the shared
// SearchQSchema (trimmed 2–100 chars); everything else reuses the products
// controller's parseListingQuery so search and category listings share one
// query-string contract (q is a KNOWN_LISTING_KEY there, so it never leaks
// into the attribute filters).
import type { Request, Response } from 'express';
import { badRequest } from '../../common/errors/app-error.js';
import { buildMeta } from '../../common/pagination.js';
import { ok } from '../../common/response/http.js';
import { SearchQSchema } from '../../shared/dto/search.dto.js';
import { parseListingQuery } from '../products/index.js';
import { searchService } from './search.service.js';

/** Raw query value → first string (repeated keys behave like the listings). */
function rawQueryValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.find((v): v is string => typeof v === 'string');
  return undefined;
}

/** Query-string q → validated search term; friendly 400 on missing/too-short. */
function parseSearchQ(value: unknown): string {
  const raw = rawQueryValue(value);
  if (raw === undefined || raw.trim().length < 2) {
    throw badRequest("Query parameter 'q' is required (2–100 characters after trimming)", { q: raw ?? null });
  }
  return SearchQSchema.parse(raw);
}

export const searchController = {
  /** GET /search — ranked listing with facets + the exact-article fast path. */
  async search(req: Request, res: Response): Promise<void> {
    const q = parseSearchQ(req.query.q);
    const query = parseListingQuery(req.query);
    const result = await searchService.search(q.trim(), query);
    ok(res, result, buildMeta(result.total, query.page, query.pageSize));
  },

  /** GET /search/suggest — autocomplete groups for the header search box. */
  async suggest(req: Request, res: Response): Promise<void> {
    const q = parseSearchQ(req.query.q);
    ok(res, await searchService.suggest(q));
  },

  /** GET /search/filters — global filter set for the search page FilterBar. */
  async filterDefs(_req: Request, res: Response): Promise<void> {
    ok(res, await searchService.filterDefs());
  },
};
