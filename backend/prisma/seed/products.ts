// Product seed (spec Section 22): 200+ PUBLISHED families with variants,
// attribute values, price tiers and image specs.
//
// Composition:
//   • flagship  'Centre drill HSS-E A TiAlN' (Garaveta, isBestseller) with
//               the exact 11-variant grid from the spec: ⌀ 0.5–5 mm, article
//               numbers '111100 0,5' … '111100 5', price from INR 2,302.30,
//               first variant INR 2,357.30, mixed availability, 2 tiered
//               variants, 3 photos + 1 drawing + 1 technical sheet.
//   • 30 Centre drill, 15 NC spotting drill and 15 Jobber drill families —
//               the three categories with attribute mappings (attributes.ts)
//               — generated from stable material/shape/coating combinations.
//   • ~150 families across the other leaf categories of categories.ts from
//               the hand-written OTHER_CATALOG table.
// EANs are checksum-valid GTIN-13s (util.makeGtin13) on ~60 % of variants.
// Every generated value derives from FNV-1a hashes of stable keys, so re-run
// output is identical. seedProducts() upserts by slug and rebuilds variants
// and images per product — idempotent, no unique violations on re-run.
import type { AttrType, ImageKind, Prisma } from '@prisma/client';
import { slugify } from '../../src/common/utils/slug.util.js';
import type { Transaction } from '../../src/db/transaction-types.js';
import { ATTRIBUTES } from './attributes.js';
import { BRANDS } from './brands.js';
import type { BrandKey } from './brands.js';
import { PRODUCT_CATEGORY_CODES as PCC } from './categories.js';
import { commaNumber, makeGtin13, mm, pick, round2, wobble } from './util.js';

/** Slug of the spec's flagship family (checked by verify.ts). */
export const FLAGSHIP_SLUG = slugify('Centre drill HSS-E A TiAlN');

// ── specs ────────────────────────────────────────────────────────────────────

export interface VariantSpec {
  articleNo: string;
  ean: string | null;
  name: string | null;
  listPrice: number;
  stockQty: number;
  leadTimeMinDays: number | null;
  leadTimeMaxDays: number | null;
  minOrderQty: number;
  packSize: number;
  /** attribute key → value (STRING/ENUM as string, NUMBER as number). */
  attributes: Record<string, string | number>;
  tiers?: ReadonlyArray<{ minQty: number; price: number }>;
}

export interface ProductImageSpec {
  publicId: string;
  kind: ImageKind;
  alt: string;
}

export interface ProductSpec {
  slug: string;
  name: string;
  brandKey: BrandKey;
  categoryCode: string;
  shortDescription: string;
  descriptionHtml: string | null;
  isBestseller: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  variants: VariantSpec[];
  images: ProductImageSpec[];
}

// ── shared generator helpers (deterministic) ────────────────────────────────

interface Builder {
  claimSlug(name: string): string;
  claimArticle(articleNo: string): void;
  nextEan(seed: string, forced?: boolean): string | null;
  availability(seed: string): { stockQty: number; leadTimeMinDays: number | null; leadTimeMaxDays: number | null };
}

function createBuilder(): Builder {
  const usedSlugs = new Set<string>();
  const usedArticles = new Set<string>();
  let eanCounter = 0;
  return {
    claimSlug(name) {
      const slug = slugify(name);
      if (usedSlugs.has(slug)) throw new Error(`Duplicate product slug '${slug}'`);
      usedSlugs.add(slug);
      return slug;
    },
    claimArticle(articleNo) {
      if (usedArticles.has(articleNo)) throw new Error(`Duplicate article number '${articleNo}'`);
      usedArticles.add(articleNo);
    },
    nextEan(seed, forced = false) {
      if (!forced && pick(`ean:${seed}`, 10) >= 6) return null; // ~60 % carry a GTIN-13
      eanCounter += 1;
      return makeGtin13(`890${String(eanCounter).padStart(9, '0')}`);
    },
    availability(seed) {
      const r = pick(`avail:${seed}`, 10);
      if (r === 0) return { stockQty: 0, leadTimeMinDays: 11, leadTimeMaxDays: 14 };
      if (r === 1) return { stockQty: 0, leadTimeMinDays: 5, leadTimeMaxDays: 9 };
      return { stockQty: 2 + pick(`stock:${seed}`, 60), leadTimeMinDays: null, leadTimeMaxDays: null };
    },
  };
}

function choose<T>(items: readonly T[], seed: string): T {
  const picked = items[pick(seed, items.length)];
  if (picked === undefined) throw new Error(`choose: empty set for seed '${seed}'`);
  return picked;
}

/** Quantity tiers for a list price: 10 → −5 %, 50 → −8 %, 100 → −12 % (2dp, ≤ list). */
function tierFor(listPrice: number): ReadonlyArray<{ minQty: number; price: number }> {
  return [
    { minQty: 10, price: round2(listPrice * 0.95) },
    { minQty: 50, price: round2(listPrice * 0.92) },
    { minQty: 100, price: round2(listPrice * 0.88) },
  ];
}

function imageSpecs(slug: string, name: string, isFlagship: boolean): ProductImageSpec[] {
  const photos = isFlagship ? 3 : 1 + pick(`img:${slug}`, 3); // 1–3 photos per family
  const images: ProductImageSpec[] = [];
  for (let k = 1; k <= photos; k += 1) {
    images.push({ publicId: `catalog/products/${slug}/photo-${k}.svg`, kind: 'PHOTO', alt: `${name} — product photo ${k}` });
  }
  if (isFlagship) {
    images.push({ publicId: `catalog/products/${slug}/drawing-1.svg`, kind: 'DRAWING', alt: `${name} — dimensional drawing to DIN 333` });
    images.push({ publicId: `catalog/products/${slug}/technical-1.svg`, kind: 'TECHNICAL', alt: `${name} — technical data` });
  }
  return images;
}

// ── flagship ─────────────────────────────────────────────────────────────────

const FLAGSHIP_ROWS: ReadonlyArray<{ d: number; price: number; stock: number; lead?: readonly [number, number] }> = [
  { d: 0.5, price: 2357.3, stock: 12 },
  { d: 0.75, price: 2352.5, stock: 8 },
  { d: 1, price: 2347.8, stock: 25 },
  { d: 1.6, price: 2338.1, stock: 0, lead: [11, 14] },
  { d: 1.5, price: 2342.6, stock: 40 },
  { d: 2, price: 2333.4, stock: 5 },
  { d: 2.5, price: 2326.9, stock: 60 },
  { d: 3, price: 2318.2, stock: 0, lead: [5, 9] },
  { d: 3.15, price: 2302.3, stock: 18 },
  { d: 4, price: 2361.7, stock: 7 },
  { d: 5, price: 2389.9, stock: 22 },
];

const FLAGSHIP_HTML = [
  '<p><strong>Centre drill HSS-E A TiAlN</strong> — Garaveta\'s premium type A centre drill to <strong>DIN 333</strong> for producing accurate centre holes in workpieces machined between centres.</p>',
  '<ul>',
  '<li><strong>Substrate:</strong> cobalt-enriched HSS-E (M35) for high hot hardness and secure cutting edges</li>',
  '<li><strong>Coating:</strong> TiAlN multilayer PVD coating for dry machining and elevated cutting speeds</li>',
  '<li><strong>Geometry:</strong> type A to DIN 333, tolerance class k12, shaft ⌀ 3.15 mm, overall length 25 mm</li>',
  '<li><strong>Range:</strong> nominal ⌀ 0.5 – 5 mm in eleven sizes, article numbers 111100 0,5 – 111100 5</li>',
  '<li><strong>Traceability:</strong> batch-numbered, material certificate available on request</li>',
  '</ul>',
  '<p>Buy online at ToolHub India with live stock per variant, quantity price tiers and GST invoicing.</p>',
].join('');

