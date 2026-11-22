// Category seed — the full taxonomy from spec Section 22.
//
// Structure (level in parentheses):
//   • 8 top-level categories (level 0), codes 'NN-00-00-00-00'
//   • FULL Machining subtree: level 1 groups (Drilling 10-01 … Extended
//     product range 10-08), level 2 groups under Drilling (Drills 10-01-01 …
//     Empty boxes 10-01-09) and level 3 leaves under Drills (Centre drills
//     10-01-01-01-00 … Flow drills 10-01-01-14-00).
//   • PARTIAL subtrees (≥2 levels) for the other seven top-level categories.
//
// Invariants written by this step (same shape the catalog module enforces):
//   path      = '/' + id of every ancestor + own id + '/'  (materialised ids)
//   pathSlugs = slugs joined with '/' (no leading/trailing slash)
//   level     = 0 for roots, parent.level + 1 below
//   sortOrder = position within the sibling group (order of definition)
// Every category carries a one-sentence description; leaves additionally get
// seoTitle/seoDescription. Idempotent: upsert by the unique `code`.
import { slugify } from '../../src/common/utils/slug.util.js';
import type { Transaction } from '../../src/db/transaction-types.js';
import { hash32, pick } from './util.js';

// ── definitions ─────────────────────────────────────────────────────────────

interface CategoryNode {
  code: string;
  name: string;
  description?: string;
  children?: CategoryNode[];
}

/**
 * Handwritten sentence templates for auto-described categories. Chosen
 * deterministically from the category code so runs are stable.
 */
const DESCRIPTION_TEMPLATES = [
  (n: string) => `${n} for professional industrial use, engineered for daily shop-floor reliability.`,
  (n: string) => `Shop ${n.toLowerCase()} from trusted brands with GST invoicing and pan-India delivery.`,
  (n: string) => `${n} selected for toolrooms, maintenance teams and production lines.`,
  (n: string) => `Professional-grade ${n.toLowerCase()} with consistent quality and ready availability from stock.`,
];

const SEO_DESCRIPTIONS = [
  (n: string) =>
    `Buy ${n.toLowerCase()} online at ToolHub India — technical specifications, live stock and B2B pricing with GST invoicing.`,
  (n: string) =>
    `${n} from leading industrial brands with fast pan-India shipping and dedicated B2B support at ToolHub India.`,
];

function describe(code: string, name: string, override?: string): string {
  if (override) return override;
  const tpl = DESCRIPTION_TEMPLATES[hash32(code) % DESCRIPTION_TEMPLATES.length];
  if (!tpl) throw new Error('unreachable template pick');
  return tpl(name);
}

function seoFor(name: string): { seoTitle: string; seoDescription: string } {
  const tpl = SEO_DESCRIPTIONS[pick(`seo:${name}`, SEO_DESCRIPTIONS.length)];
  if (!tpl) throw new Error('unreachable template pick');
  return {
    seoTitle: `${name} | ToolHub India`,
    seoDescription: tpl(name),
  };
}

