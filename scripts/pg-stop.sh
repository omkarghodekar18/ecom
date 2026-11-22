#!/usr/bin/env bash
# Stops the user-space PostgreSQL instance.
set -euo pipefail
ROOT="/home/z/my-project/scripts/pgtest"
NATIVE="$ROOT/node_modules/@embedded-postgres/linux-x64/native"
"$NATIVE/bin/pg_ctl" -D "$ROOT/data" -m fast stop || echo "not running"
