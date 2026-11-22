// Media storage contracts (ADR 0012). A `publicId` is a path-shaped key
// (`catalog/products/{id}/photo-1.svg`) — the only media reference ever
// stored in the DB; delivery URLs are resolved per-request by the
// MediaUrlBuilder, so switching adapters never touches persisted data.
export type MediaResourceKind = 'image' | 'raw';

/** A stored binary plus the MIME type it should be delivered with. */
export interface StoredObject {
  data: Buffer;
  mime: string;
}

/**
 * Provider-agnostic binary storage (ADR 0009): `local` keeps files under
 * `backend/var/uploads/<publicId>`, `cloudinary` uploads via the signed REST
 * API. All methods receive pre-validated publicIds (see public-id.util).
 */
export interface StorageAdapter {
  /** Persists `data` under `publicId`; `mime` drives the cloudinary resource_type. */
  write(publicId: string, data: Buffer, mime: string): Promise<void>;
  /** Returns the stored bytes, or null when the publicId has no asset. */
  read(publicId: string): Promise<StoredObject | null>;
  /** Removes the asset; deleting a missing asset is not an error. */
  delete(publicId: string): Promise<void>;
  /** Cheap existence probe (the cloudinary adapter is best-effort here). */
  exists(publicId: string): Promise<boolean>;
}

/** Resolves a publicId to the delivery URL carried by DTOs (never stored). */
export interface MediaUrlBuilder {
  resolve(publicId: string, kind?: MediaResourceKind): string;
}

/** The configured backend adapter (mirrors the STORAGE_ADAPTER env enum). */
export type StorageAdapterName = 'local' | 'cloudinary';