const MACHINING: CategoryNode = {
  code: '10-00-00-00-00',
  name: 'Machining',
  description:
    'Cutting tools and tooling systems for drilling, threading, turning and milling operations in metalworking shops.',
  children: [
    {
      code: '10-01-00-00-00',
      name: 'Drilling',
      description: 'Drilling tools and accessories for every hole-making operation, from centre holes to deep bores.',
      children: [
        {
          code: '10-01-01-00-00',
          name: 'Drills',
          description: 'Drills for all materials and hole diameters, from microdrills to hole saws.',
          children: [
            {
              code: '10-01-01-01-00',
              name: 'Centre drills',
              description:
                'Centre drills to DIN 333 for producing accurate centre holes in workpieces mounted between centres.',
            },
            {
              code: '10-01-01-02-00',
              name: 'NC spotting drills',
              description: 'NC spotting drills with 90° and 120° points for precise hole location on CNC machines.',
            },
            {
              code: '10-01-01-03-00',
              name: 'Jobber drills',
              description: 'Jobber drills to DIN 338 — the standard twist drill for general-purpose drilling.',
            },
            {
              code: '10-01-01-04-00',
              name: 'Taper drills',
              description: 'Taper-shank drills for heavy-duty drilling where extra torque must be transferred.',
            },
            {
              code: '10-01-01-05-00',
              name: 'Stepped drills',
              description: 'Stepped drills that drill and deburr multiple hole sizes in a single pass.',
            },
            {
              code: '10-01-01-06-00',
              name: 'Core drills for reamers',
              description: 'Core drills that pre-drill holes to the correct size for subsequent reaming.',
            },
            {
              code: '10-01-01-07-00',
              name: 'Deep hole drills',
              description: 'Deep hole drills with high length-to-diameter ratios for gun-drilling applications.',
            },
            {
              code: '10-01-01-08-00',
              name: 'Microdrills',
              description: 'Microdrills for precise small holes below 1 mm in electronics and toolmaking.',
            },
            {
              code: '10-01-01-09-00',
              name: 'Taper sheet and tube drills',
              description: 'Taper sheet and tube drills for clean, burr-free holes in thin-walled material.',
            },
            {
              code: '10-01-01-10-00',
              name: 'Core drills',
              description: 'Core drills for annular hole cutting in steel construction and installation work.',
            },
            {
              code: '10-01-01-11-00',
              name: 'Hole saws & circle cutters',
              description: 'Hole saws and circle cutters for large-diameter holes in sheet metal and wood.',
            },
            {
              code: '10-01-01-12-00',
              name: 'Concrete drills & masonry drills',
              description: 'Concrete and masonry drills for anchor holes in brick, concrete and stone.',
            },
            {
              code: '10-01-01-13-00',
              name: 'Wood drills',
              description: 'Wood drills for clean, splinter-free holes in hardwood and softwood.',
            },
            {
              code: '10-01-01-14-00',
              name: 'Flow drills',
              description: 'Flow drills that form holes by friction heat, producing bushings in thin sheet metal.',
            },
          ],
        },
        {
          code: '10-01-02-00-00',
          name: 'Boring tools',
          description: 'Boring tools for enlarging and finishing pre-drilled holes to close tolerances.',
        },
        {
          code: '10-01-03-00-00',
          name: 'Countersink tools & deburring tools',
          description: 'Countersinking and deburring tools for clean seat faces and burr-free hole edges.',
        },
        {
          code: '10-01-04-00-00',
          name: 'Reaming tools',
          description: 'Reamers for finishing holes to exact size with fine surface quality.',
        },
        {
          code: '10-01-05-00-00',
          name: 'Boring arbors & adapter solutions',
          description: 'Boring arbors and adapters that connect boring heads to machine spindles.',
        },
        {
          code: '10-01-06-00-00',
          name: 'Taps',
          description: 'Taps for cutting internal threads by hand and machine to DIN 371/376.',
        },
        {
          code: '10-01-07-00-00',
          name: 'Fluteless taps',
          description: 'Fluteless taps that form threads by deformation for chip-free threading in ductile materials.',
        },
        {
          code: '10-01-08-00-00',
          name: 'Precision boring technology spare parts & accessories',
          description: 'Spare parts and accessories for adjustable precision boring systems.',
        },
        {
          code: '10-01-09-00-00',
          name: 'Empty boxes & cartridges for precision boring',
          description: 'Empty boxes and cartridges for storing and transporting precision boring inserts.',
        },
      ],
    },
    {
      code: '10-02-00-00-00',
      name: 'Thread machining',
      description: 'Tools for external and internal thread cutting, whirling and thread milling.',
    },
    {
      code: '10-03-00-00-00',
      name: 'Turning',
      description: 'Turning inserts, holders and bars for lathe operations from roughing to finishing.',
    },
    {
      code: '10-04-00-00-00',
      name: 'Milling',
      description: 'Milling cutters and end mills for face, shoulder, slot and high-feed milling.',
    },
    {
      code: '10-05-00-00-00',
      name: 'Sawing',
      description: 'Sawing blades and hacksaws for cutting bars, profiles and tubes.',
    },
    {
      code: '10-06-00-00-00',
      name: 'Machining reference books & ancillaries',
      description: 'Reference books, calculators and ancillaries that support machining planning.',
    },
    {
      code: '10-07-00-00-00',
      name: 'Machining services',
      description: 'Services around cutting tools: regrinding, recoating and tool audits.',
    },
    {
      code: '10-08-00-00-00',
      name: 'Extended product range for machining',
      description: 'Additional products rounding off the machining programme.',
    },
  ],
};