function buildFlagship(b: Builder): ProductSpec {
  const name = 'Centre drill HSS-E A TiAlN';
  const slug = b.claimSlug(name);
  const variants: VariantSpec[] = FLAGSHIP_ROWS.map((row, i) => {
    const articleNo = `111100 ${commaNumber(row.d)}`;
    b.claimArticle(articleNo);
    return {
      articleNo,
      ean: b.nextEan(`${slug}:${articleNo}`, true),
      name: null,
      listPrice: row.price,
      stockQty: row.stock,
      leadTimeMinDays: row.lead?.[0] ?? null,
      leadTimeMaxDays: row.lead?.[1] ?? null,
      minOrderQty: 1,
      packSize: 1,
      attributes: {
        cutter_diameter_nominal: row.d,
        tool_material: 'HSS-E',
        coating: 'TiAlN',
        drilling_tool_type: 'centre drill type A',
        shaft_diameter: 3.15,
        overall_length: 25,
        din_standard: 'DIN 333',
        tolerance_class: 'k12',
      },
      tiers: i === 2 || i === 9 ? tierFor(row.price) : undefined,
    };
  });
  return {
    slug,
    name,
    brandKey: 'garaveta',
    categoryCode: PCC.centreDrills,
    shortDescription:
      'Garaveta centre drill type A to DIN 333 — HSS-E substrate with TiAlN PVD coating, ⌀ 0.5–5 mm, tolerance k12, shaft ⌀ 3.15 mm.',
    descriptionHtml: FLAGSHIP_HTML,
    isBestseller: true,
    seoTitle: 'Centre drill HSS-E A TiAlN, DIN 333 | ToolHub India',
    seoDescription:
      'Garaveta centre drill type A to DIN 333 — HSS-E with TiAlN coating, ⌀ 0.5–5 mm, list price from ₹2,302.30. Live stock, B2B quantity tiers and GST invoicing.',
    variants,
    images: [],
  };
}

// ── generated drill families (the three mapped categories) ───────────────────

const CENTRE_MATERIALS = ['HSS', 'HSS-Co', 'HSS-E'] as const;
const CENTRE_SHAPES = ['A', 'B', 'R'] as const;
const DRILL_COATINGS = ['TiAlN', 'TiN', 'TiCN', 'uncoated'] as const;
const NC_COATINGS = ['uncoated', 'TiN', 'TiAlN'] as const;
const NC_ANGLES = [90, 120] as const;
const ECONOMY_BRANDS = ['ferrotool', 'bharat-precision', 'aurum-tools'] as const;
const MAT_RANK: Record<(typeof CENTRE_MATERIALS)[number], number> = { HSS: 0, 'HSS-Co': 1, 'HSS-E': 2 };
const COAT_RANK: Record<(typeof DRILL_COATINGS)[number], number> = { TiAlN: 3, TiCN: 2, TiN: 1, uncoated: 0 };
const CENTRE_BASE: Record<(typeof CENTRE_MATERIALS)[number], number> = { HSS: 300, 'HSS-Co': 430, 'HSS-E': 540 };
const NC_BASE: Record<(typeof CENTRE_MATERIALS)[number], number> = { HSS: 260, 'HSS-Co': 380, 'HSS-E': 460 };
const JOBBER_BASE: Record<(typeof CENTRE_MATERIALS)[number], number> = { HSS: 170, 'HSS-Co': 240, 'HSS-E': 320 };

const CENTRE_SIZE_SETS: ReadonlyArray<readonly number[]> = [
  [1, 1.5, 2, 2.5, 3.15],
  [0.5, 0.75, 1, 1.5, 2],
  [2, 2.5, 3.15, 4, 5],
  [1, 2, 3, 4, 5, 6.3],
  [0.5, 1, 1.6, 2.5, 3.15, 4, 5],
  [3.15, 4, 5, 6.3, 8, 10],
  [1, 1.6, 2.5, 4],
  [2.5, 3.15, 4, 5, 6.3, 8, 10, 12.5],
  [4, 5, 6.3, 8, 10, 12.5, 16, 20],
  [1.5, 2, 3.15, 5, 8, 10],
  [3.15, 5],
  [2, 3],
];
const NC_SIZE_SETS: ReadonlyArray<readonly number[]> = [
  [4, 6, 8, 10],
  [3, 4, 5, 6, 8, 10, 12],
  [5, 8, 10, 12, 16, 20],
  [4, 5, 6],
  [8, 10, 12, 16],
  [3, 5, 8, 12, 16, 20],
  [6, 8, 10],
  [4, 8, 12, 16, 20],
];
const JOBBER_SIZE_SETS: ReadonlyArray<readonly number[]> = [
  [1, 1.5, 2, 2.5, 3, 3.15, 4, 5, 6.3, 8, 10, 12.5],
  [0.6, 0.8, 1, 1.2, 1.6, 2, 2.5, 3.15],
  [2, 3, 4, 5, 6.3, 8],
  [1, 2, 3.15, 5, 8, 10],
  [0.8, 1.6, 2.5, 4, 6.3, 10, 12.5],
  [2, 4, 6.3, 8],
];

function coatingPhrase(coating: string): string {
  return coating === 'uncoated' ? 'uncoated' : `with ${coating} PVD coating`;
}

/** Plausible shaft/length scaling for non-flagship centre drills (DIN 333). */
function centreDims(d: number): { shaft: number; length: number } {
  if (d <= 2) return { shaft: 3.15, length: 25 };
  if (d <= 3.15) return { shaft: 4, length: 32 };
  if (d <= 5) return { shaft: 6.3, length: 40 };
  return { shaft: 10, length: 56 };
}

interface DrillFamilySpec {
  name: string;
  brand: BrandKey;
  categoryCode: string;
  articleBase: string;
  diameters: readonly number[];
  basePrice: number;
  blurb: string;
  attrs: (d: number) => Record<string, string | number>;
  pack?: readonly [number, number];
}

function drillFamily(b: Builder, spec: DrillFamilySpec): ProductSpec {
  const slug = b.claimSlug(spec.name);
  const variants: VariantSpec[] = spec.diameters.map((d) => {
    const articleNo = `${spec.articleBase} ${commaNumber(d)}`;
    b.claimArticle(articleNo);
    const avail = b.availability(articleNo);
    return {
      articleNo,
      ean: b.nextEan(`${slug}:${articleNo}`),
      name: null,
      listPrice: Math.max(150, round2(spec.basePrice * d ** 0.42 * wobble(`p:${slug}:${articleNo}`))),
      stockQty: avail.stockQty,
      leadTimeMinDays: avail.leadTimeMinDays,
      leadTimeMaxDays: avail.leadTimeMaxDays,
      minOrderQty: spec.pack?.[0] ?? 1,
      packSize: spec.pack?.[1] ?? 1,
      attributes: spec.attrs(d),
    };
  });
  return {
    slug,
    name: spec.name,
    brandKey: spec.brand,
    categoryCode: spec.categoryCode,
    shortDescription: spec.blurb,
    descriptionHtml: null,
    isBestseller: false,
    seoTitle: null,
    seoDescription: null,
    variants,
    images: [],
  };
}

function centreDrillFamilies(b: Builder): ProductSpec[] {
  const combos = CENTRE_MATERIALS.flatMap((material) =>
    CENTRE_SHAPES.flatMap((shape) => DRILL_COATINGS.map((coating) => ({ material, shape, coating }))),
  )
    // the flagship family already covers this exact combination
    .filter((c) => !(c.material === 'HSS-E' && c.shape === 'A' && c.coating === 'TiAlN'))
    .slice(0, 30);
  return combos.map((c, i) => {
    const score = MAT_RANK[c.material] + COAT_RANK[c.coating];
    const brand: BrandKey =
      score >= 4 ? 'garaveta' : score === 3 ? 'holexa' : choose(ECONOMY_BRANDS, `brand:${c.material}${c.coating}`);
    const diameters = choose(CENTRE_SIZE_SETS, `sz:cd:${c.material}:${c.shape}:${c.coating}`);
    const [min, max] = [Math.min(...diameters), Math.max(...diameters)];
    return drillFamily(b, {
      name: `Centre drill ${c.material} ${c.shape} ${c.coating}`,
      brand,
      categoryCode: PCC.centreDrills,
      articleBase: String(111101 + i),
      diameters,
      basePrice: CENTRE_BASE[c.material],
      blurb: `Centre drill type ${c.shape} to DIN 333 for accurate centre holes — ${c.material} ${coatingPhrase(c.coating)}, ${diameters.length} sizes from ⌀ ${mm(min)} to ${mm(max)} mm.`,
      attrs: (d) => {
        const dims = centreDims(d);
        return {
          cutter_diameter_nominal: d,
          tool_material: c.material,
          coating: c.coating,
          drilling_tool_type: `centre drill type ${c.shape}`,
          shaft_diameter: dims.shaft,
          overall_length: dims.length,
          din_standard: 'DIN 333',
          tolerance_class: 'k12',
        };
      },
    });
  });
}

