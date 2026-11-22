// Media controller: public delivery (GET /media/<publicId>, local adapter),
// admin upload signing and provider-agnostic binary intake. The binary
// endpoint intentionally takes a raw body (Content-Type of the asset) plus
// the x-public-id / x-mime headers instead of multipart — consistent with
// the JSON API and trivially proxyable.
import type { Request, Response } from 'express';
import { AppError, badRequest } from '../../common/errors/app-error.js';
import { ERR } from '../../config/constants.js';
import { ok } from '../../common/response/http.js';
import { DEFAULT_MAX_UPLOAD_BYTES } from '../../services/media/index.js';
import { SignUploadInputSchema } from '../../shared/dto/media.dto.js';
import { mediaModuleService } from './media.service.js';

/**
 * Express 5 (path-to-regexp v8) captures the remaining path as the decoded
 * `splat` segments array (see routes); joined back into the publicId.
 */
export function publicIdFromRequest(req: Request): string {
  const raw = req.params.splat as string | string[] | undefined;
  if (Array.isArray(raw)) return raw.join('/');
  return typeof raw === 'string' ? raw.replace(/^\/+/, '') : '';
}

/** Reads the request body as raw bytes, enforcing the upload cap mid-stream. */
async function readBodyWithLimit(req: Request, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const part = typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk);
    total += part.length;
    if (total > limit) {
      throw new AppError(ERR.VALIDATION_ERROR, `Upload exceeds the ${limit} byte limit`, 413);
    }
    chunks.push(part);
  }
  return Buffer.concat(chunks);
}

export const mediaController = {
  /** GET /media/<publicId> — immutable assets, hence immutable caching. */
  async serve(req: Request, res: Response): Promise<void> {
    const publicId = publicIdFromRequest(req);
    const asset = await mediaModuleService.serveAsset(publicId);

    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.set('ETag', asset.etag);
    res.set('Content-Type', asset.mime);

    const ifNoneMatch = req.header('if-none-match');
    if (ifNoneMatch === asset.etag || ifNoneMatch === `W/${asset.etag}` || ifNoneMatch === '*') {
      res.status(304).end();
      return;
    }
    res.status(200).send(asset.data);
  },

  /** POST /admin/media/sign-upload — issue an upload ticket for the adapter. */
  async signUpload(req: Request, res: Response): Promise<void> {
    const input = SignUploadInputSchema.parse(req.body);
    ok(res, mediaModuleService.signUpload(input));
  },

  /** POST /admin/media/upload — raw binary intake (local adapter counterpart). */
  async uploadBinary(req: Request, res: Response): Promise<void> {
    const publicId = req.header('x-public-id');
    if (!publicId) throw badRequest('Missing x-public-id header (obtain one via sign-upload)');

    const declaredMime = req.header('x-mime') ?? req.header('content-type');
    const contentLength = Number(req.header('content-length') ?? '');
    if (Number.isFinite(contentLength) && contentLength > DEFAULT_MAX_UPLOAD_BYTES) {
      throw new AppError(ERR.VALIDATION_ERROR, `Upload exceeds the ${DEFAULT_MAX_UPLOAD_BYTES} byte limit`, 413);
    }

    const bytes = await readBodyWithLimit(req, DEFAULT_MAX_UPLOAD_BYTES);
    const asset = await mediaModuleService.storeUpload({ publicId, bytes, declaredMime });
    ok(res, asset);
  },
};
