// Client-exposed env validation (zod). Server-only vars are read directly
// from process.env where used (never prefixed NEXT_PUBLIC_).
import { z } from 'zod';

const schema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().default('http://localhost:3000'),
  NEXT_PUBLIC_API_URL: z.string().default('/api/v1'),
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: z.string().default(''),
  NEXT_PUBLIC_CLOUDINARY_SECURE_DISTRIBUTION: z.string().default(''),
});

export const publicEnv = schema.parse({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  NEXT_PUBLIC_CLOUDINARY_SECURE_DISTRIBUTION: process.env.NEXT_PUBLIC_CLOUDINARY_SECURE_DISTRIBUTION,
});
