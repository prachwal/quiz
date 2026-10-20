#!/usr/bin/env bash
# Browser end-to-end suite (Playwright, tests/e2e): starts `npm run dev:full` through playwright.config.ts and drives
# the quiz editor, the quiz player and the lesson slides in Chromium. Usage: npm run test:e2e [playwright args]
#
# The suite writes to the SHARED database (DATABASE_URL) and uploads to the REAL bucket under the dev/ prefix. Every
# row and object it creates is prefixed "[E2E]" or belongs to the owner dev|mcp-e2e-browser, and it removes them again
# (per-spec afterAll and a global teardown). It therefore refuses to start unless E2E_ALLOW_REMOTE_DB=1 is set.
#
# Environment: the login bypass is switched on for the server only (DEV_AUTH_TOKEN is random for every run and is
# never printed); .env and .env.local are read by node, not sourced, because connection strings contain `&`.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2

if [ "${E2E_ALLOW_REMOTE_DB:-}" != "1" ]; then
  cat >&2 <<'MSG'
npm run test:e2e writes to the shared database (DATABASE_URL) and to the real bucket under the dev/ prefix.
It creates [E2E] quizzes, courses and media for the test owner dev|mcp-e2e-browser and removes them again.
If that is intended: E2E_ALLOW_REMOTE_DB=1 npm run test:e2e
MSG
  exit 2
fi

# One run at a time: the suite and `npm run test:mcp` clean up the same owner and the same ports.
LOCK_FILE="${GATE_LOCK_FILE:-/tmp/claude-1000/mcp-e2e.lock}"
mkdir -p "$(dirname "$LOCK_FILE")"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "waiting for the e2e lock…" >&2
  if ! flock -w 1200 9; then
    echo "the e2e lock was not free within 20 minutes; nothing was started" >&2
    exit 2
  fi
fi

if ! command -v ss >/dev/null 2>&1; then
  echo "ss (iproute2) is required to check that ports 8888 and 5173 are free" >&2
  exit 2
fi

port_busy() {
  [ -n "$(ss -Hltn "sport = :$1")" ]
}

# Nothing is killed: the run only waits for ports that another process still holds.
for _ in $(seq 1 60); do
  if ! port_busy 8888 && ! port_busy 5173; then
    break
  fi
  sleep 1
done
if port_busy 8888 || port_busy 5173; then
  echo "ports 8888 or 5173 are still in use after 60 s: stop the dev server first (npm run dev:full), then rerun" >&2
  exit 2
fi

# Login bypass for the server (LOCAL_DEV is set by scripts/dev-server.mjs) and for the Vite bundle (dev only).
DEV_AUTH_TOKEN="$(openssl rand -hex 24)"
export DEV_AUTH_TOKEN
export VITE_DEV_AUTH_TOKEN="$DEV_AUTH_TOKEN"
export DEV_AUTH_ROLES=admin,teacher
export DEV_AUTH_USER_ID='dev|mcp-e2e-browser'
# the image allowlist of the editor: the public base of the bucket, read the same way the server reads it
VITE_MEDIA_PUBLIC_BASE_URL="$(node --env-file-if-exists=.env --env-file-if-exists=.env.local -p 'process.env.MEDIA_PUBLIC_BASE_URL ?? ""')"
export VITE_MEDIA_PUBLIC_BASE_URL

# the child does not inherit the lock descriptor, so a stray child cannot keep the lock after the run
node --env-file-if-exists=.env --env-file-if-exists=.env.local node_modules/@playwright/test/cli.js test "$@" 9>&-
exit $?
