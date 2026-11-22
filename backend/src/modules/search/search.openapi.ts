// OpenAPI registration for the search module.
import { z } from 'zod';
import { openApiRegistry } from '../../openapi.js';
import {
  SearchFiltersDtoSchema,
  SearchQSchema,
  SearchQueryDtoSchema,
  SearchResponseDtoSchema,
  SuggestDtoSchema,
} from '../../shared/dto/search.dto.js';

const envelope = <T extends z.ZodType>(data: T) => z.object({ success: z.literal(true), data });

const pageMeta = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

const paginated = <T extends z.ZodType>(data: T) => z.object({ success: z.literal(true), data, meta: pageMeta });

const jsonResponse = (description: string, schema?: z.ZodType) => ({
  description,
  ...(schema ? { content: { 'application/json': { schema } } } : {}),
});

const searchDescription =
  'Ranked full-text search (spec 12) over the weighted Product searchVector ' +
  '(name A, brand + article numbers B, description C) with pg_trgm typo ' +
  'tolerance; exact articleNo/EAN hits rank first and surface as ' +
  '`exactArticleNo` (the frontend can jump straight to that PDP). Filter, ' +
  'sort and pagination semantics are identical to the category listing: every ' +
  'query key beyond the documented ones is an attribute filter ' +
  '(`key=v1,v2`, `key_min`/`key_max`), AND across attributes, one active ' +
  'variant satisfies all predicates, and `facets` carries DISJUNCTIVE counts. ' +
  'Default sort `relevance` is the text ranking itself.';

openApiRegistry.registerPath({
  method: 'get',
  path: '/search',
  tags: ['Search'],
  description: searchDescription,
  request: { query: SearchQueryDtoSchema },
  responses: {
    '200': jsonResponse('Search listing page', paginated(SearchResponseDtoSchema)),
    '400': jsonResponse("Invalid 'q' or filter parameter(s) — unknown attribute keys, type misuse or q shorter than 2 chars; details included"),
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/search/suggest',
  tags: ['Search'],
  description:
    'Autocomplete groups for the header search box (spec 6.5): products (exact ' +
    'articleNo/EAN matches first, image + brand), categories and brands. q is ' +
    'trimmed and must be 2–100 characters.',
  request: { query: z.object({ q: SearchQSchema }) },
  responses: {
    '200': jsonResponse('Autocomplete groups', envelope(SuggestDtoSchema)),
    '400': jsonResponse("Invalid 'q' — missing or shorter than 2 chars after trimming"),
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/search/filters',
  tags: ['Search'],
  description:
    'The GLOBAL filter set for the search page: every attribute that is ' +
    'filterable in ANY category (deduped by attribute), shaped as ' +
    'CategoryAttributeDto rows for the same FilterBar the category pages use.',
  request: {},
  responses: {
    '200': jsonResponse('Global filter definitions', envelope(SearchFiltersDtoSchema)),
  },
});
