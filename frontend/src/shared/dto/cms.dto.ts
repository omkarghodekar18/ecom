// CMS contract: banners, home composition, block-based CMS pages.
// Mirrored to frontend — only zod + relative imports.
import { z } from 'zod';

/** Banner placements (schema enum BannerPlacement, mirrored literal-for-literal). */
export const BannerPlacementSchema = z.enum([
  'HOME_HERO',
  'HOME_SIDE_TOP',
  'HOME_SIDE_BOTTOM',
  'HOME_HIGHLIGHT',
  'MENU_TEASER',
]);
export type BannerPlacementName = z.infer<typeof BannerPlacementSchema>;

/**
 * Public banner. `image` is the RESOLVED URL (`/media/{publicId}` via the
 * catalog module's public-id util) — the raw publicId never leaves the API.
 */
export const BannerDtoSchema = z.object({
  placement: BannerPlacementSchema,
  eyebrow: z.string().nullable(),
  heading: z.string(),
  subheading: z.string().nullable(),
  ctaLabel: z.string().nullable(),
  ctaHref: z.string().nullable(),
  image: z.string(),
  sortOrder: z.number().int(),
});
export type BannerDto = z.infer<typeof BannerDtoSchema>;

// ── CMS block registry (the six block types the storefront renders) ──────────

export const HeroBlockSchema = z.object({
  type: z.literal('hero'),
  eyebrow: z.string(),
  heading: z.string(),
  subheading: z.string().nullable(),
  ctaLabel: z.string().nullable(),
  ctaHref: z.string().nullable(),
  imagePublicId: z.string(),
});

export const RichTextBlockSchema = z.object({
  type: z.literal('richText'),
  html: z.string(),
});

export const ImageTextBlockSchema = z.object({
  type: z.literal('imageText'),
  imagePublicId: z.string(),
  eyebrow: z.string(),
  heading: z.string(),
  html: z.string(),
  side: z.enum(['left', 'right']),
});

export const CardGridBlockSchema = z.object({
  type: z.literal('cardGrid'),
  cards: z.array(
    z.object({
      eyebrow: z.string(),
      heading: z.string(),
      html: z.string(),
      // Seeded cards carry no href — absent normalises to null on read.
      href: z.string().nullable().default(null),
    }),
  ),
});

export const CtaBannerBlockSchema = z.object({
  type: z.literal('ctaBanner'),
  heading: z.string(),
  subheading: z.string(),
  ctaLabel: z.string(),
  ctaHref: z.string(),
});

export const FaqBlockSchema = z.object({
  type: z.literal('faq'),
  items: z.array(z.object({ q: z.string(), a: z.string() })),
});

/** One page block — exactly one of the six seeded shapes (spec 6.11 registry). */
export const CmsBlockSchema = z.union([
  HeroBlockSchema,
  RichTextBlockSchema,
  ImageTextBlockSchema,
  CardGridBlockSchema,
  CtaBannerBlockSchema,
  FaqBlockSchema,
]);
export type CmsBlock = z.infer<typeof CmsBlockSchema>;

/** Published CMS page (blocks parsed against the registry; `updatedAt` ISO). */
export const CmsPageDtoSchema = z.object({
  slug: z.string(),
  title: z.string(),
  blocks: z.array(CmsBlockSchema),
  seoTitle: z.string().nullable(),
  seoDescription: z.string().nullable(),
  updatedAt: z.string(),
});
export type CmsPageDto = z.infer<typeof CmsPageDtoSchema>;

/** Home category tile — one of the top-level categories. */
export const HomeCategoryTileSchema = z.object({
  name: z.string(),
  slug: z.string(),
  code: z.string(),
  pathSlugs: z.string(),
  productCount: z.number().int(),
  image: z.string().nullable(),
});
export type HomeCategoryTile = z.infer<typeof HomeCategoryTileSchema>;

/** GET /cms/home — everything the storefront homepage needs in one payload. */
export const HomeDtoSchema = z.object({
  heroes: z.array(BannerDtoSchema),
  sideTop: z.array(BannerDtoSchema),
  sideBottom: z.array(BannerDtoSchema),
  highlights: z.array(BannerDtoSchema),
  categoryTiles: z.array(HomeCategoryTileSchema),
  /** Reserved for the quick-order teaser slot — always null until that ships. */
  quickOrderTeaser: z.null().optional(),
  seoTitle: z.string(),
  seoDescription: z.string(),
});
export type HomeDto = z.infer<typeof HomeDtoSchema>;
