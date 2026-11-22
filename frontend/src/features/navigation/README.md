# navigation

Header mega-drawer (spec 5.2): the level-by-level category drill-down with
teasers and icons, plus the cached navigation data access.

**Public surface:** `NavDrawer` (the drawer itself, opened from the header
menu button), `drawer-model.ts` (drill-down state machine), `DrawerFrames`/
`DrawerTeasers`/`DrawerFrames`, `CategoryIcon`, `navigationApi`
(`fetchNavigationTree`, `fetchChildren`, query keys).

**Key flows**

- Opening the drawer fetches the depth-2 tree once (TanStack Query, cached);
  deeper levels lazy-load children per category as the user drills in.
- Selecting a leaf navigates to the category URL; non-leaf selections push a
  new frame (with back navigation inside the drawer).

**Gotchas**

- The tree endpoint is cached server-side (LRU) — drawer data must not be
  refetched per open; rely on the query cache and tag-based revalidation
  (`navigation` tag).
- Frame animation uses transform/opacity only (no layout shifts — CLS 0).
