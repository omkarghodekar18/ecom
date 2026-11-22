# settings

Public commerce settings (spec 6.7/11): the slice the storefront needs.

## Purpose

- `GET /settings/commerce` — tax rate, delivery rates (standard flat/free
  threshold, optional express) and the payment methods the checkout may offer
  (`RAZORPAY` only while the feature flag is on). Backed by the settings
  service (DB `Setting` rows + 60s cache + safe defaults).

## Gotchas

- Read-only and public: no secrets, no admin flags beyond the customer-visible
  Razorpay toggle. Admin updates (`PATCH /admin/settings`) live in the admin
  surface and reuse `settingsService` directly.

## Testing

`settings.test.ts` covers the unit service; the endpoint is exercised by the
checkout integration suite (express availability flip).
