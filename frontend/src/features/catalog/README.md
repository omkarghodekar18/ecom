# catalog

Homepage category tiles (spec 6.1): the top-level category grid rendered
under the hero.

**Public surface:** `CategoryTileGrid` (used by the home page).

**Key flows**

- Server-rendered from the navigation tree data (no client JS); each tile
  links to the category URL with its icon and product count.

**Gotchas**

- Tile data comes prerendered with the home page and is refreshed via the
  `navigation`/`home` revalidation tags — do not fetch inside the component.
- The listing variant used inside category pages (non-leaf subcategory
  tiles) lives in `features/product/category-tile-grid.tsx`, not here.
