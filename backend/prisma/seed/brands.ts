// Brand seed (spec Section 22): one premium brand, one quality brand and
// eight neutral placeholder brands. Upserted by unique slug.
import type { Transaction } from '../../src/db/transaction-types.js';

export type BrandKey =
  | 'garaveta'
  | 'holexa'
  | 'torqueline'
  | 'ferrotool'
  | 'precisiona'
  | 'voltmaster'
  | 'gripforge'
  | 'metrix-labs'
  | 'aurum-tools'
  | 'bharat-precision';

export interface BrandDef {
  key: BrandKey;
  slug: string;
  name: string;
  isPremium: boolean;
  description: string;
}

export const BRANDS: BrandDef[] = [
  {
    key: 'garaveta',
    slug: 'garaveta',
    name: 'Garaveta',
    isPremium: true,
    description:
      'Premium cutting-tool brand for demanding production environments — powder-metal substrates, PVD multilayer coatings and batch traceability.',
  },
  {
    key: 'holexa',
    slug: 'holexa',
    name: 'Holexa',
    isPremium: false,
    description:
      'Quality brand for hole-making: drills, taps and reamers with tight tolerances at an outstanding price-performance ratio.',
  },
  {
    key: 'torqueline',
    slug: 'torqueline',
    name: 'Torqueline',
    isPremium: false,
    description: 'Fastening and torque tools for assembly lines and maintenance teams.',
  },
  {
    key: 'ferrotool',
    slug: 'ferrotool',
    name: 'Ferrotool',
    isPremium: false,
    description: 'Metalworking hand tools and files built for daily shop-floor duty.',
  },
  {
    key: 'precisiona',
    slug: 'precisiona',
    name: 'Precisiona',
    isPremium: false,
    description: 'Metrology instruments for inspection rooms and in-process measurement.',
  },
  {
    key: 'voltmaster',
    slug: 'voltmaster',
    name: 'Voltmaster',
    isPremium: false,
    description: 'Electric and cordless power tools for industrial applications.',
  },
  {
    key: 'gripforge',
    slug: 'gripforge',
    name: 'Gripforge',
    isPremium: false,
    description: 'Workholding, clamping technology and storage equipment.',
  },
  {
    key: 'metrix-labs',
    slug: 'metrix-labs',
    name: 'Metrix Labs',
    isPremium: false,
    description: 'Abrasive systems and grinding consumables engineered in-house.',
  },
  {
    key: 'aurum-tools',
    slug: 'aurum-tools',
    name: 'Aurum Tools',
    isPremium: false,
    description: 'Special tooling and carbide solutions for difficult materials.',
  },
  {
    key: 'bharat-precision',
    slug: 'bharat-precision',
    name: 'Bharat Precision',
    isPremium: false,
    description: 'Made-in-India tooling and workshop equipment for local industry.',
  },
];

/** brandKey → brand id map filled by seedBrands. */
export async function seedBrands(tx: Transaction): Promise<Map<BrandKey, string>> {
  const ids = new Map<BrandKey, string>();
  for (const brand of BRANDS) {
    const row = await tx.brand.upsert({
      where: { slug: brand.slug },
      create: {
        slug: brand.slug,
        name: brand.name,
        isPremium: brand.isPremium,
        description: brand.description,
      },
      update: {
        name: brand.name,
        isPremium: brand.isPremium,
        description: brand.description,
      },
    });
    ids.set(brand.key, row.id);
  }
  return ids;
}
