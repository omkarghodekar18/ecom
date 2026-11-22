// Media contract (ADR 0012). Mirrored to frontend — only zod + relative imports.
// publicIds are path-shaped storage keys; DTOs carry resolved `url` fields
// produced by the backend MediaUrlBuilder, never persisted.
import { z } from 'zod';

export const SignUploadInputSchema = z.object({
  /** Must sit under an allowed prefix (catalog/products/, cms/banners/, …). */
  folder: z.string().trim().min(1).max(160),
  resourceType: z.enum(['image', 'raw']),
  filename: z.string().trim().min(1).max(120).optional(),
  mime: z.string().trim().min(3).max(80).optional(),
});
export type SignUploadInput = z.infer<typeof SignUploadInputSchema>;

/**
 * Adapter-shaped upload ticket: `local` points at the API's own binary
 * endpoint (fields: {publicId}); `cloudinary` carries the signed REST
 * params (api_key, timestamp, folder, public_id, signature) the browser
 * posts directly to Cloudinary.
 */
export const SignUploadResponseSchema = z.object({
  adapter: z.enum(['local', 'cloudinary']),
  uploadUrl: z.string(),
  fields: z.record(z.string(), z.string()),
});
export type SignUploadResponse = z.infer<typeof SignUploadResponseSchema>;

export const UploadedAssetDtoSchema = z.object({
  publicId: z.string(),
  url: z.string(),
});
export type UploadedAssetDto = z.infer<typeof UploadedAssetDtoSchema>;