const CLAMPING: CategoryNode = {
  code: '20-00-00-00-00',
  name: 'Clamping technology',
  description: 'Workholding and clamping equipment that keeps workpieces secure and repeatable on the machine.',
  children: [
    {
      code: '20-01-00-00-00',
      name: 'Vises',
      description: 'Machine vises for milling, drilling and grinding setups.',
      children: [
        { code: '20-01-01-00-00', name: 'Drill vises' },
        { code: '20-01-02-00-00', name: 'Machine vices' },
        { code: '20-01-03-00-00', name: 'Precision angle vises' },
        { code: '20-01-04-00-00', name: "Toolmakers' vises" },
      ],
    },
    {
      code: '20-02-00-00-00',
      name: 'Clamping elements',
      description: 'Bolts, studs, straps and clamps for T-slot table fixturing.',
      children: [
        { code: '20-02-01-00-00', name: 'Clamping bolts & studs' },
        { code: '20-02-02-00-00', name: 'Step clamp kits' },
        { code: '20-02-03-00-00', name: 'T-nuts & T-slot bolts' },
        { code: '20-02-04-00-00', name: 'Clamping straps' },
      ],
    },
    {
      code: '20-03-00-00-00',
      name: 'Chucks',
      description: 'Drill chucks, collet chucks and scroll chucks for tool and workpiece holding.',
      children: [
        { code: '20-03-01-00-00', name: 'Drill chucks' },
        { code: '20-03-02-00-00', name: 'Collet chucks & adapters' },
        { code: '20-03-03-00-00', name: 'Scroll chucks' },
      ],
    },
    {
      code: '20-04-00-00-00',
      name: 'Zero-point & pallet systems',
      description: 'Zero-point clamping and pallet systems for fast, repeatable fixture changes.',
      children: [
        { code: '20-04-01-00-00', name: 'Zero-point clamping pins' },
        { code: '20-04-02-00-00', name: 'Pallet clamping systems' },
      ],
    },
  ],
};

const MEASUREMENT: CategoryNode = {
  code: '30-00-00-00-00',
  name: 'Measurement technology',
  description: 'Dimensional, surface and hardness metrology for quality assurance in production and inspection rooms.',
  children: [
    {
      code: '30-01-00-00-00',
      name: 'Dimensional metrology',
      description: 'Instruments for measuring length, diameter and geometry.',
      children: [
        { code: '30-01-01-00-00', name: 'Calipers' },
        { code: '30-01-02-00-00', name: 'Micrometers' },
        { code: '30-01-03-00-00', name: 'Dial gauges' },
        { code: '30-01-04-00-00', name: 'Height gauges' },
      ],
    },
    {
      code: '30-02-00-00-00',
      name: 'Surface metrology',
      description: 'Equipment for measuring surface roughness and checking flatness.',
      children: [
        { code: '30-02-01-00-00', name: 'Surface roughness testers' },
        { code: '30-02-02-00-00', name: 'Surface plates & straight edges' },
      ],
    },
    {
      code: '30-03-00-00-00',
      name: 'Angular and level instruments',
      description: 'Levels, protractors and squares for angular measurement and alignment.',
      children: [
        { code: '30-03-01-00-00', name: 'Precision levels' },
        { code: '30-03-02-00-00', name: 'Protractors & angle gauges' },
        { code: '30-03-03-00-00', name: 'Squares' },
      ],
    },
    {
      code: '30-04-00-00-00',
      name: 'Hardness testers',
      description: 'Instruments for testing material hardness on raw stock and finished parts.',
      children: [
        { code: '30-04-01-00-00', name: 'Portable hardness testers' },
        { code: '30-04-02-00-00', name: 'Hardness test blocks' },
      ],
    },
    {
      code: '30-05-00-00-00',
      name: 'Balancing machines',
      description: 'Machines for static and dynamic balancing of rotors, spindles and toolholders.',
      children: [
        { code: '30-05-01-00-00', name: 'Dynamic balancing machines' },
        { code: '30-05-02-00-00', name: 'Static balancing machines' },
      ],
    },
  ],
};