function ncSpottingFamilies(b: Builder): ProductSpec[] {
  const combos = CENTRE_MATERIALS.flatMap((material) =>
    NC_ANGLES.flatMap((angle) => NC_COATINGS.map((coating) => ({ material, angle, coating }))),
  ).slice(0, 15);
  return combos.map((c, i) => {
    const score = MAT_RANK[c.material] + COAT_RANK[c.coating];
    const brand: BrandKey =
      score >= 4 ? 'garaveta' : score === 3 ? 'holexa' : choose(ECONOMY_BRANDS, `brand:nc:${c.material}${c.coating}`);
    const diameters = choose(NC_SIZE_SETS, `sz:nc:${c.material}:${c.angle}:${c.coating}`);
    const [min, max] = [Math.min(...diameters), Math.max(...diameters)];
    return drillFamily(b, {
      name: `NC spotting drill ${c.material} ${c.angle}° ${c.coating}`,
      brand,
      categoryCode: PCC.ncSpottingDrills,
      articleBase: String(111201 + i),
      diameters,
      basePrice: NC_BASE[c.material],
      blurb: `NC spotting drill with ${c.angle}° point for precise hole location on CNC machines — ${c.material} ${coatingPhrase(c.coating)}, ${diameters.length} sizes from ⌀ ${mm(min)} to ${mm(max)} mm.`,
      attrs: (d) => ({
        cutter_diameter_nominal: d,
        tool_material: c.material,
        coating: c.coating,
        drilling_tool_type: 'NC spotting drill',
        overall_length: Math.round(38 + d * 2.7),
      }),
    });
  });
}

function jobberFamilies(b: Builder): ProductSpec[] {
  const shortCombos = CENTRE_MATERIALS.flatMap((material) =>
    DRILL_COATINGS.map((coating) => ({ material, coating, long: false })),
  );
  const longCombos: Array<{ material: (typeof CENTRE_MATERIALS)[number]; coating: (typeof DRILL_COATINGS)[number]; long: boolean }> = [
    { material: 'HSS-E', coating: 'TiAlN', long: true },
    { material: 'HSS-Co', coating: 'TiCN', long: true },
    { material: 'HSS', coating: 'TiN', long: true },
  ];
  return [...shortCombos, ...longCombos].slice(0, 15).map((c, i) => {
    const score = MAT_RANK[c.material] + COAT_RANK[c.coating];
    const brand: BrandKey = score >= 3 ? 'holexa' : choose(ECONOMY_BRANDS, `brand:jb:${c.material}${c.coating}`);
    const diameters = c.long ? [3, 4, 5, 6, 8, 10] : choose(JOBBER_SIZE_SETS, `sz:jb:${c.material}:${c.coating}`);
    const [min, max] = [Math.min(...diameters), Math.max(...diameters)];
    const ratio = c.long ? 15 : 9;
    return drillFamily(b, {
      name: `Jobber drill ${c.material} ${c.coating}${c.long ? ' long' : ''}`,
      brand,
      categoryCode: PCC.jobberDrills,
      articleBase: String(111301 + i),
      diameters,
      basePrice: JOBBER_BASE[c.material],
      blurb: `Jobber drill to DIN 338 — ${c.material} ${coatingPhrase(c.coating)}, flute length ≈ ${ratio}×D, ${diameters.length} sizes from ⌀ ${mm(min)} to ${mm(max)} mm.`,
      pack: c.material === 'HSS' && c.coating === 'uncoated' ? [10, 10] : c.material === 'HSS' && c.coating === 'TiN' ? [5, 5] : undefined,
      attrs: (d) => ({
        cutter_diameter_nominal: d,
        tool_material: c.material,
        coating: c.coating,
        flute_length: String(Math.round(d * ratio)),
        diameter_ratio: `${ratio}xD`,
      }),
    });
  });
}

// ── other leaf categories (hand-written catalogue table) ────────────────────

type OtherPack = readonly [minOrderQty: number, packSize: number];

interface OtherFamilyDef {
  categoryCode: string;
  brandKey: BrandKey;
  name: string;
  blurb: string;
  sizes: string[];
  base: number;
  step: number;
  pack?: OtherPack;
}

function o(
  cat: string,
  brandKey: BrandKey,
  name: string,
  sizes: string,
  base: number,
  step: number,
  blurb: string,
  pack?: OtherPack,
): OtherFamilyDef {
  return { categoryCode: cat, brandKey, name, blurb, sizes: sizes.split('|'), base, step, pack };
}

