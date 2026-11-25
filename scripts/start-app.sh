#!/usr/bin/env bash
# Starts the whole ToolHub application: Postgres (5433) → backend API (4000) →
# frontend (3000). Idempotent — skips anything already running. Daemonized so
# the servers survive after this script exits (pg_ctl-style double fork).
set -euo pipefail
ROOT="/home/z/my-project"

wait_for() { # wait_for <url> <label> [timeout_s]
  local url="$1" label="$2" timeout="${3:-60}"
  for i in $(seq 1 "$timeout"); do
    if curl -sf -m 2 "$url" > /dev/null 2>&1; then
      echo "[ok] $label is up (${i}s)"
      return 0
    fi
    sleep 1
  done
  echo "[FAIL] $label did not come up within ${timeout}s"
  return 1
}

# 1) Postgres (all recovery — initdb, stripped runtime dirs, socket dir —
#    lives in pg-start.sh, which handles every sandbox-recycle state.)
if "$ROOT/scripts/pgtest/node_modules/@embedded-postgres/linux-x64/native/bin/pg_ctl" \
    -D "$ROOT/scripts/pgtest/data" status >/dev/null 2>&1; then
  echo "[ok] Postgres already running on 127.0.0.1:5433"
else
  bash "$ROOT/scripts/pg-start.sh"
fi

# 2) Backend API (port 4000)
if curl -sf -m 2 "http://127.0.0.1:4000/api/v1/health" > /dev/null 2>&1; then
  echo "[ok] backend already running on :4000"
else
  node "$ROOT/scripts/start-daemon.cjs" backend "$ROOT/backend" npm run dev
  wait_for "http://127.0.0.1:4000/api/v1/health" "backend API (:4000)" 90
fi

# 3) Frontend (port 3000)
if curl -sf -m 2 -o /dev/null "http://127.0.0.1:3000/in/en" 2>/dev/null; then
  echo "[ok] frontend already running on :3000"
else
  node "$ROOT/scripts/start-daemon.cjs" frontend "$ROOT/frontend" npm run dev
  wait_for "http://127.0.0.1:3000/in/en" "frontend (:3000)" 120
fi

echo
echo "ToolHub is running:"
echo "  storefront : http://localhost:3000/in/en"
echo "  admin panel: http://localhost:3000/admin  (admin@example.com / Admin123!secure)"
echo "  API + docs : http://localhost:4000/api/v1/health | /api/docs"
