# addresses module

Address book CRUD for the authenticated user. Spec Section 6 (account area).

**Public API** (`index.ts`): `addressesRouter`.

## Endpoints (all under `/api/v1`, Bearer-authenticated)

| Method | Path | Notes |
|---|---|---|
| GET | `/addresses` | `AddressDto[]` (creation order) |
| POST | `/addresses` | 201 `AddressDto`; promoting a default unsets the previous one in the same tx |
| PATCH | `/addresses/:id` | partial body; userId-scoped → 404 for other users’ rows (IDOR-safe) |
| DELETE | `/addresses/:id` | 204; 404 unless owned |

## Key flows

- Single-default invariant: at most one `isDefaultShipping` and one
  `isDefaultBilling` per user; swaps run inside `withTransaction`.
- PATCH accepts a partial body (`AddressInputSchema.partial()`).

## Gotchas

- Optional text fields (`label`, `line2`, `gstin`) may arrive as `""`; the
  service normalises blank strings to `null` before writing.