const OTHER_CATALOG: OtherFamilyDef[] = [
  // Machining — milling, tapping, boring, hole making
  o(PCC.milling, 'garaveta', 'End mill solid carbide 4-flute TiAlN', '3 mm|4 mm|5 mm|6 mm|8 mm|10 mm', 1150, 260, 'General-purpose 4-flute carbide end mill with TiAlN coating for steel and stainless steel.'),
  o(PCC.milling, 'holexa', 'End mill solid carbide 2-flute TiAlN', '1 mm|2 mm|3 mm|4 mm|6 mm|8 mm|10 mm', 980, 220, '2-flute carbide end mill for slotting and plunging in steels up to 48 HRC.'),
  o(PCC.milling, 'aurum-tools', 'Ball nose end mill carbide 2-flute TiAlN', '1 mm|2 mm|3 mm|4 mm|6 mm|8 mm', 1240, 310, 'Ball nose end mill for 3D surfacing and die moulding with polished flutes.'),
  o(PCC.milling, 'holexa', 'Slot drill carbide 4-flute uncoated', '3 mm|4 mm|5 mm|6 mm|8 mm|10 mm|12 mm', 890, 190, 'Uncoated 4-flute slot drill for non-ferrous metals and free-cutting steel.'),
  o(PCC.milling, 'ferrotool', 'Roughing end mill HSS-Co TiCN', '6 mm|8 mm|10 mm|12 mm|16 mm|20 mm', 720, 240, 'Corn-cob roughing end mill for high stock removal in steel castings.'),
  o(PCC.milling, 'ferrotool', 'Shell end mill HSS-Co TiCN', '20 mm|25 mm|32 mm|40 mm|50 mm', 2400, 900, 'Shell-type face mill for face milling on medium-power machining centres.'),
  o(PCC.milling, 'aurum-tools', 'Chamfer mill carbide 90° TiAlN', '4 mm|6 mm|8 mm|10 mm|12 mm|16 mm', 1350, 380, '90° chamfer mill for deburring and chamfering straight edges and holes.'),
  o(PCC.milling, 'bharat-precision', 'End mill set carbide 10 pcs TiAlN', '1–10 mm, 10 pcs', 8900, 0, 'Ten-piece carbide end mill set 1–10 mm in a wooden case, TiAlN coated.'),
  o(PCC.taps, 'holexa', 'Machine tap spiral flute HSS-E TiCN', 'M3|M4|M5|M6|M8|M10|M12', 640, 180, 'Spiral-flute machine tap for blind-hole threading in alloyed steel.'),
  o(PCC.taps, 'holexa', 'Machine tap spiral point HSS-E TiN', 'M2|M2.5|M3|M4|M5|M6|M8|M10', 590, 170, 'Spiral-point machine tap for through-hole threading with forward chip flow.'),
  o(PCC.taps, 'ferrotool', 'Hand tap set HSS 3 pcs', 'M3|M4|M5|M6|M8|M10|M12', 380, 150, 'Three-piece hand tap set (taper, second, plug) for manual threading.'),
  o(PCC.taps, 'garaveta', 'Machine tap for stainless steel HSS-E TiAlN', 'M3|M4|M5|M6|M8|M10|M12|M14|M16', 880, 260, 'Premium machine tap geometry for austenitic stainless steel and duplex grades.'),
  o(PCC.taps, 'ferrotool', 'Straight flute tap HSS', 'M4|M5|M6|M8|M10|M12|M16|M20', 320, 140, 'Classic straight-flute tap for general-purpose machine and hand threading.'),
  o(PCC.flutelessTaps, 'holexa', 'Fluteless form tap HSS-E TiCN', 'M2.5|M3|M4|M5|M6|M8|M10', 760, 220, 'Cold-forming tap for chip-free threading in ductile steel and aluminium.'),
  o(PCC.flutelessTaps, 'holexa', 'Fluteless form tap for aluminium TiCN', 'M3|M4|M5|M6|M8|M10|M12', 690, 200, 'Optimised fluteless tap geometry for low-silicon aluminium alloys.'),
  o(PCC.boringTools, 'garaveta', 'Boring head with dial graduation', '12 mm shank|20 mm shank|32 mm shank', 5800, 1500, 'Precision boring head with 0.01 mm dial for fine-boring on milling machines.'),
  o(PCC.boringTools, 'ferrotool', 'Boring bar set carbide tipped 6 pcs', '6 pcs', 3400, 0, 'Six-piece carbide-tipped boring bar set for lathe tooling.'),
  o(PCC.boringTools, 'garaveta', 'Adjustable fine boring head', 'Ø 20–52 mm|Ø 55–150 mm', 12400, 5800, 'Two-range fine boring head with balanced cartridge for CNC boring.'),
  o(PCC.countersinkTools, 'ferrotool', 'Countersink 90° HSS', 'Ø 6.3 mm|Ø 8.3 mm|Ø 12.4 mm|Ø 20.5 mm', 460, 220, 'Single-flute 90° countersink for clean seat faces under cap screws.'),
  o(PCC.countersinkTools, 'bharat-precision', 'Carbide deburring tool set', '5 pcs', 1290, 0, 'Five-piece carbide deburring set for holes, edges and cross-drilled ports.'),
  o(PCC.countersinkTools, 'holexa', 'Back deburring tool for through holes', '6–9 mm|9–14 mm', 2150, 900, 'Back-deburring tool that reaches the far side of through holes.'),
  o(PCC.reamingTools, 'holexa', 'Chucking reamer HSS', 'Ø 4 mm|Ø 5 mm|Ø 6 mm|Ø 8 mm|Ø 10 mm|Ø 12 mm|Ø 16 mm', 620, 230, 'Machine chucking reamer to DIN 212 for pre-drilled holes.'),
  o(PCC.reamingTools, 'ferrotool', 'Hand reamer HSS', 'Ø 4 mm|Ø 6 mm|Ø 8 mm|Ø 10 mm|Ø 12 mm|Ø 16 mm|Ø 20 mm|Ø 25 mm', 540, 260, 'Hand reamer with square drive for finishing holes to H7.'),
  o(PCC.reamingTools, 'garaveta', 'Machine reamer carbide TiAlN', 'Ø 5 mm|Ø 6 mm|Ø 8 mm|Ø 10 mm|Ø 12 mm|Ø 14 mm', 1980, 640, 'Carbide machine reamer for high-volume reaming of cast iron and steel.'),
  o(PCC.taperDrills, 'ferrotool', 'Taper shank drill HSS Morse', 'Ø 10 mm MK2|Ø 13 mm MK2|Ø 16 mm MK3|Ø 20 mm MK3|Ø 25 mm MK4', 1250, 780, 'Morse-taper shank drill for heavy-duty drilling on pillar drills.'),
  o(PCC.taperDrills, 'holexa', 'Taper shank drill HSS-Co TiN', 'Ø 12 mm MK2|Ø 18 mm MK3|Ø 23 mm MK3|Ø 32 mm MK4', 1980, 1100, 'HSS-Co taper-shank drill with TiN coating for tough alloyed steel.'),
  o(PCC.steppedDrills, 'holexa', 'Stepped drill TiN', '4–12 mm|4–20 mm|4–30 mm', 1650, 720, 'Stepped drill that drills and deburs thirteen hole sizes in one pass.'),
  o(PCC.steppedDrills, 'bharat-precision', 'Stepped drill HSS uncoated', '4–12 mm|4–20 mm', 980, 430, 'Value stepped drill for sheet metal and electrical panels.'),
  o(PCC.deepHoleDrills, 'aurum-tools', 'Deep hole drill carbide 10xD', 'Ø 4 mm|Ø 6 mm|Ø 8 mm|Ø 10 mm', 2900, 860, 'Carbide deep-hole drill with internal coolant channels for 10xD bores.'),
  o(PCC.deepHoleDrills, 'garaveta', 'Gun drill carbide coolant-through', 'Ø 3 mm|Ø 5 mm|Ø 8 mm|Ø 12 mm', 3800, 1250, 'Single-flute gun drill for roundness-critical deep bores.'),
  o(PCC.microdrills, 'aurum-tools', 'Microdrill solid carbide', 'Ø 0.2 mm|Ø 0.3 mm|Ø 0.5 mm|Ø 0.8 mm|Ø 1 mm|Ø 1.5 mm', 640, 180, 'Solid-carbide microdrill for PCB and toolroom work below 2 mm.'),
  o(PCC.microdrills, 'bharat-precision', 'Microdrill HSS', 'Ø 0.3 mm|Ø 0.5 mm|Ø 0.8 mm|Ø 1 mm|Ø 2 mm', 210, 90, 'HSS microdrill for soft materials and model making.'),
  o(PCC.coreDrills, 'holexa', 'Annular core cutter HSS-Co', 'Ø 12 mm|Ø 18 mm|Ø 25 mm|Ø 32 mm|Ø 40 mm', 1900, 820, 'Annular core cutter for magnetic-base drills, depth 35 mm.'),
  o(PCC.coreDrills, 'garaveta', 'Core cutter with carbide tips', 'Ø 14 mm|Ø 22 mm|Ø 30 mm|Ø 50 mm', 3200, 1400, 'Carbide-tipped core cutter for structural steel up to 50 mm depth.'),
  o(PCC.holeSaws, 'bharat-precision', 'Bi-metal hole saw', 'Ø 14 mm|Ø 20 mm|Ø 30 mm|Ø 44 mm|Ø 51 mm|Ø 64 mm', 320, 180, 'Bi-metal hole saw for steel, aluminium and wood.'),
  o(PCC.holeSaws, 'holexa', 'Hole saw carbide grit for stainless', 'Ø 20 mm|Ø 28 mm|Ø 40 mm|Ø 60 mm', 940, 380, 'Carbide-grit hole saw for thin stainless sheet and profiles.'),
  o(PCC.holeSaws, 'bharat-precision', 'Hole saw set 9 pcs', '9 pcs, 14–51 mm', 2400, 0, 'Nine-piece hole saw set with mandrel and pilot drills.'),
  o(PCC.woodDrills, 'bharat-precision', 'Brad point drill set HSS 7 pcs', '7 pcs, 3–10 mm', 1350, 0, 'Brad-point wood drill set for splinter-free holes in hardwood.'),
  o(PCC.woodDrills, 'ferrotool', 'Spade drill flat bit HSS', '12 mm|16 mm|20 mm|25 mm|32 mm', 190, 110, 'Flat spade bit for rough boring in softwood and framing timber.'),
  o(PCC.flowDrills, 'aurum-tools', 'Flow drill carbide', 'M4|M5|M6|M8|M10', 2100, 560, 'Carbide flow drill that forms load-bearing bushings in thin sheet.'),
  o(PCC.flowDrills, 'aurum-tools', 'Flow drill for aluminium', 'M5|M6|M8', 1850, 420, 'Flow drill geometry tuned for aluminium and copper alloys.'),
  // Metrology
  o(PCC.calipers, 'precisiona', 'Digital caliper IP54', '0–150 mm|0–200 mm|0–300 mm', 2400, 1100, 'IP54 digital caliper with 0.01 mm resolution and data output.'),
  o(PCC.calipers, 'precisiona', 'Digital caliper IP67 coolant-proof', '0–150 mm|0–200 mm|0–300 mm', 5800, 2400, 'Coolant-proof IP67 digital caliper for machine-side measurement.'),
  o(PCC.calipers, 'precisiona', 'Dial caliper 0.02 mm', '0–150 mm|0–200 mm', 1900, 600, 'Dial caliper with 0.02 mm graduation, battery-free.'),
  o(PCC.calipers, 'bharat-precision', 'Vernier caliper stainless', '0–150 mm|0–200 mm|0–300 mm', 850, 450, 'Stainless vernier caliper to IS 3651 for workshop use.'),
  o(PCC.micrometers, 'precisiona', 'Outside micrometer analog', '0–25 mm|25–50 mm|50–75 mm|75–100 mm', 3200, 700, 'Mechanical outside micrometer with 0.01 mm and ratchet stop.'),
  o(PCC.micrometers, 'precisiona', 'Digital outside micrometer', '0–25 mm|25–50 mm', 6400, 1200, 'Digital outside micrometer with 0.001 mm resolution.'),
  o(PCC.micrometers, 'precisiona', 'Digital micrometer with data output', '0–25 mm', 8900, 0, 'Digital micrometer with USB data output for SPC collection.'),
  o(PCC.dialGauges, 'precisiona', 'Dial gauge 0.01 mm', '0–10 mm|0–20 mm', 1450, 500, 'Lever dial gauge to DIN 878 for run-out and alignment checks.'),
  o(PCC.dialGauges, 'precisiona', 'Lever dial gauge 0.002 mm', '0–0.8 mm', 3900, 0, 'Precision lever dial gauge for grinding and metrology setups.'),
  o(PCC.heightGauges, 'precisiona', 'Digital height gauge', '0–300 mm|0–600 mm', 18500, 9500, 'Digital height gauge on a hardened beam with scriber and holder.'),
  o(PCC.heightGauges, 'bharat-precision', 'Vernier height gauge', '0–300 mm|0–600 mm', 7400, 3600, 'Vernier height gauge with sliding depth base for layout work.'),
  o(PCC.precisionLevels, 'precisiona', 'Precision machinist level 0.02 mm/m', '200 mm|300 mm', 6800, 3100, 'Ground machinist level with 0.02 mm/m vial for machine setup.'),
  o(PCC.precisionLevels, 'precisiona', 'Frame level 0.02 mm/m', '150 mm', 4900, 0, 'Cast-iron frame level for levelling machine beds.'),
  o(PCC.roughnessTesters, 'precisiona', 'Portable surface roughness tester', 'Ra / Rz', 42500, 0, 'Portable roughness tester for Ra, Rz and Rq on machined faces.'),
  o(PCC.roughnessTesters, 'precisiona', 'Roughness tester with printer', 'Ra / Rz / Rsk', 38500, 0, 'Skidless roughness tester with built-in printer and statistics.'),
  o(PCC.surfacePlates, 'precisiona', 'Granite surface plate grade 0', '300 × 300 mm|400 × 400 mm|630 × 400 mm', 8500, 4800, 'Grade-0 granite surface plate with calibration certificate.'),
  o(PCC.surfacePlates, 'bharat-precision', 'Cast iron surface plate', '300 × 300 mm|450 × 600 mm', 5900, 3800, 'Seasoned cast-iron surface plate, hand-scraped.'),
  o(PCC.hardnessTesters, 'precisiona', 'Portable hardness tester', 'Leeb, D-probe', 41500, 0, 'Portable Leeb hardness tester for on-site hardness checks.'),
  // Clamping technology
  o(PCC.drillVises, 'gripforge', 'Drill vise cast steel', '100 mm|130 mm|160 mm', 1900, 850, 'Cast-steel drill vise with V-grooved jaws for round stock.'),
  o(PCC.drillVises, 'gripforge', 'Cross-slide drill vise', '100 mm', 4800, 0, 'Cross-slide vise for drilling and light milling on drill presses.'),
  o(PCC.machineVices, 'gripforge', 'Precision machine vise', '100 mm|130 mm|160 mm', 9800, 4200, 'Grind-all precision vise with 0.01 mm parallelism for milling.'),
  o(PCC.machineVices, 'gripforge', 'Double-station machine vise', '2 × 125 mm', 18500, 0, 'Double-station vise for two-part fixturing on machining centres.'),
  o(PCC.machineVices, 'gripforge', 'Self-centring vise', '125 mm|160 mm', 14200, 5600, 'Self-centring vise for round and square bar batching.'),
  o(PCC.angleVises, 'gripforge', 'Precision angle vise', '100 mm|130 mm', 6400, 2100, 'Angle vise with 45°/90° positive stops for angled drilling.'),
  o(PCC.toolmakersVises, 'gripforge', "Toolmaker's vise hardened", '50 mm|75 mm|100 mm', 1600, 900, 'Hardened toolmaker’s vise, ground on all faces for EDM and grinding.'),
  o(PCC.clampingBolts, 'gripforge', 'T-slot clamping bolt set', 'M10|M12|M16', 640, 380, 'Hex-socket T-slot bolt sets with flanged nuts.', [5, 5]),
  o(PCC.stepClampKits, 'gripforge', 'Step clamp kit 23 pcs', '23 pcs, M12', 2100, 0, 'Twenty-three-piece step clamp kit in a steel case.'),
  o(PCC.stepClampKits, 'gripforge', 'Step clamp kit 52 pcs', '52 pcs, M16', 3900, 0, 'Fifty-two-piece step clamp kit for large T-slot tables.'),
  o(PCC.tSlotBolts, 'gripforge', 'T-slot bolt set', 'M12|M16', 480, 260, 'T-slot bolts with stepped washers for mill tables.', [10, 10]),
  o(PCC.clampingStraps, 'gripforge', 'Clamping strap set', '6 pcs, M12', 720, 0, 'Six-piece clamping strap set with bridge nuts.', [5, 5]),
  o(PCC.drillChucks, 'voltmaster', 'Keyless drill chuck with arbor', '1.5–13 mm|3–16 mm', 2800, 1100, 'Keyless drill chuck with MK arbor, auto-lock.'),
  o(PCC.drillChucks, 'voltmaster', 'Keyed drill chuck with MK arbor', '2–13 mm|3–16 mm', 1900, 700, 'Keyed drill chuck with integral Morse taper arbor.'),
  o(PCC.colletChucks, 'voltmaster', 'ER collet chuck set', 'ER16|ER25|ER32', 4500, 1800, 'ER collet chuck with nut and spanner, BT-flange on request.'),
  o(PCC.colletChucks, 'voltmaster', 'ER collet set 10 pcs', 'ER25, 2–16 mm', 2900, 0, 'Ten-piece ER25 collet set, 0.010 mm TIR.'),
  o(PCC.zeroPointPins, 'gripforge', 'Zero-point clamping pin', 'Ø 52 mm|Ø 96 mm|Ø 138 mm', 3600, 1500, 'Zero-point clamping pin for palletised five-axis fixturing.'),
  // Hand tools
  o(PCC.ballPeenHammers, 'ferrotool', 'Ball peen hammer', '300 g|500 g|800 g|1000 g', 480, 320, 'Forged ball peen hammer with hickory handle.'),
  o(PCC.ballPeenHammers, 'ferrotool', 'Ball peen hammer soft-grip', '500 g|1000 g', 560, 340, 'Ball peen hammer with welded soft-grip handle for heavy striking.'),
  o(PCC.softFaceMallets, 'ferrotool', 'Soft-face mallet 3-piece set', '27 / 35 / 45 mm', 1150, 0, 'Three-face dead-blow mallet set with replaceable inserts.'),
  o(PCC.deadBlowHammers, 'ferrotool', 'Dead blow hammer', '680 g|1130 g|1700 g', 890, 450, 'Shot-filled dead blow hammer that will not rebound.'),
  o(PCC.sledgeHammers, 'ferrotool', "Engineer's sledge hammer", '1000 g|2000 g|3000 g', 1150, 680, 'Fiberglass-handled sledge hammer for chipping and driving.'),
  o(PCC.slottedScrewdrivers, 'ferrotool', 'Slotted screwdriver set 6 pcs', '6 pcs, 2.5–8 mm', 780, 0, 'Six-piece slotted screwdriver set with black-tip blades.'),
  o(PCC.phillipsScrewdrivers, 'ferrotool', 'Phillips screwdriver set 5 pcs', '5 pcs, PH1–PH4', 690, 0, 'Five-piece Phillips screwdriver set for assembly lines.'),
  o(PCC.torxScrewdrivers, 'ferrotool', 'Torx screwdriver set 8 pcs', '8 pcs, T9–T40', 940, 0, 'Eight-piece Torx screwdriver set with cushion grips.'),
  o(PCC.precisionScrewdriverSets, 'ferrotool', 'Precision screwdriver set 24 pcs', '24 pcs, slotted + PH + Torx', 1180, 0, 'Twenty-four-piece precision set for electronics and toolmaking.'),
  o(PCC.combinationWrenches, 'torqueline', 'Combination wrench set 8–19 mm 12 pcs', '12 pcs', 2200, 0, 'Twelve-piece combination wrench set, 12-point ring.'),
  o(PCC.combinationWrenches, 'torqueline', 'Combination wrench set 6–24 mm 17 pcs', '17 pcs', 3600, 0, 'Seventeen-piece combination wrench set in a roll pouch.'),
  o(PCC.torqueWrenches, 'torqueline', 'Click torque wrench', '5–25 Nm|20–100 Nm|40–200 Nm|70–350 Nm', 3800, 800, 'Click-type torque wrench, ±3 %, with calibration certificate.'),
  o(PCC.torqueWrenches, 'torqueline', 'Electronic torque wrench', '2–25 Nm|10–100 Nm', 8900, 2600, 'Electronic torque wrench with angle measurement and data log.'),
  o(PCC.adjustableWrenches, 'ferrotool', 'Adjustable wrench', '150 mm|200 mm|250 mm|300 mm', 620, 340, 'Adjustable wrench with metric and imperial scale.'),
  o(PCC.socketSets, 'torqueline', 'Socket set 1/2" 24 pcs', '24 pcs', 2900, 0, 'Twenty-four-piece 1/2" drive socket set, 6-point.'),
  o(PCC.socketSets, 'torqueline', 'Socket set 1/4" + 1/2" 108 pcs', '108 pcs', 6400, 0, 'Hundred-and-eight-piece dual-drive socket set in a blow case.'),
  o(PCC.combinationPliers, 'ferrotool', 'Combination pliers', '160 mm|180 mm|200 mm', 540, 260, 'Insulated combination pliers, VDE 1000 V.', [5, 5]),
  o(PCC.longNosePliers, 'ferrotool', 'Long nose pliers', '160 mm|200 mm', 520, 240, 'Long nose pliers with serrated jaws and side cutter.'),
  o(PCC.sideCuttingPliers, 'ferrotool', 'Side cutting pliers', '160 mm|180 mm', 480, 220, 'Induction-hardened side cutter for wire up to 2.5 mm.'),
  o(PCC.circlipPliers, 'ferrotool', 'Circlip plier set 4 pcs', '4 pcs, internal + external', 1250, 0, 'Four-piece circlip plier set with interchangeable tips.'),
  o(PCC.handFiles, 'ferrotool', "Engineers' hand file", '150 mm|200 mm|250 mm|300 mm', 240, 130, 'Second-cut engineers’ file with comfort handle.', [10, 10]),
  o(PCC.handFiles, 'ferrotool', 'File set 5 pcs with handle', '5 pcs, 200 mm', 640, 0, 'Five-piece file set (flat, hand, square, round, triangle).'),
  o(PCC.needleFiles, 'ferrotool', 'Needle file set 6 pcs', '6 pcs, 140 mm', 590, 0, 'Six-piece needle file set for fine toolmaking work.'),
  o(PCC.rasps, 'ferrotool', 'Rasp half-round', '200 mm|250 mm', 210, 90, 'Coarse-cut half-round rasp for soft materials.'),
  // Grinding & cutting
  o(PCC.cylindricalGrindingWheels, 'metrix-labs', 'Cylindrical grinding wheel 46 grit', '300 × 32 mm|350 × 40 mm|400 × 50 mm', 1400, 760, 'Vitrified cylindrical grinding wheel for between-centres grinding.'),
  o(PCC.cylindricalGrindingWheels, 'metrix-labs', 'Cylindrical grinding wheel 60 grit', '300 × 32 mm|350 × 40 mm', 1250, 680, 'Finer-grade cylindrical wheel for improved surface finish.'),
  o(PCC.surfaceGrindingWheels, 'metrix-labs', 'Surface grinding wheel', '150 × 16 mm|200 × 20 mm|250 × 25 mm', 720, 380, 'Vitrified surface grinding wheel for horizontal spindle machines.'),
  o(PCC.surfaceGrindingWheels, 'metrix-labs', 'Surface grinding wheel 46 grit', '200 × 20 mm|250 × 25 mm', 640, 360, 'Free-cutting 46-grit wheel for production surface grinding.'),
  o(PCC.cupGrindingWheels, 'metrix-labs', 'Cup grinding wheel', '100 × 20 mm|125 × 25 mm|150 × 30 mm', 560, 320, 'Straight-cup wheel for tool and cutter grinding.'),
  o(PCC.internalGrindingWheels, 'metrix-labs', 'Internal grinding wheel', 'Ø 20 × 10 mm|Ø 30 × 10 mm|Ø 40 × 13 mm', 480, 230, 'Small-diameter vitrified wheels for internal grinding.'),
  o(PCC.cuttingDiscs, 'metrix-labs', 'Angle grinder cutting disc 115 mm', '115 × 1.0 mm|115 × 1.6 mm|115 × 3.0 mm', 190, 110, 'Inox-rated thin cutting disc for stainless steel.', [10, 10]),
  o(PCC.cuttingDiscs, 'metrix-labs', 'Angle grinder cutting disc 125 mm', '125 × 1.0 mm|125 × 1.6 mm|125 × 3.2 mm', 210, 130, 'Reinforced 125 mm cutting disc for steel and cast iron.', [10, 10]),
  o(PCC.cuttingDiscs, 'metrix-labs', 'Bench grinder cutting disc 203 mm', '203 × 2.5 mm|203 × 3.2 mm', 260, 140, 'Bench-mounted cut-off wheel for sections and rod.', [5, 5]),
  o(PCC.abrasiveBelts, 'metrix-labs', 'Abrasive belt 75 × 533 mm', '40 grit|60 grit|80 grit|120 grit', 180, 60, 'Zirconia cloth belt for bench belt sanders.', [10, 10]),
  o(PCC.abrasiveSheets, 'metrix-labs', 'Abrasive sheet 230 × 280 mm', '40 grit|60 grit|80 grit|120 grit|180 grit', 160, 30, 'Aluminium-oxide sheets for hand and machine finishing.', [10, 10]),
  o(PCC.flapDiscs, 'metrix-labs', 'Flap disc 115 mm zirconia', '40 grit|60 grit|80 grit', 240, 90, 'Zirconia flap disc for blending welds on steel.', [5, 5]),
  o(PCC.flapDiscs, 'metrix-labs', 'Flap disc 125 mm ceramic', '40 grit|60 grit|80 grit', 290, 110, 'Ceramic flap disc for high-pressure grinding of alloyed steel.', [5, 5]),
  o(PCC.flapDiscs, 'metrix-labs', 'Flap disc 125 mm aluminium oxide', '60 grit|80 grit|120 grit', 210, 80, 'Value flap disc for general fabrication.', [5, 5]),
  o(PCC.fibreDiscs, 'metrix-labs', 'Fibre disc 115 mm', '40 grit|60 grit|80 grit', 200, 70, 'Resin-fibre disc for right-angle grinding.', [10, 10]),
  o(PCC.fibreDiscs, 'metrix-labs', 'Fibre disc 125 mm', '40 grit|60 grit|80 grit', 230, 80, 'Resin-fibre disc for stainless blending.', [10, 10]),
  o(PCC.mountedPoints, 'metrix-labs', 'Mounted point', 'Cylindrical 20 × 10|Ball Ø10|Cone Ø16|Tree 20 × 8', 180, 90, 'Aluminium-oxide mounted points for die grinders.', [5, 5]),
  o(PCC.carbideBurrs, 'metrix-labs', 'Carbide burr set 10 pcs', '10 pcs', 1450, 0, 'Ten-piece carbide burr set for deburring welds and castings.'),
  o(PCC.carbideBurrs, 'metrix-labs', 'Carbide burr 6 mm shank', 'Cylinder Ø6|Ball Ø6|Tree Ø6|Flame Ø6', 420, 180, 'Single-cut carbide burr on 6 mm shank.'),
  // Workstations, storage & factory equipment
  o(PCC.toolCabinets, 'gripforge', 'Tool cabinet 5-drawer', '5 drawer', 22500, 0, 'Five-drawer tool cabinet with central lock and ball-bearing slides.'),
  o(PCC.toolCabinets, 'gripforge', 'Tool cabinet 7-drawer', '7 drawer', 31500, 0, 'Seven-drawer tool cabinet with full-width drawer for instruments.'),
  o(PCC.drawerCabinets, 'gripforge', 'Drawer cabinet 11-drawer', '11 drawer', 26500, 0, 'Eleven-drawer cabinet with foam-ready drawer mats.'),
  o(PCC.workbenches, 'gripforge', 'Workbench with drawer unit', '1500 × 750 mm|1800 × 750 mm', 28500, 6500, 'Steel workbench with beech top and lockable drawer unit.'),
  o(PCC.workbenches, 'gripforge', 'Heavy-duty workbench', '1500 × 750 mm|2000 × 750 mm', 33500, 7800, 'Welded heavy-duty bench rated 1500 kg for toolrooms.'),
  o(PCC.esdWorkbenches, 'gripforge', 'ESD workbench', '1500 × 750 mm|1800 × 750 mm', 34000, 7000, 'ESD-safe workbench with wrist-strap grounding points.'),
  o(PCC.platformTrolleys, 'gripforge', 'Platform trolley', '300 kg|500 kg', 8900, 3400, 'Folding-handle platform trolley with phenolic wheels.'),
  o(PCC.toolTrolleys, 'gripforge', 'Tool trolley', '3 bin|5 bin|7 bin', 7900, 2600, 'Service trolley with bins and lockable tool drawer.'),
  // Power & pneumatic tools
  o(PCC.cordedDrills, 'voltmaster', 'Corded drill 750 W', '750 W, 13 mm chuck', 5400, 0, '750 W two-speed corded drill with reversing.'),
  o(PCC.cordlessDrills, 'voltmaster', 'Cordless drill 18 V', '2.0 Ah kit|4.0 Ah kit', 8900, 3500, 'Brushless 18 V drill driver with two batteries and charger.'),
  o(PCC.cordlessDrills, 'voltmaster', 'Cordless hammer drill 18 V', '4.0 Ah kit', 12400, 0, '18 V hammer drill for masonry up to 14 mm.'),
  o(PCC.magneticBaseDrills, 'voltmaster', 'Magnetic base drill', 'Ø 3–32 mm', 28500, 0, 'Magnetic-base drill with coolant feed and core drilling to 32 mm.'),
  o(PCC.angleGrinders, 'voltmaster', 'Angle grinder 115 mm 900 W', '900 W, 115 mm', 3400, 0, '900 W angle grinder with anti-vibration side handle.'),
  o(PCC.angleGrinders, 'voltmaster', 'Angle grinder 125 mm 1400 W', '1400 W, 125 mm', 4500, 0, '1400 W angle grinder with dead-man switch.'),
  o(PCC.benchGrinders, 'voltmaster', 'Bench grinder 200 mm', '200 mm, 550 W', 6800, 0, '550 W bench grinder with eye shields and tool rests.'),
  o(PCC.orbitalSander, 'voltmaster', 'Orbital sander 125 mm', '125 mm, 250 W', 3900, 0, 'Random-orbit sander with dust extraction port.'),
  o(PCC.beltSanders, 'voltmaster', 'Belt sander 75 × 533 mm', '75 mm belt', 5200, 0, 'Belt sander with 75 mm belt for stock removal.'),
  o(PCC.airDrills, 'voltmaster', 'Air drill 8 mm reversible', '8 mm chuck', 5600, 0, 'Reversible pneumatic drill for assembly lines.'),
  o(PCC.airGrinders, 'voltmaster', 'Air angle grinder 100 mm', '100 mm', 4700, 0, 'Pneumatic angle grinder for restricted spaces.'),
  o(PCC.airNutrunners, 'voltmaster', 'Air nutrunner 3/8"', '3/8" drive', 7200, 0, 'Shut-off air nutrunner with 40–180 Nm range.'),
  o(PCC.impactDrivers, 'voltmaster', 'Impact driver 18 V', '18 V, 180 Nm', 7800, 0, 'Brushless 18 V impact driver, 180 Nm fastening torque.'),
  // Chemical-technical products
  o(PCC.cuttingFluids, 'metrix-labs', 'Semi-synthetic cutting fluid', '5 L|10 L|20 L|205 L', 1450, 2600, 'Semi-synthetic metalworking fluid for milling and turning.'),
  o(PCC.cuttingFluids, 'metrix-labs', 'Neat cutting oil', '5 L|20 L', 2900, 4400, 'Neat oil for tapping and deep-hole drilling of steel.'),
  o(PCC.machineOils, 'metrix-labs', 'Hydraulic oil ISO 46', '5 L|20 L|205 L', 1150, 3300, 'Anti-wear hydraulic oil for presses and machine tools.'),
  o(PCC.greases, 'metrix-labs', 'Lithium complex grease EP2', '400 g|500 g|1 kg', 320, 260, 'Extreme-pressure lithium grease for high-load bearings.', [10, 10]),
  o(PCC.corrosionProtection, 'metrix-labs', 'Corrosion protection spray', '300 ml|500 ml', 280, 160, 'Long-term corrosion inhibitor for stored tooling and parts.', [5, 5]),
  o(PCC.threadlockers, 'metrix-labs', 'Threadlocker medium strength', '10 ml|50 ml|250 ml', 240, 560, 'Medium-strength anaerobic threadlocker, removable with hand tools.', [5, 5]),
  o(PCC.threadlockers, 'metrix-labs', 'Threadlocker high strength', '10 ml|50 ml|250 ml', 240, 560, 'High-strength threadlocker for permanent stud locking.', [5, 5]),
  o(PCC.threadlockers, 'metrix-labs', 'Retaining compound', '10 ml|50 ml', 260, 480, 'Anaerobic retaining compound for bearings and bushings.', [5, 5]),
  o(PCC.markingPaints, 'metrix-labs', 'Layout marking ink', '100 ml|500 ml', 210, 290, 'Fast-drying layout ink for scribing on prepared surfaces.'),
  o(PCC.antiSpatter, 'metrix-labs', 'Anti-spatter spray', '400 ml|500 ml', 260, 150, 'Silicone-free anti-spatter for MIG welding nozzles and jigs.', [5, 5]),
];

