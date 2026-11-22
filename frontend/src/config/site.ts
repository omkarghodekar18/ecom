// Site-wide i18n + commerce constants. Only `in/en` is active today; adding a
// country/language later is a config-only change (Section 7).
export interface CountryConfig {
  code: string;
  name: string;
  languages: string[];
  defaultLanguage: string;
  currency: 'INR';
}

export const site = {
  name: 'ToolHub India',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  defaultCountry: 'in',
  countries: [
    {
      code: 'in',
      name: 'India',
      languages: ['en'],
      defaultLanguage: 'en',
      currency: 'INR',
    },
  ] satisfies CountryConfig[],
  /** Legal/checkout wording (prices exclude tax — Section 1). */
  copy: {
    vatNote: 'plus VAT/GST at the current rate',
    deliveryNote: 'Prices plus delivery costs',
    b2bPriceHint: 'Individual prices for business customers after login.',
  },
} as const;

export function getCountry(code: string): CountryConfig | undefined {
  return site.countries.find((c) => c.code === code);
}

export function isLocaleActive(country: string, lang: string): boolean {
  const c = getCountry(country);
  return !!c && c.languages.includes(lang);
}

export function locales(): { country: string; lang: string; hreflang: string }[] {
  return site.countries.flatMap((c) =>
    c.languages.map((l) => ({ country: c.code, lang: l, hreflang: `${l}-${c.code.toUpperCase()}` })),
  );
}
