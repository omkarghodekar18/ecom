# attributes module

Attribute definitions (typed technical-data fields: STRING/NUMBER/BOOLEAN/ENUM)
and the category→attribute mapping (which fields describe a category, which are
filterable, which are variant axes). Spec Sections 11 and 15.3.

**Public API** (`index.ts`): `attributesRouter` (mount at the API root), `attributesService`,
`attributesRepository`, input schemas.

**Mounting:** the router owns its whole sub-path space, so mount it at the API prefix
itself — `app.use(API_PREFIX, attributesRouter)`.

## Endpoints (all under `/api/v1`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/attributes` | public | flat `AttributeDto[]` ordered by groupName/label (grouped client-side); `?categoryCode=` returns the effective mapped set (`CategoryAttributeDto[]`, same inheritance as filters) |
| GET | `/attributes/:key` | public | one definition, 404 when unknown |
| POST | `/admin/attributes` | STAFF+ADMIN | 201; key is a unique lowercase slug; ENUM requires non-empty + duplicate-free `enumValues` |
| PATCH | `/admin/attributes/:id` | STAFF+ADMIN | label/labelHtml/groupName/unit/enumValues + guarded type; 409 while product values exist |
| DELETE | `/admin/attributes/:id` | STAFF+ADMIN | hard delete; 409 while CategoryAttribute or ProductAttributeValue rows reference it |
| PUT | `/admin/categories/:id/attributes` | STAFF+ADMIN | REPLACES the mapping (body = bare array `[{attributeId, isRequired?, isFilterable?, isVariantAxis?, filterWidget?, sortOrder?}]`); 400 when isVariantAxis on non-STRING/ENUM |

## Key flows

- **Mapping inheritance (spec 15.3)** — `effectiveMappingsForCategory(category)` returns the
  category's OWN mapping; when empty it walks the materialised `path` upwards to the nearest
  ancestor with a mapping. Shared by the catalog filters endpoint and `?categoryCode=`.
- **Mapping replace** — deleteMany + createMany inside one transaction; unknown or duplicate
  attributeIds are rejected with 400 first. Every mapping write runs the catalog post-write
  hook (drop `navigation:` cache, enqueue `catalog.refresh-counts`).
- **Type protection** — the attribute type is only mutable while no ProductAttributeValue row
  references the definition (409 otherwise); ENUM↔non-ENUM transitions normalise `enumValues`.
- **Audit** — every admin write calls `writeAudit(...)` from `src/services/audit` inside the
  write transaction (`attribute.*`, `category.mapping.replace`).

## Gotchas

- `enumValues` is stored as JSON on the definition and normalised defensively to `string[]`
  on the way out; non-ENUM attributes always expose `enumValues: null`.
- `labelHtml` is admin-authored trusted HTML (formula markup) — it is passed through as-is.
- The PUT mapping route lives on the category path but belongs to this module (mapping is
  the attributes domain); it does not collide with the catalog module's category routes.