const GRINDING: CategoryNode = {
  code: '40-00-00-00-00',
  name: 'Grinding & cutting technology',
  description: 'Grinding wheels, cutting discs and abrasives for stock removal, finishing and cut-off work.',
  children: [
    {
      code: '40-01-00-00-00',
      name: 'Grinding wheels',
      description: 'Bonded abrasive wheels for precision grinding operations.',
      children: [
        { code: '40-01-01-00-00', name: 'Cylindrical grinding wheels' },
        { code: '40-01-02-00-00', name: 'Surface grinding wheels' },
        { code: '40-01-03-00-00', name: 'Cup grinding wheels' },
        { code: '40-01-04-00-00', name: 'Internal grinding wheels' },
      ],
    },
    {
      code: '40-02-00-00-00',
      name: 'Cutting-off wheels',
      description: 'Reinforced cut-off discs for angle and bench grinders.',
      children: [
        { code: '40-02-01-00-00', name: 'Angle grinder cutting discs' },
        { code: '40-02-02-00-00', name: 'Bench grinder cutting discs' },
      ],
    },
    {
      code: '40-03-00-00-00',
      name: 'Abrasives',
      description: 'Coated abrasives for grinding, blending and finishing surfaces.',
      children: [
        { code: '40-03-01-00-00', name: 'Abrasive belts' },
        { code: '40-03-02-00-00', name: 'Abrasive sheets & rolls' },
        { code: '40-03-03-00-00', name: 'Flap discs' },
        { code: '40-03-04-00-00', name: 'Fibre discs' },
      ],
    },
    {
      code: '40-04-00-00-00',
      name: 'Mounted points & burrs',
      description: 'Mounted points and carbide burrs for die grinding and deburring.',
      children: [
        { code: '40-04-01-00-00', name: 'Mounted points' },
        { code: '40-04-02-00-00', name: 'Carbide burrs' },
      ],
    },
  ],
};

