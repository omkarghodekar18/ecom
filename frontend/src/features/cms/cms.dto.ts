// CMS contract mirrored locally from backend `shared/dto/cms.dto.ts` (the
// frontend shared/dto folder is owned by another task). Zod only — safe in
// both server and client components.

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

/** Public banner; `image` is the already-resolved URL (never a bare publicId). */
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
export type HeroBlock = z.infer<typeof HeroBlockSchema>;

export const RichTextBlockSchema = z.object({
  type: z.literal('richText'),
  html: z.string(),
});
export type RichTextBlock = z.infer<typeof RichTextBlockSchema>;

export const ImageTextBlockSchema = z.object({
  type: z.literal('imageText'),
  imagePublicId: z.string(),
  eyebrow: z.string(),
  heading: z.string(),
  html: z.string(),
  side: z.enum(['left', 'right']),
});
export type ImageTextBlock = z.infer<typeof ImageTextBlockSchema>;

export const CardGridBlockSchema = z.object({
  type: z.literal('cardGrid'),
  cards: z.array(
    z.object({
      eyebrow: z.string(),
      heading: z.string(),
      html: z.string(),
      // Seeded cards carry no href — the backend normalises absent to null.
      href: z.string().nullable(),
    }),
  ),
});
export type CardGridBlock = z.infer<typeof CardGridBlockSchema>;

export const CtaBannerBlockSchema = z.object({
  type: z.literal('ctaBanner'),
  heading: z.string(),
  subheading: z.string(),
  ctaLabel: z.string(),
  ctaHref: z.string(),
});
export type CtaBannerBlock = z.infer<typeof CtaBannerBlockSchema>;

export const FaqBlockSchema = z.object({
  type: z.literal('faq'),
  items: z.array(z.object({ q: z.string(), a: z.string() })),
});
export type FaqBlock = z.infer<typeof FaqBlockSchema>;

/** One page block — exactly one of the six shapes (spec 6.11 registry). */
export const CmsBlockSchema = z.discriminatedUnion('type', [
  HeroBlockSchema,
  RichTextBlockSchema,
  ImageTextBlockSchema,
  CardGridBlockSchema,
  CtaBannerBlockSchema,
  FaqBlockSchema,
]);
export type CmsBlock = z.infer<typeof CmsBlockSchema>;

/**
 * Published CMS page envelope. `blocks` stays `unknown[]` here on purpose: the
 * block-renderer safe-parses each block individually so a single unknown or
 * malformed block is skipped silently instead of failing the whole page.
 */
export const CmsPageSchema = z.object({
  slug: z.string(),
  title: z.string(),
  blocks: z.array(z.unknown()),
  seoTitle: z.string().nullable(),
  seoDescription: z.string().nullable(),
  updatedAt: z.string(),
});
export type CmsPageDto = z.infer<typeof CmsPageSchema>;

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
  /** Reserved quick-order teaser slot — always null until that ships. */
  quickOrderTeaser: z.null().optional(),
  seoTitle: z.string(),
  seoDescription: z.string(),
});
export type HomeDto = z.infer<typeof HomeDtoSchema>;
