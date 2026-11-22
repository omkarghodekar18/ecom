'use client';

// PDP tabs (spec 6.4): Product details | Description | Downloads & documents
// | Compare products. The tab list sticks under the site header on scroll
// (orange underline on the active tab via the shared Tabs primitive).
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import { cn } from '@/lib/cn';
import { CompareTab } from './compare-tab';
import { DownloadsTab } from './downloads-tab';
import { TechDataTable } from './tech-data-table';
import { useHeaderOffset } from './use-header-offset';
import type { CategoryAttributeDto } from '@/shared/dto/catalog.dto';
import type { ProductDetailDto, VariantDto } from '@/shared/dto/product.dto';

export interface ProductTabsProps {
  product: ProductDetailDto;
  variant: VariantDto;
  defs: CategoryAttributeDto[];
  locale: string;
  className?: string;
}

export function ProductTabs({ product, variant, defs, locale, className }: ProductTabsProps) {
  const headerOffset = useHeaderOffset();

  return (
    <Tabs defaultValue="details" className={cn('mt-10', className)}>
      <div
        className="sticky z-20 -mx-4 bg-white px-4 lg:-mx-8 lg:px-8"
        style={{ top: headerOffset }}
      >
        <TabsList aria-label="Product information">
          <TabsTrigger value="details">Product details</TabsTrigger>
          <TabsTrigger value="description">Description</TabsTrigger>
          <TabsTrigger value="downloads">Downloads &amp; documents</TabsTrigger>
          <TabsTrigger value="compare">Compare products</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="details" className="pt-5">
        <h2 className="mb-3 text-lg font-bold text-ink">Technical Data</h2>
        <TechDataTable defs={defs} attributes={variant.attributes} caption={`Technical data for ${product.name}, article no. ${variant.articleNo}`} />
      </TabsContent>

      <TabsContent value="description" className="pt-5">
        <h2 className="mb-3 text-lg font-bold text-ink">Description</h2>
        {product.shortDescription ? (
          <p className="mb-3 max-w-3xl text-sm leading-6 text-muted">{product.shortDescription}</p>
        ) : null}
        {product.descriptionHtml ? (
          // Server-sanitised rich text (backend strips everything but a
          // strict whitelist) — rendered as HTML with typographic styling
          // applied through arbitrary-variant selectors on the wrapper.
          <div
            className="max-w-3xl text-sm leading-6 text-ink [&_li]:mb-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-3 [&_p]:last:mb-0 [&_strong]:font-bold [&_ul]:list-disc [&_ul]:pl-5"
            dangerouslySetInnerHTML={{ __html: product.descriptionHtml }}
          />
        ) : (
          <p className="text-sm text-muted">No detailed description available for this product.</p>
        )}
      </TabsContent>

      <TabsContent value="downloads" className="pt-5">
        <h2 className="mb-3 text-lg font-bold text-ink">Downloads &amp; documents</h2>
        <DownloadsTab documents={product.documents} />
      </TabsContent>

      <TabsContent value="compare" className="pt-5">
        <h2 className="mb-3 text-lg font-bold text-ink">Compare products</h2>
        <CompareTab product={product} variant={variant} defs={defs} locale={locale} />
      </TabsContent>
    </Tabs>
  );
}
