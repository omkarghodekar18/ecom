// Homepage SEO text block (spec 6.1.3): 2–3 crawlable paragraphs about the
// shop, muted secondary text, max-w-3xl. Static copy for now — swap for a CMS
// block when the block editor ships.
import { brand } from '@/config/brand';

/** Static SEO copy block for the homepage. */
export function HomeSeoText() {
  return (
    <section aria-labelledby="home-seo-title" className="page-container pb-10 lg:pb-14">
      <div className="max-w-3xl">
        <h2 id="home-seo-title" className="text-lg font-bold text-ink">
          Industrial tools for professional manufacturing
        </h2>
        <p className="mt-3 leading-7 text-muted">
          {brand.name} equips machine shops, toolrooms and production lines across India with cutting
          tools, measuring equipment, clamping technology, hand tools and workshop supplies. Our
          catalogue is curated for professional use: every article carries technical data, live stock
          levels and transparent net prices, so you can specify, compare and order without guesswork.
        </p>
        <p className="mt-4 leading-7 text-muted">
          Business customers see individual prices after login, from single prototypes to series
          production. Our application engineers advise on tool selection, machining parameters and
          regrinding — in person, on your shop floor.
        </p>
        <p className="mt-4 leading-7 text-muted">
          Stocked items ship across India with live lead-time information on every article, and our
          quick-order tools keep recurring orders to a few clicks.
        </p>
      </div>
    </section>
  );
}
