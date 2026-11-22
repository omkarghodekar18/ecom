# ADR 0009 — Local adapters for storage and mail when cloud env is unset

**Status:** accepted (2026-11-21)
**Context:** The spec mandates Cloudinary for media and SMTP (MailHog) for dev mail, but also explicitly allows "a local mock adapter when no Cloudinary env is set" (Section 22) for seed placeholder images.
**Decision:**
- **Storage/Media:** `StorageAdapter` interface with two implementations: `cloudinary` (signed uploads, CDN delivery — active when the three CLOUDINARY_* env vars are set) and `local` (files under `backend/var/uploads/...`, served by the API at `/media/...`; active by default in dev). The frontend `next/image` custom loader handles both delivery URL shapes.
- **Mail:** `MailProvider` interface with `file` (writes HTML+text to `backend/var/outbox/`, active by default in dev), `smtp` (nodemailer, point it at MailHog for a classic catch-all), selected by `MAIL_PROVIDER`.
**Consequences:** The full stack runs with zero external accounts. Switching to real providers is env-only. Raw import files likewise go through the storage adapter (Section 8 `ImportJob.filePublicId`).
