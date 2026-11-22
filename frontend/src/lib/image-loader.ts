// next/image custom loader (next.config.ts images.loader).
// Handles two delivery channels transparently:
//  - Cloudinary CDN URLs (res.cloudinary.com) → f_auto,q_auto,c_limit,w_{w}
//  - Local adapter URLs (/media/... or backend absolute) → width passthrough
import type { ImageLoaderProps } from 'next/image';

export default function imageLoader({ src, width }: ImageLoaderProps): string {
  if (src.startsWith('https://res.cloudinary.com/') || src.includes('res.cloudinary.com')) {
    const url = new URL(src);
    url.search = '';
    const parts = url.pathname.split('/upload/');
    if (parts.length === 2 && parts[1]) {
      url.pathname = `${parts[0]}/upload/f_auto,q_auto,c_limit,w_${width}/${parts[1]}`;
      return url.toString();
    }
    return src;
  }
  if (src.startsWith('/media/') || src.includes('/media/')) {
    const url = src.startsWith('http') ? new URL(src) : new URL(src, 'http://local.invalid');
    url.searchParams.set('w', String(width));
    return src.startsWith('http') ? url.toString() : `${url.pathname}${url.search}`;
  }
  return src;
}
