#!/usr/bin/env node
// Applies migrations to the TEST database before `npm test` (idempotent).
// Uses DATABASE_URL from the environment only if it points at a *_test db;
// otherwise falls back to the local embedded instance default.
import { spawnSync } from 'node:child_process';

const url =
  process.env.DATABASE_URL && process.env.DATABASE_URL.includes('_test')
    ? process.env.DATABASE_URL
    : 'postgresql://postgres@127.0.0.1:5433/toolhub_test';

const res = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
  env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
  stdio: 'inherit',
});
process.exit(res.status ?? 1);
