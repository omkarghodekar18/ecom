#!/usr/bin/env node
// Copies backend/src/shared → frontend/src/shared (the manual mirror required
// by the two-standalone-projects rule — see ADR 0001). Backend files use ESM
// `.js` import suffixes (NodeNext); the frontend bundler (Turbopack) does not
// map `.js` to `.ts`, so relative import specifiers are rewritten extensionless.
// Run from anywhere: node scripts/sync-shared.mjs
import { cpSync, rmSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, 'backend', 'src', 'shared');
const dest = join(root, 'frontend', 'src', 'shared');

if (!existsSync(src)) {
  console.error(`source not found: ${src}`);
  process.exit(1);
}
rmSync(dest, { recursive: true, force: true });
mkdirSync(dirname(dest), { recursive: true });
cpSync(src, dest, { recursive: true });

// Rewrite `from './x.js'` / `from '../x.js'` → extensionless for Turbopack.
const specifiers = /(from\s+|import\s*\(\s*)'(\.[^']*)\.js'/g;
let rewritten = 0;
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.ts')) {
      const code = readFileSync(full, 'utf8');
      const next = code.replace(specifiers, (_m, head, path) => {
        rewritten += 1;
        return `${head}'${path}'`;
      });
      if (next !== code) writeFileSync(full, next);
    }
  }
}
walk(dest);
console.log(`synced backend/src/shared → frontend/src/shared (${rewritten} import specifiers rewritten)`);
