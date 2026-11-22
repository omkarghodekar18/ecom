// Loads ONLY this project's .env.
// dotenv v18 searches parent directories for .env files, which would let a
// workspace-level .env leak into this standalone project and override its
// values (e.g. a frontend template DATABASE_URL). Explicit path + override
// prevents that. Contract: run scripts via npm scripts from backend/.
import { config } from 'dotenv';
import { resolve } from 'node:path';

const result = config({ path: resolve(process.cwd(), '.env'), override: true, quiet: true });

if (result.error && process.env.NODE_ENV === 'production') {
  // In production a missing .env is fine only if all vars come from the
  // environment itself; otherwise boot will fail fast in env validation.
  // Nothing to do here: config/env.ts enforces that.
}

export const loadedEnvPath = resolve(process.cwd(), '.env');
