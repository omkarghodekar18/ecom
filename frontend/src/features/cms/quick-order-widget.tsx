// Quick-order widget (spec 6.1.3): three tabs — "Enter article number" |
// "Import CSV file" | "Fill out order form" — each body a teaser linking to
// the /quick-order page (built in a later phase). Deliberately a SERVER
// component: the tabs are native radio inputs switched by a scoped `<style>`
// block using `:has()` — zero client JS, keyboard-accessible (arrow keys move
// between the radios), and crawlers see all three tab bodies.
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui';
import { routes } from '@/config/routes';

const TABS = [
  {
    key: 'article',
    label: 'Enter article number',
    title: 'Direct entry',
    body: 'You know the article numbers? Type them in with the quantities — live stock and prices are checked as you go.',
    cta: 'Open quick order',
  },
  {
    key: 'csv',
    label: 'Import CSV file',
    title: 'Bulk import',
    body: 'Upload a CSV with article numbers and quantities. Every row is validated before anything reaches the cart.',
    cta: 'Import a file',
  },
  {
    key: 'form',
    label: 'Fill out order form',
    title: 'Order form',
    body: 'Paste multiple “articleNo;qty” lines into one form and review them against live availability and your prices.',
    cta: 'Fill out the form',
  },
] as const;

/**
 * Scoped CSS: `.qow-panel` hidden by default; the panel whose radio is
 * `:checked` is shown, its label highlighted, and a focused radio outlines
 * its label. Browsers without `:has()` degrade to all panels visible.
 */
const TAB_CSS = `
#qow .qow-panel { display: none; }
${TABS.map((t) => `#qow:has(#qow-${t.key}:checked) .qow-panel-${t.key} { display: block; }`).join('\n')}
${TABS.map((t) => `#qow:has(#qow-${t.key}:checked) label[for="qow-${t.key}"] { color: var(--brand-orange); border-color: var(--brand-orange); font-weight: 700; }`).join('\n')}
${TABS.map((t) => `#qow:has(#qow-${t.key}:focus-visible) label[for="qow-${t.key}"] { outline: 2px solid var(--brand-orange); outline-offset: -2px; }`).join('\n')}
@supports not selector(:has(*)) { #qow .qow-panel { display: block; } }
`;

export interface QuickOrderWidgetProps {
  /** Locale base path, e.g. "/in/en". */
  locale: string;
}

/** Quick-order teaser widget with CSS-only tabs (links to /quick-order). */
export function QuickOrderWidget({ locale }: QuickOrderWidgetProps) {
  const quickOrderHref = routes(locale).quickOrder;

  return (
    <section id="qow" aria-labelledby="qow-title" className="page-container py-10 lg:py-14">
      <style dangerouslySetInnerHTML={{ __html: TAB_CSS }} />
      <h2 id="qow-title" className="text-xl font-bold sm:text-2xl">
        Quick order
      </h2>
      <p className="mt-1 text-sm text-muted">Three ways to reorder fast — no clicking through the catalogue.</p>

      {/* Radios first so they stay focusable regardless of panel visibility. */}
      {TABS.map((tab, index) => (
        <input
          key={tab.key}
          type="radio"
          name="qow-tab"
          id={`qow-${tab.key}`}
          defaultChecked={index === 0}
          className="sr-only"
        />
      ))}

      <div className="mt-6 flex flex-wrap gap-x-6 border-b border-line" role="group" aria-label="Quick order methods">
        {TABS.map((tab) => (
          <label
            key={tab.key}
            htmlFor={`qow-${tab.key}`}
            className="cursor-pointer select-none border-b-2 border-transparent px-1 pb-2.5 text-sm font-medium text-muted transition-colors hover:text-ink"
          >
            {tab.label}
          </label>
        ))}
      </div>

      {TABS.map((tab) => (
        <div key={tab.key} className={`qow-panel qow-panel-${tab.key}`}>
          <div className="mt-6 grid gap-5 rounded-tile bg-tile p-6 sm:grid-cols-[1fr_auto] sm:items-center lg:p-8">
            <div>
              <h3 className="text-lg font-bold text-ink">{tab.title}</h3>
              <p className="mt-1 max-w-xl text-sm leading-6 text-muted">{tab.body}</p>
            </div>
            <Button href={quickOrderHref} variant="primary" className="w-fit">
              {tab.cta}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      ))}
    </section>
  );
}
