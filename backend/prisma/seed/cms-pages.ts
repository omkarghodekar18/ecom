// CMS pages seed (spec Section 22): five published pages built from the block
// registry the storefront renders (hero, richText, imageText, cardGrid,
// ctaBanner, faq). Idempotent: upserts by slug.
import type { Prisma } from '@prisma/client';
import type { Transaction } from '../../src/db/transaction-types.js';

type Block = Record<string, unknown>;

interface CmsPageDef {
  slug: string;
  title: string;
  seoTitle: string;
  seoDescription: string;
  blocks: Block[];
}

const PAGES: CmsPageDef[] = [
  {
    slug: 'about-us',
    title: 'About ToolHub India',
    seoTitle: 'About ToolHub India — tools for professionals',
    seoDescription:
      'ToolHub India supplies industrial tooling to manufacturing businesses across India: cutting tools, measuring equipment, clamping and workshop essentials.',
    blocks: [
      {
        type: 'hero',
        eyebrow: 'Our company',
        heading: 'Tools for professionals, from people who know manufacturing',
        subheading:
          'From single workshops to series production lines — we equip India\u2019s makers with premium tooling and honest advice.',
        ctaLabel: 'Our brands',
        ctaHref: '/in/en/brands',
        imagePublicId: 'cms/banners/hero-1.svg',
      },
      {
        type: 'richText',
        html:
          '<p>ToolHub India is a specialist supplier of industrial tools. Our catalogue covers machining, measurement technology, clamping, hand tools, workshop equipment and chemical-technical products \u2014 selected so that every item earns its place on a professional shop floor.</p><p>Our team includes application engineers who spend their days on shop floors. That experience shapes the assortment, the technical data we publish, and the advice we give.</p>',
      },
      {
        type: 'imageText',
        imagePublicId: 'cms/banners/side-1.svg',
        eyebrow: 'What we stand for',
        heading: 'Availability, transparency, competence',
        html:
          '<ul><li><strong>Availability:</strong> live stock and lead-time information on every article.</li><li><strong>Transparency:</strong> prices excluding tax, clearly shown \u2014 business customers see their individual prices after login.</li><li><strong>Competence:</strong> application advice from engineers, not script readers.</li></ul>',
        side: 'right',
      },
      {
        type: 'ctaBanner',
        heading: 'Need help specifying tooling?',
        subheading: 'Our application engineers answer within one working day.',
        ctaLabel: 'Contact us',
        ctaHref: '/in/en/contact',
      },
    ],
  },
  {
    slug: 'services-overview',
    title: 'Services',
    seoTitle: 'Services — regrinding, tool management and training',
    seoDescription:
      'Tool regrinding and recoating, tool management, machine capability checks and operator training \u2014 the services around the tool.',
    blocks: [
      {
        type: 'cardGrid',
        cards: [
          {
            eyebrow: 'Regrinding',
            heading: 'Regrinding & recoating',
            html: '<p>Restore cutting geometry and coating at a fraction of replacement cost, with documented inspection.</p>',
          },
          {
            eyebrow: 'Tool management',
            heading: 'Tool management',
            html: '<p>Managed C-parts supply, vending solutions and consumption reporting for your workshop.</p>',
          },
          {
            eyebrow: 'Training',
            heading: 'Operator training',
            html: '<p>Practical training on drilling, milling and thread machining for machine operators.</p>',
          },
          {
            eyebrow: 'Engineering',
            heading: 'Application engineering',
            html: '<p>Process reviews, tool trials and machining data recommendations at your machines.</p>',
          },
        ],
      },
      {
        type: 'richText',
        html:
          '<p>All services are delivered by our own engineers or certified partners. Ask for a quote that fits your machines and materials.</p>',
      },
    ],
  },
  {
    slug: 'drilling-guide',
    title: 'Drilling guide: centre drills to deep holes',
    seoTitle: 'Drilling guide — centre drills, jobber drills, deep hole drilling',
    seoDescription:
      'A practical guide to drill types: when to use centre drills, spotting, jobber and deep-hole drills, and how to pick diameters and coatings.',
    blocks: [
      {
        type: 'hero',
        eyebrow: 'Guides',
        heading: 'Drilling guide',
        subheading: 'Choose the right drill type, coating and geometry for the job.',
        ctaLabel: 'To the drills',
        ctaHref: '/in/en/machining/drilling/drills/c/10-01-01-00-00',
        imagePublicId: 'cms/banners/hero-2.svg',
      },
      {
        type: 'richText',
        html:
          '<p><strong>Centre drills</strong> create a precise conical start for subsequent centre work or spotting, typically to DIN 333 with type A, B and R shapes. <strong>NC spotting drills</strong> position holes accurately before drilling. <strong>Jobber drills</strong> handle general-purpose hole making; flute length and diameter ratio (5xD to 12xD) decide chip evacuation.</p>',
      },
      {
        type: 'faq',
        items: [
          { q: 'When do I need a coated drill?', a: 'TiAlN coatings raise surface hardness and heat resistance — worthwhile above ~40 m/min cutting speed or in stainless steels.' },
          { q: 'Why does my centre drill break?', a: 'Usually feed too high for the small diameter or a worn point. Use the k12-tolerance ground versions and rigid clamping.' },
          { q: 'What is 8xD?', a: 'Flute length divided by diameter. Higher ratios need peck cycles or internal coolant.' },
        ],
      },
      { type: 'ctaBanner', heading: 'Not sure which drill fits?', subheading: 'Send us the material, machine and hole spec — we reply with a recommendation.', ctaLabel: 'Ask an engineer', ctaHref: '/in/en/contact' },
    ],
  },
  {
    slug: 'events',
    title: 'Events & trade fairs',
    seoTitle: 'Events — trade fairs and workshops',
    seoDescription: 'Where to meet ToolHub India: trade fairs, open-house events and technical workshops across India.',
    blocks: [
      {
        type: 'cardGrid',
        cards: [
          { eyebrow: 'Trade fair', heading: 'IMTEX Bengaluru', html: '<p>Live machining demos at our stand — meet the application engineering team.</p>' },
          { eyebrow: 'Workshop', heading: 'Thread machining masterclass', html: '<p>Half-day masterclass on tapping, thread milling and lubrication.</p>' },
          { eyebrow: 'Open house', heading: 'Open house Pune', html: '<p>See regrinding and coating lines in operation, with guided tours.</p>' },
        ],
      },
      { type: 'richText', html: '<p>Dates and registration links are published in our newsletter.</p>' },
    ],
  },
  {
    slug: 'contact-info',
    title: 'Contact and support',
    seoTitle: 'Contact — we are there for you',
    seoDescription: 'Phone, email and opening hours of the ToolHub India team — advice on tools, orders and deliveries.',
    blocks: [
      {
        type: 'cardGrid',
        cards: [
          { eyebrow: 'Phone', heading: 'Call us', html: '<p>+91 00000 00000 — Mon\u2013Fri, 9:00\u201318:00 IST.</p>' },
          { eyebrow: 'Email', heading: 'Write to us', html: '<p>info@toolhub.example — we answer within one working day.</p>' },
          { eyebrow: 'Visits', heading: 'Visit us', html: '<p>Plot 00, Industrial Area, Bengaluru 560001, India.</p>' },
        ],
      },
      { type: 'faq', items: [ { q: 'Where is my order?', a: 'Order status and delivery tracking live in your account under Orders.' }, { q: 'Can I get a net price list?', a: 'Business customers see their individual prices right in the shop after login.' } ] },
    ],
  },
];

/** Upserts all CMS pages (status PUBLISHED). Returns the page count. */
export async function seedCmsPages(tx: Transaction): Promise<number> {
  for (const page of PAGES) {
    const base = {
      title: page.title,
      blocks: page.blocks as unknown as Prisma.InputJsonValue,
      seoTitle: page.seoTitle,
      seoDescription: page.seoDescription,
      status: 'PUBLISHED' as const,
    };
    await tx.cmsPage.upsert({
      where: { slug: page.slug },
      create: { slug: page.slug, ...base },
      update: base,
    });
  }
  return PAGES.length;
}

/** Hero/teaser image jobs referenced by the seeded pages. */
export const CMS_IMAGE_JOBS: ReadonlyArray<{ publicId: string; label: string }> = [
  { publicId: 'cms/banners/hero-1.svg', label: 'About ToolHub India' },
  { publicId: 'cms/banners/hero-2.svg', label: 'Drilling guide' },
  { publicId: 'cms/banners/side-1.svg', label: 'What we stand for' },
];
