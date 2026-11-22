// Single source of brand identity (Section 1: no third-party marks; neutral
// placeholder values only). Change this file to rebrand the shop.
export const brand = {
  name: 'ToolHub India',
  legalName: 'ToolHub India Pvt. Ltd. (placeholder)',
  tagline: 'Tools for professionals',
  /** Inline neutral logo mark (white-friendly, used on the orange bar). */
  logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
  colors: {
    primary: '#FF7000',
    navy: '#00356B',
    teal: '#1F6F8B',
  },
  contact: {
    phone: '+91 00000 00000',
    email: 'info@toolhub.example',
    hours: 'Mon–Fri, 9:00–18:00 IST',
    address: 'Plot 00, Industrial Area, Bengaluru 560001, India (placeholder)',
  },
  social: [
    { label: 'LinkedIn', href: '#' },
    { label: 'YouTube', href: '#' },
    { label: 'X', href: '#' },
  ],
} as const;