const HAND_TOOLS: CategoryNode = {
  code: '50-00-00-00-00',
  name: 'Hand tools',
  description: 'Professional hand tools for assembly, maintenance and fabrication work.',
  children: [
    {
      code: '50-01-00-00-00',
      name: 'Hammers',
      description: 'Hammers and mallets for shaping, fitting and assembly tasks.',
      children: [
        { code: '50-01-01-00-00', name: 'Ball peen hammers' },
        { code: '50-01-02-00-00', name: 'Soft-face mallets' },
        { code: '50-01-03-00-00', name: 'Dead blow hammers' },
        { code: '50-01-04-00-00', name: 'Sledge hammers' },
      ],
    },
    {
      code: '50-02-00-00-00',
      name: 'Screwdrivers',
      description: 'Screwdrivers for slotted, Phillips, Torx and precision fasteners.',
      children: [
        { code: '50-02-01-00-00', name: 'Slotted screwdrivers' },
        { code: '50-02-02-00-00', name: 'Phillips screwdrivers' },
        { code: '50-02-03-00-00', name: 'Torx screwdrivers' },
        { code: '50-02-04-00-00', name: 'Precision screwdriver sets' },
      ],
    },
    {
      code: '50-03-00-00-00',
      name: 'Wrenches',
      description: 'Wrenches, torque tools and socket sets for bolted connections.',
      children: [
        { code: '50-03-01-00-00', name: 'Combination wrenches' },
        { code: '50-03-02-00-00', name: 'Torque wrenches' },
        { code: '50-03-03-00-00', name: 'Adjustable wrenches' },
        { code: '50-03-04-00-00', name: 'Socket sets & ratchets' },
      ],
    },
    {
      code: '50-04-00-00-00',
      name: 'Pliers & cutters',
      description: 'Pliers and cutters for gripping, bending and cutting wire and pins.',
      children: [
        { code: '50-04-01-00-00', name: 'Combination pliers' },
        { code: '50-04-02-00-00', name: 'Long nose pliers' },
        { code: '50-04-03-00-00', name: 'Side cutting pliers' },
        { code: '50-04-04-00-00', name: 'Circlip pliers' },
      ],
    },
    {
      code: '50-05-00-00-00',
      name: 'Files & rasps',
      description: 'Files and rasps for shaping and finishing metal and wood.',
      children: [
        { code: '50-05-01-00-00', name: 'Hand files' },
        { code: '50-05-02-00-00', name: 'Needle files' },
        { code: '50-05-03-00-00', name: 'Rasps' },
      ],
    },
  ],
};

const WORKSTATIONS: CategoryNode = {
  code: '60-00-00-00-00',
  name: 'Workstations, storage and factory equipment',
  description: 'Workbenches, cabinets, trolleys and factory equipment for organised, efficient workplaces.',
  children: [
    {
      code: '60-01-00-00-00',
      name: 'Tool cabinets & storage',
      description: 'Cabinets and shelving that keep tools and parts sorted and protected.',
      children: [
        { code: '60-01-01-00-00', name: 'Tool cabinets' },
        { code: '60-01-02-00-00', name: 'Drawer cabinets' },
        { code: '60-01-03-00-00', name: 'Shelving systems' },
      ],
    },
    {
      code: '60-02-00-00-00',
      name: 'Workbenches & workstations',
      description: 'Workbenches and assembly tables for production and laboratory environments.',
      children: [
        { code: '60-02-01-00-00', name: 'Workbenches' },
        { code: '60-02-02-00-00', name: 'Assembly tables' },
        { code: '60-02-03-00-00', name: 'ESD workbenches' },
      ],
    },
    {
      code: '60-03-00-00-00',
      name: 'Transport & handling',
      description: 'Trolleys and lifting gear for moving tools, parts and materials safely.',
      children: [
        { code: '60-03-01-00-00', name: 'Platform trolleys' },
        { code: '60-03-02-00-00', name: 'Tool trolleys' },
        { code: '60-03-03-00-00', name: 'Lifting equipment' },
      ],
    },
    {
      code: '60-04-00-00-00',
      name: 'Machine guards & workshop safety',
      description: 'Guards, safety cabinets and lighting that make machine workstations safe.',
      children: [
        { code: '60-04-01-00-00', name: 'Machine guards' },
        { code: '60-04-02-00-00', name: 'Safety cabinets' },
        { code: '60-04-03-00-00', name: 'Workshop lighting' },
      ],
    },
  ],
};

