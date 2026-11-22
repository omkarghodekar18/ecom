// CMS block renderer (spec 6.11): renders the six block types with strict
// typing — each block is zod-parsed individually against the registry; unknown
// or malformed blocks are skipped silently (the backend already drops them,
// this is double safety). Server component; hero and ctaBanner blocks render
// full-bleed, the rest inside a page-container.
import { ChevronRight, Plus } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import { CmsBlockSchema, type CmsBlock } from './cms.dto';
import { CtaBand } from './cta-band';
import { HeroSlide } from './hero-slide';
import { mediaUrl } from './media-url';

/** Shared prose styling for admin-authored HTML (no typography plugin). */
const PROSE = cn(
  '[&_a]:font-medium [&_a]:text-brand [&_a]:underline [&_a]:underline-offset-2',
  '[&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-bold',
  '[&_h3]:mt-6 [&_h3]:font-bold',
  '[&_li]:mt-1 [&_li]:leading-6',
  '[&_ol]:list-decimal [&_ol]:ps-5',
  '[&>p:first-child]:mt-0',
  '[&_p]:mt-4 [&_p]:leading-7',
  '[&_strong]:font-bold',
  '[&_ul]:list-disc [&_ul]:ps-5',
);

/** Compact prose variant for card bodies. */
const PROSE_CARD = cn(
  '[&>p:first-child]:mt-0',
  '[&_li]:leading-6',
  '[&_p]:mt-2 [&_p]:leading-6',
  '[&_strong]:font-bold',
  '[&_ul]:list-disc [&_ul]:ps-5',
);

function HeroBlockView({ block, priority }: { block: Extract<CmsBlock, { type: 'hero' }>; priority: boolean }) {
  return (
    <HeroSlide
      slide={{
        image: mediaUrl(block.imagePublicId),
        eyebrow: block.eyebrow,
        heading: block.heading,
        subheading: block.subheading,
        ctaLabel: block.ctaLabel,
        ctaHref: block.ctaHref,
      }}
      priority={priority}
      sizes="100vw"
      className="h-[320px] lg:h-[440px]"
    />
  );
}

function RichTextBlockView({ block }: { block: Extract<CmsBlock, { type: 'richText' }> }) {
  return (
    <section className="page-container py-8 lg:py-10">
      {/* Admin-authored, sanitised HTML (backend CMS block registry). */}
      <div className={cn('max-w-3xl text-ink', PROSE)} dangerouslySetInnerHTML={{ __html: block.html }} />
    </section>
  );
}

function ImageTextBlockView({ block }: { block: Extract<CmsBlock, { type: 'imageText' }> }) {
  const image = (
    <div className="relative aspect-[4/3] overflow-hidden rounded-tile bg-tile">
      <Image
        src={mediaUrl(block.imagePublicId)}
        alt={block.heading}
        fill
        sizes="(max-width: 768px) 100vw, 50vw"
        className="object-cover"
      />
    </div>
  );
  const text = (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-brand">{block.eyebrow}</p>
      <h2 className="mt-1.5 text-xl font-bold text-ink sm:text-2xl">{block.heading}</h2>
      {/* Admin-authored, sanitised HTML (backend CMS block registry). */}
      <div className={cn('mt-3 text-ink', PROSE)} dangerouslySetInnerHTML={{ __html: block.html }} />
    </div>
  );
  return (
    <section className="page-container py-8 lg:py-10">
      <div className="grid items-center gap-8 md:grid-cols-2">
        {block.side === 'left' ? (
          <>
            {image}
            {text}
          </>
        ) : (
          <>
            {text}
            {image}
          </>
        )}
      </div>
    </section>
  );
}

function CardGridBlockView({ block }: { block: Extract<CmsBlock, { type: 'cardGrid' }> }) {
  return (
    <section className="page-container py-8 lg:py-10">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {block.cards.map((card) => {
          const body = (
            <>
              <p className="text-xs font-bold uppercase tracking-wide text-brand">{card.eyebrow}</p>
              <h3 className="mt-1.5 font-bold leading-snug text-ink">{card.heading}</h3>
              {/* Admin-authored, sanitised HTML (backend CMS block registry). */}
              <div
                className={cn('mt-2 text-sm text-muted', PROSE_CARD)}
                dangerouslySetInnerHTML={{ __html: card.html }}
              />
            </>
          );
          return card.href ? (
            <Link
              key={card.heading}
              href={card.href}
              className="flex flex-col rounded-tile bg-tile p-6 transition-colors hover:bg-line/40"
            >
              {body}
              <span className="mt-auto inline-flex w-fit items-center gap-1 pt-3 text-sm font-bold text-brand">
                Learn more
                {/* Descriptive accessible name (Lighthouse link-text / WCAG 2.4.4). */}
                <span className="sr-only"> about {card.heading}</span>
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </span>
            </Link>
          ) : (
            <article key={card.heading} className="flex flex-col rounded-tile bg-tile p-6">
              {body}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function FaqBlockView({ block, name }: { block: Extract<CmsBlock, { type: 'faq' }>; name: string }) {
  return (
    <section className="page-container py-8 lg:py-10">
      <div className="max-w-3xl">
        {block.items.map((item, index) => (
          // Native <details>/<summary>: SEO-friendly accordion with no JS.
          <details key={item.q} name={name} open={index === 0} className="group border-b border-line">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-sm font-bold text-ink transition-colors hover:text-brand [&::-webkit-details-marker]:hidden">
              {item.q}
              <Plus
                className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-45"
                aria-hidden="true"
              />
            </summary>
            <p className="pb-4 text-sm leading-6 text-muted">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export interface BlockRendererProps {
  /** Raw block array from CmsPageDto.blocks (validated per block here). */
  blocks: unknown[];
}

/** Renders a CMS page's blocks in order; unknown block types are skipped. */
export function BlockRenderer({ blocks }: BlockRendererProps) {
  return (
    <>
      {blocks.map((raw, index) => {
        const parsed = CmsBlockSchema.safeParse(raw);
        if (!parsed.success) return null; // unknown/malformed — skipped silently
        const block = parsed.data;
        switch (block.type) {
          case 'hero':
            return <HeroBlockView key={index} block={block} priority={index === 0} />;
          case 'richText':
            return <RichTextBlockView key={index} block={block} />;
          case 'imageText':
            return <ImageTextBlockView key={index} block={block} />;
          case 'cardGrid':
            return <CardGridBlockView key={index} block={block} />;
          case 'ctaBanner':
            return (
              <CtaBand
                key={index}
                heading={block.heading}
                subheading={block.subheading}
                ctaLabel={block.ctaLabel}
                ctaHref={block.ctaHref}
              />
            );
          case 'faq':
            return <FaqBlockView key={index} block={block} name={`faq-${index}`} />;
          default:
            return null;
        }
      })}
    </>
  );
}
