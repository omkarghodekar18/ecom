# Media module

Implements the media pipeline of [ADR 0012](../../../docs/adr/0012-media-publicids.md):
the DB stores only path-shaped **publicIds** (`catalog/products/{id}/photo-1.svg`),
delivery URLs are resolved per-request, and the storage backend is an env-only
choice (`STORAGE_ADAPTER=local|cloudinary`).

## Mount points

The module exports two routers (mounted by `app.ts`; neither is under a versioned
prefix by accident):

```
app.use('/media', mediaPublicRouter)              # GET /media/<publicId> — public, local adapter
app.use('/api/v1/admin/media', mediaAdminRouter)  # POST /sign-upload, POST /upload — STAFF/ADMIN
```

### Express 5 wildcard

`path-to-regexp` v8 (Express 5) rejects bare `*` and `:name(regex)` custom
patterns — they throw at route construction. The rest-of-path capture is the
**named wildcard** `router.get('/{*splat}', …)`, which yields the *decoded*
segments in `req.params.splat` (re-joined into the publicId by
`publicIdFromRequest`). A pre-middleware 404s malformed percent-escapes that
would otherwise blow up the decoder. The whole path is verified end-to-end in
`tests/integration/media.test.ts` by mounting the router at `/media`.

## Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/media/<publicId>` | public | Serve bytes (Content-Type by extension, `Cache-Control: public, max-age=31536000, immutable`, strong ETag = sha1(publicId+mtime), 304 on `If-None-Match`, 404 on traversal) |
| POST | `/admin/media/sign-upload` | STAFF/ADMIN | Validate `{folder, resourceType, filename?, mime?}` against the folder allow-list (`catalog/products/`, `catalog/categories/`, `catalog/documents/`, `cms/banners/`, `brands/`, `imports/`) and mime sets (image: svg/png/jpg/webp; raw: pdf), then issue an adapter ticket |
| POST | `/admin/media/upload` | STAFF/ADMIN | Raw-body binary intake with `x-public-id` (+ optional `x-mime`): 10MB cap (content-length + streamed), magic-byte sniff, extension cross-check → `{publicId, url}` |

Local ticket: `{adapter:'local', uploadUrl:'/api/v1/admin/media/upload', fields:{publicId}}`.
Cloudinary ticket: `{adapter:'cloudinary', uploadUrl:'https://api.cloudinary.com/v1_1/<cloud>/<resourceType>/upload', fields:{api_key, timestamp, folder, public_id, signature}}`
(signature = sha1 of the sorted `k=v&…` params + api_secret — see
`src/services/media/cloudinary-signature.util.ts`; the `public_id` carries no
extension, format is derived at delivery).

## Storage adapters (`src/services/media`)

- **LocalStorageAdapter** — files under `backend/var/uploads/<publicId>`;
  double traversal defence (charset + `..`-free validation in
  `public-id.util`, plus a `resolve()`-and-contains check against the uploads
  root). MIME is derived from the publicId extension on read.
- **CloudinaryStorageAdapter** — signed REST upload/destroy via `node:crypto`
  and the global `fetch` (the cloudinary npm package is deliberately not a
  dependency). `read()` throws `STORAGE_ERROR` — the API never needs CDN
  bytes; `exists()` is best-effort true.
- **MediaUrlBuilder** — `/media/<publicId>` (local) or
  `https://res.cloudinary.com/<cloud>/{image|raw}/upload/<publicId>` (prod),
  resolved via the `mediaUrls` singleton.

`MediaService` (service singleton `mediaService`) adds the flows other modules
call: `savePlaceholderImage` (deterministic 800×600 SVG placeholders for
seed/import fallbacks), `uploadFromUrl` (SSRF-guarded https fetch with
redirect re-validation, 15s timeout, streamed 10MB cap, Content-Type check and
magic-byte sniff — spec Section 18), `deleteAsset` and `exists`.

## Integration notes

- Binary POSTs bypass `express.json` (the asset Content-Type doesn't match),
  so the raw stream is read directly in the controller — no multipart parser
  anywhere in the API.
- The Next.js frontend proxies `/media/*` to this service and transforms
  Cloudinary URLs via its `next/image` loader; DTOs always carry resolved
  `url` fields produced by `mediaUrls`.