const POWER_TOOLS: CategoryNode = {
  code: '70-00-00-00-00',
  name: 'Power tools and pneumatic tools',
  description: 'Electric and pneumatic power tools for drilling, grinding, fastening and sanding.',
  children: [
    {
      code: '70-01-00-00-00',
      name: 'Drills (power)',
      description: 'Corded, cordless and magnetic-base drills for workshop and site work.',
      children: [
        { code: '70-01-01-00-00', name: 'Corded drills' },
        { code: '70-01-02-00-00', name: 'Cordless drills' },
        { code: '70-01-03-00-00', name: 'Magnetic base drills' },
      ],
    },
    {
      code: '70-02-00-00-00',
      name: 'Grinders & sanders',
      description: 'Angle grinders, bench grinders and sanders for stock removal and finishing.',
      children: [
        { code: '70-02-01-00-00', name: 'Angle grinders' },
        { code: '70-02-02-00-00', name: 'Bench grinders' },
        { code: '70-02-03-00-00', name: 'Orbital sanders' },
        { code: '70-02-04-00-00', name: 'Belt sanders' },
      ],
    },
    {
      code: '70-03-00-00-00',
      name: 'Pneumatic tools',
      description: 'Air-powered drills, grinders and nutrunners for production lines.',
      children: [
        { code: '70-03-01-00-00', name: 'Air drills' },
        { code: '70-03-02-00-00', name: 'Air grinders' },
        { code: '70-03-03-00-00', name: 'Air nutrunners' },
        { code: '70-03-04-00-00', name: 'Blow guns' },
      ],
    },
    {
      code: '70-04-00-00-00',
      name: 'Impact drivers & nutrunners',
      description: 'Impact drivers and cordless nutrunners for heavy fastening applications.',
      children: [
        { code: '70-04-01-00-00', name: 'Impact drivers' },
        { code: '70-04-02-00-00', name: 'Cordless nutrunners' },
      ],
    },
  ],
};

const CHEMICALS: CategoryNode = {
  code: '80-00-00-00-00',
  name: 'Chemical-technical products',
  description: 'Lubricants, cleaners, adhesives and process chemicals for machining and maintenance.',
  children: [
    {
      code: '80-01-00-00-00',
      name: 'Lubricants & oils',
      description: 'Cutting fluids, machine oils, greases and corrosion inhibitors.',
      children: [
        { code: '80-01-01-00-00', name: 'Cutting fluids' },
        { code: '80-01-02-00-00', name: 'Machine oils' },
        { code: '80-01-03-00-00', name: 'Greases' },
        { code: '80-01-04-00-00', name: 'Corrosion protection' },
      ],
    },
    {
      code: '80-02-00-00-00',
      name: 'Cleaners & maintenance',
      description: 'Cleaners for parts, machines and electrical contacts.',
      children: [
        { code: '80-02-01-00-00', name: 'Parts cleaners' },
        { code: '80-02-02-00-00', name: 'Machine cleaners' },
        { code: '80-02-03-00-00', name: 'Contact cleaners' },
      ],
    },
    {
      code: '80-03-00-00-00',
      name: 'Adhesives & sealants',
      description: 'Threadlocking, retaining and gasketing compounds for assembly.',
      children: [
        { code: '80-03-01-00-00', name: 'Threadlockers' },
        { code: '80-03-02-00-00', name: 'Retaining compounds' },
        { code: '80-03-03-00-00', name: 'Gasket sealants' },
      ],
    },
    {
      code: '80-04-00-00-00',
      name: 'Marking & anti-spatter',
      description: 'Marking paints and anti-spatter agents for welding and identification.',
      children: [
        { code: '80-04-01-00-00', name: 'Marking paints & inks' },
        { code: '80-04-02-00-00', name: 'Anti-spatter agents' },
      ],
    },
  ],
};

export const CATEGORY_TREE: CategoryNode[] = [
  MACHINING,
  CLAMPING,
  MEASUREMENT,
  GRINDING,
  HAND_TOOLS,
  WORKSTATIONS,
  POWER_TOOLS,
  CHEMICALS,
];

// ── flatten + seed ───────────────────────────────────────────────────────────

interface FlatCategory {
  code: string;
  name: string;
  slug: string;
  parentCode: string | null;
  level: number;
  sortOrder: number;
  description: string;
  isLeaf: boolean;
}

