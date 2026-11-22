// OpenAPI registration for the media module (ADR 0012).
import { z } from 'zod';
import { openApiRegistry } from '../../openapi.js';
import { SignUploadInputSchema, SignUploadResponseSchema, UploadedAssetDtoSchema } from '../../shared/dto/media.dto.js';

const envelope = <T extends z.ZodType>(data: T) => z.object({ success: z.literal(true), data });

const jsonResponse = (description: string, schema?: z.ZodType) => ({
  description,
  ...(schema ? { content: { 'application/json': { schema } } } : {}),
});

const jsonBody = (schema: z.ZodType) => ({ content: { 'application/json': { schema } }, required: true });

const binaryResponse = {
  description: 'Asset bytes (Content-Type per extension, ETag, immutable cache).',
};

const unauthorized = jsonResponse('Not authenticated');
const forbidden = jsonResponse('Not STAFF/ADMIN');

openApiRegistry.registerPath({
  method: 'get',
  path: '/media/{publicId}',
  tags: ['Media'],
  description:
    'Serves a stored asset by publicId (local adapter only; Cloudinary assets are ' +
    'delivered from res.cloudinary.com). publicIds are immutable, so responses are ' +
    'cacheable for a year and revalidated via ETag. NOTE: this route is mounted at the ' +
    'service root — the real URL is {PUBLIC_API_URL}/media/<publicId>, not under /api/v1.',
  request: { params: z.object({ publicId: z.string() }) },
  responses: {
    '200': binaryResponse,
    '304': jsonResponse('Not modified (If-None-Match matched the ETag)'),
    '404': jsonResponse('Unknown or invalid publicId'),
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/admin/media/sign-upload',
  tags: ['Media', 'Admin'],
  description:
    'Issues an upload ticket for the active adapter: local returns the publicId to POST ' +
    'raw bytes to /admin/media/upload; cloudinary returns signed REST params ' +
    '(api_key, timestamp, folder, public_id, signature) for a direct browser upload.',
  request: { body: jsonBody(SignUploadInputSchema) },
  responses: {
    '200': jsonResponse('Upload ticket', envelope(SignUploadResponseSchema)),
    '400': jsonResponse('Validation failed (folder allow-list, mime set)'),
    '401': unauthorized,
    '403': forbidden,
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/admin/media/upload',
  tags: ['Media', 'Admin'],
  description:
    'Raw binary intake (the local-adapter counterpart of a direct Cloudinary upload). ' +
    'Send the asset bytes as the body with the asset Content-Type, plus an ' +
    '`x-public-id` header (from sign-upload) and an optional `x-mime` override. ' +
    'Max 10MB; magic bytes must match the declared type.',
  request: {
    headers: z.object({
      'x-public-id': z.string(),
      'x-mime': z.string().optional(),
    }),
  },
  responses: {
    '200': jsonResponse('Stored asset', envelope(UploadedAssetDtoSchema)),
    '400': jsonResponse('Validation failed (folder, media type, magic bytes)'),
    '401': unauthorized,
    '403': forbidden,
    '413': jsonResponse('Body exceeds the 10MB limit'),
  },
});
