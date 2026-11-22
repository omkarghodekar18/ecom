// "Our brands" two-card row on the homepage (spec 6.1.3): the premium brand
// plus the strongest mainstream brand from GET /brands. Server component.
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui';
import { routes } from '@/config/routes';
import type { BrandWithCount } from '@/features/product/brands-api';

/** Premium brand first, then the highest-product-count mainstream brand. */
function pickTwo(brands: BrandWithCount[]): BrandWithCount[] {
  const byCount = [...brands].sort((a, b) => b.productCount - a.productCount);
  const premium = byCount.find((b) => b.isPremium);
  const mainstream = byCount.filter((b) => !b.isPremium);
  if (premium && mainstream[0]) return [premium, mainstream[0]];
  return byCount.slice(0, 2);
}

function BrandTile({ brand, href }: { brand: BrandWithCount; href: string }) {
  return (
    <article className="flex flex-col gap-3 rounded-tile bg-tile p-6">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-btn bg-navy text-lg font-bold text-white"
        >
          {brand.name.charAt(0).toUpperCase()}
        </span>
        <h3 className="text-lg font-bold text-ink">{brand.name}</h3>
        {brand.isPremium ? <Badge variant="brand">Premium</Badge> : null}
      </div>
      {brand.description ? <p className="text-sm leading-6 text-muted">{brand.description}</p> : null}
      <p className="text-sm text-muted">
        <span className="font-bold text-ink">{brand.productCount}</span> products in stock range
      </p>
      <Link
        href={href}
        className="mt-auto inline-flex w-fit items-center gap-1.5 pt-1 text-sm font-bold text-brand transition-colors hover:text-brand-hover"
      >
        Discover the brand
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </article>
  );
}

export interface HomeBrandsProps {
  locale: string;
  brands: BrandWithCount[];
}

/** Two-card brand row (premium + one more); hidden when no brands exist. */
export function HomeBrands({ locale, brands }: HomeBrandsProps) {
  if (brands.length === 0) return null;
  const r = routes(locale);
  const picked = pickTwo(brands);
  if (picked.length === 0) return null;

  return (
    <section aria-labelledby="home-brands-title" className="page-container py-10 lg:py-14">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="home-brands-title" className="text-xl font-bold sm:text-2xl">
          Our brands
        </h2>
        <Link href={r.brands} className="text-sm font-bold text-brand transition-colors hover:text-brand-hover">
          All brands
        </Link>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {picked.map((brand) => (
          <BrandTile key={brand.slug} brand={brand} href={r.brand(brand.slug)} />
        ))}
      </div>
    </section>
  );
}