export function flattenTree(): FlatCategory[] {
  const out: FlatCategory[] = [];
  const seenCodes = new Set<string>();
  const seenSlugs = new Set<string>();
  const walk = (node: CategoryNode, parentCode: string | null, level: number): void => {
    if (seenCodes.has(node.code)) throw new Error(`Duplicate category code ${node.code}`);
    seenCodes.add(node.code);
    const slug = slugify(node.name);
    if (seenSlugs.has(slug)) throw new Error(`Duplicate category slug '${slug}' (${node.code})`);
    seenSlugs.add(slug);
    out.push({
      code: node.code,
      name: node.name,
      slug,
      parentCode,
      level,
      sortOrder: out.filter((c) => c.parentCode === parentCode).length,
      description: describe(node.code, node.name, node.description),
      isLeaf: !node.children || node.children.length === 0,
    });
    for (const child of node.children ?? []) walk(child, node.code, level + 1);
  };
  for (const root of CATEGORY_TREE) walk(root, null, 0);
  return out;
}

export interface SeededCategoryRef {
  code: string;
  id: string;
}

/**
 * Upserts every category level by level (parents first, so parentId FKs can
 * resolve), then patches `path` whenever the materialised ids changed. The
 * definitions are parents-before-children already, so a single ordered pass
 * works. Returns code → id for later seed steps (attributes, products).
 */
export async function seedCategories(tx: Transaction): Promise<Map<string, SeededCategoryRef>> {
  const flat = flattenTree();
  const byCode = new Map<string, { id: string; path: string; pathSlugs: string }>();
  const result = new Map<string, SeededCategoryRef>();

  for (const def of flat) {
    const parent = def.parentCode !== null ? byCode.get(def.parentCode) : undefined;
    if (def.parentCode !== null && !parent) {
      throw new Error(`Parent ${def.parentCode} not seeded before ${def.code}`);
    }
    const pathSlugs = parent ? `${parent.pathSlugs}/${def.slug}` : def.slug;
    const seo = def.isLeaf ? seoFor(def.name) : { seoTitle: null, seoDescription: null };
    const data = {
      slug: def.slug,
      name: def.name,
      description: def.description,
      parentId: parent?.id ?? null,
      level: def.level,
      sortOrder: def.sortOrder,
      pathSlugs,
      isActive: true,
      seoTitle: seo.seoTitle,
      seoDescription: seo.seoDescription,
    };
    const row = await tx.category.upsert({
      where: { code: def.code },
      create: { code: def.code, ...data, path: 'pending' },
      update: data,
    });
    const path = parent ? `${parent.path}${row.id}/` : `/${row.id}/`;
    if (row.path !== path) {
      await tx.category.update({ where: { id: row.id }, data: { path } });
    }
    byCode.set(def.code, { id: row.id, path, pathSlugs });
    result.set(def.code, { code: def.code, id: row.id });
  }
  return result;
}