function otherProduct(b: Builder, def: OtherFamilyDef, index: number): ProductSpec {
  const slug = b.claimSlug(def.name);
  const variants: VariantSpec[] = def.sizes.map((label, i) => {
    const articleNo = `${200000 + index * 10}-${String(i + 1).padStart(2, '0')}`;
    b.claimArticle(articleNo);
    const avail = b.availability(articleNo);
    return {
      articleNo,
      ean: b.nextEan(`${slug}:${articleNo}`),
      name: label,
      listPrice: round2((def.base + def.step * i) * wobble(`p:${slug}:${articleNo}`)),
      stockQty: avail.stockQty,
      leadTimeMinDays: avail.leadTimeMinDays,
      leadTimeMaxDays: avail.leadTimeMaxDays,
      minOrderQty: def.pack?.[0] ?? 1,
      packSize: def.pack?.[1] ?? 1,
      attributes: {},
    };
  });
  return {
    slug,
    name: def.name,
    brandKey: def.brandKey,
    categoryCode: def.categoryCode,
    shortDescription: def.blurb,
    descriptionHtml: null,
    isBestseller: false,
    seoTitle: null,
    seoDescription: null,
    variants,
    images: [],
  };
}

// ── assembly ────────────────────────────────────────────────────────────────

function seoBlurb(shortDescription: string): string {
  return `${shortDescription} Buy online at ToolHub India with live stock, B2B pricing and GST invoicing.`;
}

