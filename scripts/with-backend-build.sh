#!/usr/bin/env bash
# Runs `next build` with the backend dev server up (needed for SSG data).
# Everything in one process tree so the sandbox reaper can't kill the backend
# mid-build. Usage: bash scripts/with-backend-build.sh
set -euo pipefail
ROOT="/home/z/my-project"

# Start backend
(cd "$ROOT/backend" && npm run dev > /tmp/backend-build.log 2>&1 &) 
BACKEND_PID=""
trap '[[ -n "$BACKEND_PID" ]] && kill "$BACKEND_PID" 2>/dev/null || true; pkill -f "tsx watch src/server.ts" 2>/dev/null || true' EXIT

echo "Waiting for backend health..."
for i in $(seq 1 45); do
  if curl -sf -m 2 http://127.0.0.1:4000/api/v1/health > /dev/null 2>&1; then
    echo "Backend up after ${i}s"
    break
  fi
  sleep 1
done
curl -sf -m 3 http://127.0.0.1:4000/api/v1/health > /dev/null || { echo "Backend failed to start"; tail -20 /tmp/backend-build.log; exit 1; }

cd "$ROOT/frontend"
npm run build
BUILD_STATUS=$?
exit $BUILD_STATUS
