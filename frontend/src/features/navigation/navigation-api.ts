// Data access for the storefront navigation (spec 5.2): a cached depth-2
// tree plus lazy per-category children for the drill-in levels of the drawer.
import { apiFetch } from '@/lib/api-client';
import type { CategoryDto, NavigationNodeDto } from '@/shared/dto/catalog.dto';

/** TanStack Query keys for navigation + menu teaser data. */
export const navigationKeys = {
  tree: (depth: number) => ['navigation', 'tree', depth] as const,
  children: (code: string) => ['navigation', 'children', code] as const,
  teasers: ['cms', 'banners', 'MENU_TEASER'] as const,
};

/** GET /navigation/tree?depth=N — nested nodes from the root. */
export async function fetchNavigationTree(depth: number): Promise<NavigationNodeDto[]> {
  const res = await apiFetch<NavigationNodeDto[]>('/navigation/tree', { query: { depth } });
  return res.data;
}

/** GET /categories/:code/children — direct children of a category. */
export async function fetchCategoryChildren(code: string): Promise<CategoryDto[]> {
  const res = await apiFetch<CategoryDto[]>(`/categories/${encodeURIComponent(code)}/children`);
  return res.data;
}
