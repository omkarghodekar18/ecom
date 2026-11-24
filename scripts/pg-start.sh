#!/usr/bin/env bash
# Starts the user-space PostgreSQL 18 instance used for local dev/testing.
# Data dir: /home/z/my-project/scripts/pgtest/data (persistent between messages).
set -euo pipefail
ROOT="/home/z/my-project/scripts/pgtest"
NATIVE="$ROOT/node_modules/@embedded-postgres/linux-x64/native"
export PATH="$NATIVE/bin:$PATH"

if "$NATIVE/bin/pg_ctl" -D "$ROOT/data" status >/dev/null 2>&1; then
  echo "Postgres already running on 127.0.0.1:5433"
else
  if [ ! -f "$ROOT/data/PG_VERSION" ]; then
    echo "Initializing data dir..."
    "$NATIVE/bin/initdb" -D "$ROOT/data" -U postgres --auth=trust -E UTF8
  fi
  # Socket dir is empty while the server is down, so the sandbox recycle strips
  # it — recreate before start or postgres FATALs on the lock file.
  mkdir -p "$ROOT/db-socket" && chmod 700 "$ROOT/db-socket"
  "$NATIVE/bin/pg_ctl" -D "$ROOT/data" \
    -o "-p 5433 -k $ROOT/db-socket -c listen_addresses=127.0.0.1 -c max_connections=200" \
    -l "$ROOT/pg.log" -w start
  echo "Postgres started on 127.0.0.1:5433"
fi

# Ensure dev + test databases exist.
node "$ROOT/check.js"