/** Category codes the product seed places families in (leaf categories only). */
export const PRODUCT_CATEGORY_CODES = {
  centreDrills: '10-01-01-01-00',
  ncSpottingDrills: '10-01-01-02-00',
  jobberDrills: '10-01-01-03-00',
  boringTools: '10-01-02-00-00',
  countersinkTools: '10-01-03-00-00',
  reamingTools: '10-01-04-00-00',
  taps: '10-01-06-00-00',
  flutelessTaps: '10-01-07-00-00',
  taperDrills: '10-01-01-04-00',
  steppedDrills: '10-01-01-05-00',
  deepHoleDrills: '10-01-01-07-00',
  microdrills: '10-01-01-08-00',
  coreDrills: '10-01-01-10-00',
  holeSaws: '10-01-01-11-00',
  woodDrills: '10-01-01-13-00',
  flowDrills: '10-01-01-14-00',
  milling: '10-04-00-00-00',
  calipers: '30-01-01-00-00',
  micrometers: '30-01-02-00-00',
  dialGauges: '30-01-03-00-00',
  heightGauges: '30-01-04-00-00',
  precisionLevels: '30-03-01-00-00',
  roughnessTesters: '30-02-01-00-00',
  surfacePlates: '30-02-02-00-00',
  hardnessTesters: '30-04-01-00-00',
  drillVises: '20-01-01-00-00',
  machineVices: '20-01-02-00-00',
  angleVises: '20-01-03-00-00',
  toolmakersVises: '20-01-04-00-00',
  clampingBolts: '20-02-01-00-00',
  stepClampKits: '20-02-02-00-00',
  tSlotBolts: '20-02-03-00-00',
  clampingStraps: '20-02-04-00-00',
  drillChucks: '20-03-01-00-00',
  colletChucks: '20-03-02-00-00',
  zeroPointPins: '20-04-01-00-00',
  ballPeenHammers: '50-01-01-00-00',
  softFaceMallets: '50-01-02-00-00',
  deadBlowHammers: '50-01-03-00-00',
  sledgeHammers: '50-01-04-00-00',
  slottedScrewdrivers: '50-02-01-00-00',
  phillipsScrewdrivers: '50-02-02-00-00',
  torxScrewdrivers: '50-02-03-00-00',
  precisionScrewdriverSets: '50-02-04-00-00',
  combinationWrenches: '50-03-01-00-00',
  torqueWrenches: '50-03-02-00-00',
  adjustableWrenches: '50-03-03-00-00',
  socketSets: '50-03-04-00-00',
  combinationPliers: '50-04-01-00-00',
  longNosePliers: '50-04-02-00-00',
  sideCuttingPliers: '50-04-03-00-00',
  circlipPliers: '50-04-04-00-00',
  handFiles: '50-05-01-00-00',
  needleFiles: '50-05-02-00-00',
  rasps: '50-05-03-00-00',
  cylindricalGrindingWheels: '40-01-01-00-00',
  surfaceGrindingWheels: '40-01-02-00-00',
  cupGrindingWheels: '40-01-03-00-00',
  internalGrindingWheels: '40-01-04-00-00',
  cuttingDiscs: '40-02-01-00-00',
  abrasiveBelts: '40-03-01-00-00',
  abrasiveSheets: '40-03-02-00-00',
  flapDiscs: '40-03-03-00-00',
  fibreDiscs: '40-03-04-00-00',
  mountedPoints: '40-04-01-00-00',
  carbideBurrs: '40-04-02-00-00',
  toolCabinets: '60-01-01-00-00',
  drawerCabinets: '60-01-02-00-00',
  workbenches: '60-02-01-00-00',
  esdWorkbenches: '60-02-03-00-00',
  platformTrolleys: '60-03-01-00-00',
  toolTrolleys: '60-03-02-00-00',
  cordedDrills: '70-01-01-00-00',
  cordlessDrills: '70-01-02-00-00',
  magneticBaseDrills: '70-01-03-00-00',
  angleGrinders: '70-02-01-00-00',
  benchGrinders: '70-02-02-00-00',
  orbitalSander: '70-02-03-00-00',
  beltSanders: '70-02-04-00-00',
  airDrills: '70-03-01-00-00',
  airGrinders: '70-03-02-00-00',
  airNutrunners: '70-03-03-00-00',
  impactDrivers: '70-04-01-00-00',
  cuttingFluids: '80-01-01-00-00',
  machineOils: '80-01-02-00-00',
  greases: '80-01-03-00-00',
  corrosionProtection: '80-01-04-00-00',
  threadlockers: '80-03-01-00-00',
  markingPaints: '80-04-01-00-00',
  antiSpatter: '80-04-02-00-00',
} as const;

export type ProductCategoryCode = (typeof PRODUCT_CATEGORY_CODES)[keyof typeof PRODUCT_CATEGORY_CODES];
