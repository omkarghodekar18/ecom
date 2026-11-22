// Normalised navigation model for the drill-in drawer (spec 5.2).
import type { CategoryDto, NavigationNodeDto } from '@/shared/dto/catalog.dto';

/**
 * One category row in the drawer. `children: null` means "sub-categories
 * unknown — lazy-load on drill" (empty arrays from the depth-2 tree carry no
 * leaf information, so they are normalised to `null`).
 */
export interface DrawerNode {
  code: string;
  name: string;
  slug: string;
  icon: string | null;
  productCount: number;
  /** Absolute slug path; present on nodes sourced from the children endpoint. */
  pathSlugs?: string;
  /** Known sub-categories; `null` when they must be fetched lazily. */
  children: DrawerNode[] | null;
}

/** A drilled category level of the drawer. */
export interface DrawerCategoryFrame {
  kind: 'category';
  name: string;
  code: string;
  pathSlugs: string;
  children: DrawerNode[] | null;
}

/** Level 1 of the drawer: the "Main menu" root view. */
export type DrawerFrame = { kind: 'root' } | DrawerCategoryFrame;

export const ROOT_FRAME: DrawerFrame = { kind: 'root' };

/** NavigationNodeDto (no pathSlugs, unknown leaves) → DrawerNode. */
export function toDrawerNode(node: NavigationNodeDto): DrawerNode {
  return {
    code: node.code,
    name: node.name,
    slug: node.slug,
    icon: node.icon,
    productCount: node.productCount,
    children: node.children.length > 0 ? node.children.map(toDrawerNode) : null,
  };
}

/** CategoryDto (has pathSlugs, no children payload) → DrawerNode. */
export function categoryToDrawerNode(category: CategoryDto): DrawerNode {
  return {
    code: category.code,
    name: category.name,
    slug: category.slug,
    icon: category.icon,
    productCount: category.productCount,
    pathSlugs: category.pathSlugs,
    children: null,
  };
}