function highlightHtml(product: ProductSpec): string {
  const brand = BRANDS.find((b) => b.key === product.brandKey);
  const from = Math.min(...product.variants.map((v) => v.listPrice));
  return [
    `<p><strong>${product.name}</strong> — ${product.shortDescription}</p>`,
    '<ul>',
    `<li><strong>Brand:</strong> ${brand?.name ?? product.brandKey}</li>`,
    `<li><strong>Variants:</strong> ${product.variants.length} sizes, list price from ₹${from.toLocaleString('en-IN')}</li>`,
    '<li><strong>Availability:</strong> live stock per variant with lead times for made-to-order sizes</li>',
    '<li><strong>B2B:</strong> quantity price tiers and customer-specific prices on request</li>',
    '</ul>',
    '<p>Order online at ToolHub India with GST invoicing and pan-India shipping.</p>',
  ].join('');
}

export function buildProductCatalog(): ProductSpec[] {
  const b = createBuilder();
  const products: ProductSpec[] = [
    buildFlagship(b),
    ...centreDrillFamilies(b),
    ...ncSpottingFamilies(b),
    ...jobberFamilies(b),
    ...OTHER_CATALOG.map((def, i) => otherProduct(b, def, i + 1)),
  ];
  if (products.length < 200) {
    throw new Error(`Product seed below the 200-family floor: ${products.length}`);
  }
  for (let i = 0; i < products.length; i += 1) {
    const product = products[i];
    if (!product) throw new Error('unreachable product index');
    const isFlagship = i === 0;
    product.images = imageSpecs(product.slug, product.name, isFlagship);
    if (!isFlagship && i % 10 === 0) {
      // ~20 bestsellers (SEO included) besides the flagship
      product.isBestseller = true;
      product.seoTitle = `${product.name} | ToolHub India`;
      product.seoDescription = seoBlurb(product.shortDescription);
    }
    if (!isFlagship && i % 9 === 0) {
      const first = product.variants[0];
      if (first) first.tiers = tierFor(first.listPrice); // ~23 tiered variants + 2 flagship
    }
    if (!isFlagship && pick(`dh:${product.slug}`, 7) === 0) {
      product.descriptionHtml = highlightHtml(product); // ~30 highlights
    }
  }
  return products;
}

