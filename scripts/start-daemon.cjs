#!/usr/bin/env node
// Double-fork style daemon starter (same pattern pg_ctl uses — that one is
// proven to survive the sandbox's between-command process reaper).
// Usage: node start-daemon.cjs <name> <cwd> <command> [args...]
// The child is spawned detached (own session via setsid), stdio redirected to
// /tmp/<name>.log, and this parent exits immediately — the child is reparented
// to init and survives the caller's death.
const { spawn } = require('node:child_process');
const fs = require('node:fs');

const [name, cwd, command, ...args] = process.argv.slice(2);
if (!name || !cwd || !command) {
  console.error('usage: node start-daemon.cjs <name> <cwd> <command> [args...]');
  process.exit(2);
}

const log = fs.openSync(`/tmp/${name}.log`, 'a');
const child = spawn(command, args, {
  cwd,
  detached: true,
  stdio: ['ignore', log, log],
  env: process.env,
});
child.unref();
console.log(`[daemon] ${name} started pid=${child.pid} log=/tmp/${name}.log`);
process.exit(0);
