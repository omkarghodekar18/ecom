// Site footer (spec 5.3) — server component. Link targets are config content
// (CMS-driven in a later phase); the five "top product categories" are known
// seeded leaf categories, kept here as config constants.
import Link from 'next/link';
import { Clock, Mail, Phone, Truck } from 'lucide-react';
import type { ReactNode } from 'react';
import { brand } from '@/config/brand';
import { routes } from '@/config/routes';
import { CookieSettingsLink } from './cookie-settings-link';

const TOP_CATEGORY_LINKS = [
  { name: 'Centre drills', pathSlugs: 'machining/drilling/drills/centre-drills', code: '10-01-01-01-00' },
  { name: 'NC spotting drills', pathSlugs: 'machining/drilling/drills/nc-spotting-drills', code: '10-01-01-02-00' },
  { name: 'Jobber drills', pathSlugs: 'machining/drilling/drills/jobber-drills', code: '10-01-01-03-00' },
  { name: 'Taper drills', pathSlugs: 'machining/drilling/drills/taper-drills', code: '10-01-01-04-00' },
  { name: 'Stepped drills', pathSlugs: 'machining/drilling/drills/stepped-drills', code: '10-01-01-05-00' },
] as const;

const PAYMENT_METHODS = ['Invoice', 'Razorpay', 'UPI', 'Net banking'] as const;

/** Neutral inline glyphs for the social row (lucide ships no brand marks). */
const SOCIAL_ICONS: Record<string, ReactNode> = {
  LinkedIn: (
    <>
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect width="4" height="12" x="2" y="9" />
      <circle cx="4" cy="4" r="2" />
    </>
  ),
  YouTube: (
    <>
      <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
      <path d="m10 15 5-3-5-3z" />
    </>
  ),
  X: <path d="M4 4l16 16M20 4L4 20" />,
};

const footerLinkClasses = 'text-sm text-ink transition-colors hover:text-brand';

function FooterColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="text-sm font-bold text-ink">{title}</h2>
      <ul className="mt-3 space-y-2.5">{children}</ul>
    </div>
  );
}

function FooterLink({ href, children, ariaLabel }: { href: string; children: ReactNode; ariaLabel?: string }) {
  return (
    <li>
      <Link href={href} aria-label={ariaLabel} className={footerLinkClasses}>
        {children}
      </Link>
    </li>
  );
}

function SocialGlyph({ label }: { label: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      {SOCIAL_ICONS[label] ?? null}
    </svg>
  );
}

export interface SiteFooterProps {
  /** Locale base path, e.g. "/in/en". */
  locale: string;
}

/** Storefront footer (spec 5.3): four columns, social row, payment chips, delivery promise, legal row. */
export function SiteFooter({ locale }: SiteFooterProps) {
  const r = routes(locale);
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-line bg-tile">
      {/* Delivery-promise strip. */}
      <div className="border-b border-line bg-white">
        <div className="page-container flex items-center justify-center gap-2.5 py-3.5">
          <Truck className="h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
          <p className="text-sm font-medium text-ink">
            Delivered across India &middot; Live stock &amp; lead times on every article
          </p>
        </div>
      </div>

      {/* Link columns. */}
      <div className="page-container grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <FooterColumn title="Company">
          <FooterLink href={r.cms('about-us')}>About us</FooterLink>
          <FooterLink href={r.cms('events')}>Events</FooterLink>
          <FooterLink href={r.contact}>Contact</FooterLink>
          <FooterLink href={r.newsletter}>Newsletter</FooterLink>
        </FooterColumn>

        <FooterColumn title="Services">
          <FooterLink href={r.cms('services-overview')}>Services overview</FooterLink>
          <FooterLink href={r.cms('drilling-guide')}>Guides</FooterLink>
          <FooterLink href={r.contact}>Consulting and support</FooterLink>
          <FooterLink href={r.quickOrder}>Quick order</FooterLink>
        </FooterColumn>

        <FooterColumn title="Top product categories">
          {TOP_CATEGORY_LINKS.map((category) => (
            <FooterLink key={category.code} href={r.category(category.pathSlugs, category.code)}>
              {category.name}
            </FooterLink>
          ))}
        </FooterColumn>

        <div>
          <h2 className="text-sm font-bold text-ink">We&rsquo;re there for you</h2>
          <ul className="mt-3 space-y-2.5">
            <li className="flex items-center gap-2 text-sm text-ink">
              <Phone className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
              <a href={`tel:${brand.contact.phone.replace(/[^+\d]/g, '')}`} className="transition-colors hover:text-brand">
                {brand.contact.phone}
              </a>
            </li>
            <li className="flex items-center gap-2 text-sm text-ink">
              <Mail className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
              <a href={`mailto:${brand.contact.email}`} className="transition-colors hover:text-brand">
                {brand.contact.email}
              </a>
            </li>
            <li className="flex items-center gap-2 text-sm text-muted">
              <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
              {brand.contact.hours}
            </li>
          </ul>
          <ul className="mt-4 space-y-2.5">
            <li>
              <Link href={r.contact} className={footerLinkClasses}>
                Contact
              </Link>
            </li>
            <li>
              <Link href={r.contact} className={footerLinkClasses}>
                Advice
              </Link>
            </li>
            <li>
              <Link href={r.help} className={footerLinkClasses}>
                Help/FAQ
              </Link>
            </li>
            <li>
              <Link href={r.cms('downloads')} className={footerLinkClasses}>
                Downloads
              </Link>
            </li>
            <li>
              <Link href={r.newsletter} className={footerLinkClasses}>
                Newsletter
              </Link>
            </li>
          </ul>
        </div>
      </div>

      {/* Social icons + payment methods. */}
      <div className="border-t border-line">
        <div className="page-container flex flex-col gap-5 py-6 lg:flex-row lg:items-center lg:justify-between">
          <nav aria-label="Social media">
            <ul className="flex items-center gap-2">
              {brand.social.map((social) => (
                <li key={social.label}>
                  <a
                    href={social.href}
                    aria-label={social.label}
                    className="flex h-10 w-10 items-center justify-center rounded-btn border border-line bg-white text-ink transition-colors hover:border-brand hover:text-brand"
                  >
                    <SocialGlyph label={social.label} />
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <ul className="flex flex-wrap items-center gap-2" aria-label="Payment methods">
            {PAYMENT_METHODS.map((method) => (
              <li
                key={method}
                className="rounded-pill border border-line bg-white px-2.5 py-1 text-xs text-muted"
              >
                {method}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Legal row. */}
      <div className="border-t border-line">
        <ul className="page-container flex flex-wrap items-center gap-x-6 gap-y-2 py-4">
          <li>
            <Link href={r.cms('about-us')} aria-label="Imprint (placeholder)" className={footerLinkClasses}>
              Imprint
            </Link>
          </li>
          <li>
            <Link
              href={r.cms('about-us')}
              aria-label="Terms & Conditions (placeholder)"
              className={footerLinkClasses}
            >
              Terms &amp; Conditions
            </Link>
          </li>
          <li>
            <Link href={r.cms('about-us')} aria-label="Privacy (placeholder)" className={footerLinkClasses}>
              Privacy
            </Link>
          </li>
          <CookieSettingsLink />
          <li className="text-sm text-muted">
            &copy; {year} {brand.legalName}
          </li>
        </ul>
      </div>
    </footer>
  );
}
