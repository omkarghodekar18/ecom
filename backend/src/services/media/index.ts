// Media service — public surface (ADR 0012). Storage adapters, the URL
// builder and the MediaService singleton all live behind this barrel so
// switching dev↔prod stays an env-only change.
export type { MediaResourceKind, MediaUrlBuilder, StorageAdapter, StorageAdapterName, StoredObject } from './media.types.js';
export { LocalStorageAdapter, defaultUploadsRoot } from './local-storage.adapter.js';
export { CloudinaryStorageAdapter } from './cloudinary-storage.adapter.js';
export type { CloudinaryCredentials } from './cloudinary-storage.adapter.js';
export { cloudinaryDestroyUrl, cloudinarySignature, cloudinaryUploadUrl } from './cloudinary-signature.util.js';
export { CloudinaryMediaUrlBuilder, LocalMediaUrlBuilder, createMediaUrlBuilder, mediaUrls } from './media-url.builder.js';
export { assertSafeAddresses, isBlockedIp, isSafeHost } from './ip.guard.js';
export type { HostAddress, HostResolver } from './ip.guard.js';
export { sniffMime } from './magic-bytes.util.js';
export { DEFAULT_MIME, extensionFromMime, mimeFromExtension, normalizeMime } from './mime.util.js';
export { PUBLIC_ID_PATTERN, assertValidPublicId, isValidPublicId } from './public-id.util.js';
export {
  createMediaService,
  DEFAULT_MAX_UPLOAD_BYTES,
  getStorageAdapter,
  mediaService,
  randomBasename,
  renderPlaceholderSvg,
  setStorageAdapter,
  MediaService,
} from './media.service.js';
export type { PlaceholderStyle, UploadFromUrlOptions } from './media.service.js';
