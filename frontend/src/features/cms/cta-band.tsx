// Full-width brand-orange CTA band (spec 6.1 / 6.11 ctaBanner): white heading
// and subheading plus a white filled button. Shared by the CMS block renderer
// and the homepage feature banner. Renders OUTSIDE page-container (full-bleed).
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

export interface CtaBandProps {
  heading: string;
  subheading?: string | null;
  ctaLabel: string;
  ctaHref: string;
}

/** Full-bleed orange band with a white heading and a white filled button. */
export function CtaBand({ heading, subheading, ctaLabel, ctaHref }: CtaBandProps) {
  return (
    <section className="bg-brand">
      <div className="page-container flex flex-col items-start gap-5 py-10 lg:flex-row lg:items-center lg:justify-between lg:py-12">
        <div>
          <h2 className="text-xl font-bold text-white sm:text-2xl">{heading}</h2>
          {subheading ? <p className="mt-1.5 max-w-2xl text-sm leading-6 text-white/90">{subheading}</p> : null}
        </div>
        <Link
          href={ctaHref}
          className="inline-flex h-11 w-fit shrink-0 items-center gap-2 rounded-btn bg-white px-5 text-sm font-bold text-ink transition-colors hover:bg-white/90"
        >
          {ctaLabel}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
