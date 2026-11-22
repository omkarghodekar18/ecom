# ADR 0012 — Media publicIds and delivery URLs

**Status:** accepted (2026-11-21)
**Context:** Spec Section 14: Cloudinary for images, signed admin uploads, delivery through a
custom `next/image` loader, "never store full URLs in the DB". Dev runs without Cloudinary
credentials (ADR 0009).
**Decision:**
- The DB stores only the **publicId** — a path-shaped key per the spec's folder convention:
  `catalog/products/{productId}/photo-1`, `catalog/categories/{code}`, `cms/banners/{id}`,
  `catalog/documents/…`, `brands/{slug}`. Extensions belong to the underlying asset (local
  adapter: `.svg`/`.png`/`.pdf`; Cloudinary: no extension, format is derived at delivery).
- **Local adapter** (dev): files live at `backend/var/uploads/<publicId>`; the API serves them
  at `GET /media/<publicId>` (with `Cache-Control: public, max-age` + ETag). Delivery URL for
  DTOs: `/media/<publicId>` (the Next rewrite proxies `/media/*`).
- **Cloudinary adapter** (prod): delivery URL
  `https://res.cloudinary.com/<cloud>/image/upload/<publicId>`; admin uploads are signed by
  `POST /admin/media/sign-upload` and go directly from the browser to Cloudinary.
- A single `MediaUrlBuilder` resolves publicId → delivery URL at DTO-mapping time; DTOs carry
  resolved `url` fields. The frontend loader (`src/lib/image-loader.ts`) transforms URLs
  (`f_auto,q_auto,c_limit,w_{w}` on Cloudinary; width passthrough on `/media`).
- Placeholder images (seed, imports without image URLs) are generated SVGs written through the
  active storage adapter, so seed data works identically with or without Cloudinary.
**Consequences:** Switching dev→prod is env-only; no DB migration ever touches URLs; the import
pipeline reuses the same publicId space (`ImportJob.filePublicId` for raw files).
