// Writes the generated OpenAPI document to docs/openapi.json (repo-root docs/,
// referenced by docs/api.md). Runs with cwd=backend via `npm run openapi:export`.
// The file is a generated snapshot — Swagger UI at /api/docs is always current;
// regenerate after adding routes: `npm run openapi:export`.
import '../src/load-env.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// Side-effect imports mirroring app.ts: each module registers its OpenAPI
// paths on import (via its index → *.openapi.ts). Without these the shared
// registry is empty and the document would have 0 paths.
import '../src/modules/health/index.js';
import '../src/modules/auth/index.js';
import '../src/modules/users/index.js';
import '../src/modules/addresses/index.js';
import '../src/modules/companies/index.js';
import '../src/modules/catalog/index.js';
import '../src/modules/attributes/index.js';
import '../src/modules/brands/index.js';
import '../src/modules/media/index.js';
import '../src/modules/products/index.js';
import '../src/modules/pricing/index.js';
import '../src/modules/search/index.js';
import '../src/modules/cms/index.js';
import '../src/modules/seo/index.js';
import '../src/modules/cart/index.js';
import '../src/modules/checkout/index.js';
import '../src/modules/orders/index.js';
import '../src/modules/quick-order/index.js';
import '../src/modules/settings/index.js';
import '../src/modules/admin/index.js';
import { generateOpenApiDocument } from '../src/openapi-document.js';

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, '../../docs/openapi.json');

const document = generateOpenApiDocument();
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

const paths = Object.keys(document.paths ?? {}).length;
console.log(`wrote ${target} (${paths} paths, openapi ${document.openapi})`);
