// Banner seed (spec Section 22): 3 hero slides, one top + one bottom side
// slot, 3 highlights and 2 menu teasers. Images are placeholder SVGs written
// by the orchestrator under `cms/banners/*`. The step deletes all banners and
// recreates them, so sortOrder stays canonical across re-runs.
import type { BannerPlacement } from '@prisma/client';
import type { Transaction } from '../../src/db/transaction-types.js';

export interface BannerDef {
  placement: BannerPlacement;
  eyebrow: string | null;
  heading: string;
  subheading: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  imagePublicId: string;
  sortOrder: number;
}

export const BANNERS: BannerDef[] = [
  {
    placement: 'HOME_HERO',
    eyebrow: 'Aerospace Industry',
    heading: 'Cutting tools built for aerospace tolerances',
    subheading:
      'Traceable premium tooling with batch certificates for turbine, structural and landing-gear machining.',
    ctaLabel: 'Explore brands',
    ctaHref: '/in/en/brands',
    imagePublicId: 'cms/banners/hero-1.svg',
    sortOrder: 0,
  },
  {
    placement: 'HOME_HERO',
    eyebrow: 'Precision Engineering',
    heading: 'Measure twice. Cut once. Every time.',
    subheading:
      'Metrology-grade cutting tools and measuring equipment for toolrooms that cannot afford rework.',
    ctaLabel: 'Our services',
    ctaHref: '/in/en/e/services-overview',
    imagePublicId: 'cms/banners/hero-2.svg',
    sortOrder: 1,
  },
  {
    placement: 'HOME_HERO',
    eyebrow: 'Automotive',
    heading: 'High-volume drilling, tapping and milling',
    subheading:
      'PVD-coated tools engineered for dry machining of crankcases, axles and die-cast components.',
    ctaLabel: 'Drilling guide',
    ctaHref: '/in/en/e/drilling-guide',
    imagePublicId: 'cms/banners/hero-3.svg',
    sortOrder: 2,
  },
  {
    placement: 'HOME_SIDE_TOP',
    eyebrow: 'Regrinding service',
    heading: 'Refresh instead of replace',
    subheading: 'Factory regrinding and recoating for drills, taps and end mills — up to 60 % cost saving.',
    ctaLabel: 'Learn more',
    ctaHref: '/in/en/e/services-overview',
    imagePublicId: 'cms/banners/side-1.svg',
    sortOrder: 0,
  },
  {
    placement: 'HOME_SIDE_BOTTOM',
    eyebrow: 'Trade-in week',
    heading: 'Old for new',
    subheading: 'Return worn solid-carbide tools and get credit towards your next order.',
    ctaLabel: 'View terms',
    ctaHref: '/in/en/e/events',
    imagePublicId: 'cms/banners/side-2.svg',
    sortOrder: 0,
  },
  {
    placement: 'HOME_HIGHLIGHT',
    eyebrow: 'Bestseller',
    heading: 'Centre drill HSS-E A TiAlN',
    subheading: 'DIN 333 type A, ⌀ 0.5–5 mm — list price from ₹2,302.30.',
    ctaLabel: 'Buy now',
    ctaHref: '/in/en/p/centre-drill-hss-e-a-tialn',
    imagePublicId: 'cms/banners/highlight-1.svg',
    sortOrder: 0,
  },
  {
    placement: 'HOME_HIGHLIGHT',
    eyebrow: 'Bharat Precision',
    heading: 'Made-in-India tooling',
    subheading: 'Quality tools manufactured locally — stocked in India, priced in rupees.',
    ctaLabel: 'Discover the brand',
    ctaHref: '/in/en/brands',
    imagePublicId: 'cms/banners/highlight-2.svg',
    sortOrder: 1,
  },
  {
    placement: 'HOME_HIGHLIGHT',
    eyebrow: 'Free freight',
    heading: 'Free shipping over ₹25,000',
    subheading: 'On stocked items, delivered across India in 2–4 working days.',
    ctaLabel: 'See details',
    ctaHref: '/in/en/e/about-us',
    imagePublicId: 'cms/banners/highlight-3.svg',
    sortOrder: 2,
  },
  {
    placement: 'MENU_TEASER',
    eyebrow: 'Events',
    heading: 'IMTEX 2026 — meet us in Bengaluru',
    subheading: 'Hall 3, stall B-124, 22–28 January.',
    ctaLabel: 'Details',
    ctaHref: '/in/en/e/events',
    imagePublicId: 'cms/banners/menu-1.svg',
    sortOrder: 0,
  },
  {
    placement: 'MENU_TEASER',
    eyebrow: 'New',
    heading: 'Metrix Labs abrasives now in stock',
    subheading: 'Belts, discs and grinding wheels ready to ship.',
    ctaLabel: 'Browse brands',
    ctaHref: '/in/en/brands',
    imagePublicId: 'cms/banners/menu-2.svg',
    sortOrder: 1,
  },
];

/** Placeholder images to generate for this step (publicId + label). */
export const BANNER_IMAGE_JOBS: ReadonlyArray<{ publicId: string; label: string }> = BANNERS.map((b) => ({
  publicId: b.imagePublicId,
  label: b.heading,
}));

export async function seedBanners(tx: Transaction): Promise<number> {
  await tx.banner.deleteMany();
  await tx.banner.createMany({ data: BANNERS.map((b) => ({ ...b, isActive: true })) });
  return BANNERS.length;
}
