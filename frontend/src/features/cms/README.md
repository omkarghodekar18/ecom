# cms

CMS-driven content rendering (banners + pages + blocks) for home, category
teasers and `/e/[slug]` editorial pages.

**Public surface:** `HomeHero` (+ `HeroSlider`/`HeroSlide`), `BannerCard`,
`CtaBand`, `HomeBrands`, `BlockRenderer` (card grid / rich blocks), `cmsApi`
(page + banner fetchers), `cms.dto.ts` (zod schemas mirrored from the
backend).

**Key flows**

- Home: hero slider (3 seeded banners, autoplay pauses on hover/focus,
  reduced-motion aware) + side teasers + CMS blocks below.
- `/e/[slug]`: server-rendered CMS page from the `Page` table (sanitised
  HTML only).
- Menu teasers: banners with the `MENU_TEASER` placement render inside the
  navigation drawer.

**Gotchas**

- Admin-authored HTML is sanitised server-side (allow-list) before storage —
  `dangerouslySetInnerHTML` in `BlockRenderer` is safe by contract; keep the
  contract when adding block types.
- "Learn more" CTA fallbacks append a visually hidden ` about {heading}`
  suffix for descriptive link text (Lighthouse `link-text`, WCAG 2.4.4).
  Custom `ctaLabel`s render as-is.
- Inactive slides use `inert` + `aria-hidden` so their links can't steal
  focus.
