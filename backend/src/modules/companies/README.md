# companies module

The B2B customer's company view (users of the same company, GSTIN, customer
number). Spec Section 6 (account area).

**Public API** (`index.ts`): `companiesRouter`.

## Endpoints (under `/api/v1`, Bearer-authenticated)

| Method | Path | Notes |
|---|---|---|
| GET | `/companies/me` | `CompanyDto` incl. `users[]`; 404 "No company linked to this account" for B2C or company-less accounts |

## Gotchas

- Admin-facing company management (assign users, deactivate) is part of the
  admin module, not this read-only customer view.
