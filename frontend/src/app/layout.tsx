import type { Metadata, Viewport } from 'next';
import { Roboto } from 'next/font/google';
import { Providers } from '@/components/providers';
import { brand } from '@/config/brand';
import '@/styles/globals.css';

const roboto = Roboto({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
  variable: '--font-roboto',
});

export const metadata: Metadata = {
  title: {
    default: `${brand.name} — ${brand.tagline}`,
    template: `%s | ${brand.name}`,
  },
  description:
    'B2B industrial tooling eShop: cutting tools, measuring tools, clamping technology, hand tools and workshop equipment for professional manufacturing.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={roboto.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