// ── database step ───────────────────────────────────────────────────────────

const ATTR_TYPE_BY_KEY = new Map<string, AttrType>(ATTRIBUTES.map((a) => [a.key, a.type]));

function must<K, V>(map: Map<K, V>, key: K, what: string): V {
  const value = map.get(key);
  if (value === undefined) throw new Error(`Seed ${what}: missing ${JSON.stringify(String(key))}`);
  return value;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface SeedProductsResult {
  products: number;
  variants: number;
  attributeValues: number;
  priceTiers: number;
  images: number;
}

export async function seedProducts(
  tx: Transaction,
  categoryIds: Map<string, string>,
  brandIds: Map<BrandKey, string>,
  attributeIds: Map<string, string>,
): Promise<SeedProductsResult> {
  const catalog = buildProductCatalog();
  const productIds = new Map<string, string>();
  let variantCount = 0;

  for (const spec of catalog) {
    const categoryId = must(categoryIds, spec.categoryCode, `category for ${spec.slug}`);
    const brandId = must(brandIds, spec.brandKey, `brand for ${spec.slug}`);
    const data = {
      name: spec.name,
      brandId,
      categoryId,
      shortDescription: spec.shortDescription,
      descriptionHtml: spec.descriptionHtml,
      isBestseller: spec.isBestseller,
      status: 'PUBLISHED' as const,
      seoTitle: spec.seoTitle,
      seoDescription: spec.seoDescription,
    };
    const product = await tx.product.upsert({
      where: { slug: spec.slug },
      create: { slug: spec.slug, ...data },
      update: data,
    });
    productIds.set(spec.slug, product.id);
    // Idempotency: variants (cascading to attribute values, tiers and customer
    // prices) and images are rebuilt from scratch on every run. Cart lines
    // pointing at the old variants are dropped first: CartItem→Variant is
    // RESTRICT (no cascade) and the lines would dangle after the rebuild —
    // placed orders are unaffected (OrderLine.variant is SetNull + snapshot).
    await tx.cartItem.deleteMany({ where: { variant: { productId: product.id } } });
    await tx.variant.deleteMany({ where: { productId: product.id } });
    await tx.productImage.deleteMany({ where: { productId: product.id } });
    await tx.variant.createMany({
      data: spec.variants.map((v, i) => ({
        productId: product.id,
        articleNo: v.articleNo,
        ean: v.ean,
        name: v.name,
        listPrice: v.listPrice,
        currency: 'INR',
        priceUnit: 1,
        unitLabel: 'Piece',
        taxClass: 'STANDARD',
        stockQty: v.stockQty,
        leadTimeMinDays: v.leadTimeMinDays,
        leadTimeMaxDays: v.leadTimeMaxDays,
        minOrderQty: v.minOrderQty,
        packSize: v.packSize,
        isActive: true,
        sortOrder: i,
      })),
    });
    variantCount += spec.variants.length;
  }

  // Variant ids are DB-generated — read the ones carrying attribute values or
  // tiers back in bulk, then batch the child rows with createMany.
  const articleNos = catalog.flatMap((p) =>
    p.variants
      .filter((v) => Object.keys(v.attributes).length > 0 || (v.tiers?.length ?? 0) > 0)
      .map((v) => v.articleNo),
  );
  const variantIdByArticleNo = new Map<string, string>();
  for (const batch of chunk(articleNos, 500)) {
    const rows = await tx.variant.findMany({ where: { articleNo: { in: batch } }, select: { id: true, articleNo: true } });
    for (const row of rows) variantIdByArticleNo.set(row.articleNo, row.id);
  }

  const attrRows: Prisma.ProductAttributeValueUncheckedCreateInput[] = [];
  const tierRows: Prisma.PriceTierUncheckedCreateInput[] = [];
  for (const spec of catalog) {
    for (const v of spec.variants) {
      if (Object.keys(v.attributes).length === 0 && (v.tiers?.length ?? 0) === 0) continue;
      const variantId = must(variantIdByArticleNo, v.articleNo, 'variant id for');
      for (const [key, value] of Object.entries(v.attributes)) {
        const attributeId = must(attributeIds, key, `attribute ${key} for ${v.articleNo}`);
        if (typeof value === 'number' && ATTR_TYPE_BY_KEY.get(key) === 'NUMBER') {
          attrRows.push({ variantId, attributeId, valueNumber: value });
        } else if (typeof value === 'string') {
          attrRows.push({ variantId, attributeId, valueString: value });
        } else {
          throw new Error(`Variant ${v.articleNo}: value for ${key} does not match its attribute type`);
        }
      }
      for (const tier of v.tiers ?? []) tierRows.push({ variantId, minQty: tier.minQty, price: tier.price });
    }
  }
  for (const batch of chunk(attrRows, 1000)) await tx.productAttributeValue.createMany({ data: batch });
  for (const batch of chunk(tierRows, 1000)) await tx.priceTier.createMany({ data: batch });

  const imageRows: Prisma.ProductImageUncheckedCreateInput[] = [];
  for (const spec of catalog) {
    const productId = must(productIds, spec.slug, 'product id for');
    spec.images.forEach((img, i) =>
      imageRows.push({ productId, publicId: img.publicId, kind: img.kind, alt: img.alt, sortOrder: i }),
    );
  }
  for (const batch of chunk(imageRows, 500)) await tx.productImage.createMany({ data: batch });

  return {
    products: catalog.length,
    variants: variantCount,
    attributeValues: attrRows.length,
    priceTiers: tierRows.length,
    images: imageRows.length,
  };
}
