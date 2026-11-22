# ADR 0003 — Schema additions beyond the spec's Prisma models

**Status:** accepted (2026-11-21)
**Context:** Spec Section 8 says "implement this schema (adjust only for correctness; keep names)". Other sections of the same spec require persistence the listed models cannot express.
**Decision:** All spec models are implemented verbatim (names kept). The following were ADDED, each traceable to a spec requirement:
- `SlugRedirect` — 301 map for changed slugs (Section 13.6)
- `Setting` — tax rate, shipping rules, stock policy, feature flags (Sections 11, 15.9)
- `OrderSequence` — per-year counter backing `ORD-YYYY-NNNNNN` order numbers (Section 11)
- `AuthEvent` — auth event stream for brute-force lockout and audit of auth events (Section 10)
- `NewsletterSubscriber`, `ContactMessage` — newsletter signup and contact utility pages (Section 6.13)
- `Product.minPrice Decimal(12,2)` — denormalised price-from refreshed on variant change (Section 17)
- Extra indexes: `Address(userId)`, `CartItem(variantId)`, `OrderItem(orderId)`, `Variant(ean)`, `Order(status, createdAt)`, `Order(paymentStatus)` and partial indexes (Section 17: index every FK and hot predicate).
**Consequences:** None of the spec's model names/fields changed; additions are additive and documented in `docs/database.md`.
