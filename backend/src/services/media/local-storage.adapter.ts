// Local storage adapter (dev/test, ADR 0009/0012): files live at
// `backend/var/uploads/<publicId>` and are served by the API at
// `GET /media/<publicId>`. The delivery MIME type is derived from the
// publicId extension — nothing else is persisted alongside the bytes.
import { access, mkdir, readFile, stat as fsStat, unlink, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { AppError } from '../../common/errors/app-error.js';
import { ERR } from '../../config/constants.js';
import type { StorageAdapter, StoredObject } from './media.types.js';
import { mimeFromExtension } from './mime.util.js';
import { isValidPublicId } from './public-id.util.js';

/** Default uploads root: `backend/var/uploads` (cwd is the backend package). */
export function defaultUploadsRoot(): string {
  return resolve(process.cwd(), 'var', 'uploads');
}

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && typeof (err as NodeJS.ErrnoException).code === 'string';
}

export class LocalStorageAdapter implements StorageAdapter {
  readonly root: string;

  constructor(root: string = defaultUploadsRoot()) {
    this.root = root;
  }

  /**
   * publicId → absolute path, refusing anything that would escape the
   * uploads root. `isValidPublicId` already rejects '..' segments and
   * out-of-charset bytes; the resolve+relative check below is the second,
   * filesystem-level line of defence.
   */
  private pathFor(publicId: string): string {
    if (!isValidPublicId(publicId)) {
      throw new AppError(ERR.VALIDATION_ERROR, `Invalid publicId ${JSON.stringify(publicId)}`, 400);
    }
    const target = resolve(this.root, publicId);
    const rel = relative(this.root, target);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new AppError(ERR.VALIDATION_ERROR, 'publicId escapes the uploads root', 400);
    }
    return target;
  }

  async write(publicId: string, data: Buffer, _mime: string): Promise<void> {
    const target = this.pathFor(publicId);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, data);
  }

  async read(publicId: string): Promise<StoredObject | null> {
    const target = this.pathFor(publicId);
    try {
      const data = await readFile(target);
      return { data, mime: mimeFromExtension(extname(target)) };
    } catch (err) {
      // Missing file — and directories, which can never be assets — are 404s.
      if (isErrnoException(err) && (err.code === 'ENOENT' || err.code === 'EISDIR')) return null;
      throw err;
    }
  }

  async delete(publicId: string): Promise<void> {
    try {
      await unlink(this.pathFor(publicId));
    } catch (err) {
      if (isErrnoException(err) && err.code === 'ENOENT') return;
      throw err;
    }
  }

  async exists(publicId: string): Promise<boolean> {
    try {
      await access(this.pathFor(publicId));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delivery metadata for GET /media (not part of the StorageAdapter
   * contract — only the local adapter can be served this way). Null when
   * the publicId has no file.
   */
  async stat(publicId: string): Promise<{ size: number; mtimeMs: number } | null> {
    try {
      const info = await fsStat(this.pathFor(publicId));
      if (!info.isFile()) return null;
      return { size: info.size, mtimeMs: info.mtimeMs };
    } catch {
      return null;
    }
  }
}
