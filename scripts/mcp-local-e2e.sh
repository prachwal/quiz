#!/usr/bin/env bash
# Full local MCP test: starts the local dev server (scripts/dev-server.mjs, which serves the bundled
# Express app on :8888), runs scripts/mcp-local-e2e.ts against it with the official MCP client, then
# stops everything it started. Usage: npm run test:mcp
#
# The test writes rows prefixed with "mcp-e2e" into DATABASE_URL and removes them afterwards, so point
# .env.local at a development database, never at production.
set -uo pipefail
cd "$(dirname "$0")/.."

LOG="$(mktemp)"
BUNDLE=".mcp-e2e.mjs"
DEV=""
cleanup() {
  [ -n "$DEV" ] && kill -- "-$DEV" 2>/dev/null
  rm -f "$BUNDLE" "$LOG"
}
trap cleanup EXIT

# `.env` first, then `.env.local` (which overrides it)
set -a
# shellcheck disable=SC1090
[ -f .env ] && . ./.env
# shellcheck disable=SC1090
[ -f .env.local ] && . ./.env.local
set +a
[ -n "${DATABASE_URL:-}" ] || { echo "DATABASE_URL nie jest ustawione (.env / .env.local)." >&2; exit 2; }

if ss -ltn 2>/dev/null | grep -q ':8888 '; then
  # an already running dev server (e.g. yours) is reused and left untouched
  echo "Port 8888 jest zajęty - używam działającego serwera (nie zatrzymuję go)." >&2
else
  setsid node scripts/dev-server.mjs >"$LOG" 2>&1 &
  DEV=$!
fi

for _ in $(seq 1 60); do
  curl -sf localhost:8888/api/health >/dev/null && break
  sleep 1
done
curl -sf localhost:8888/api/health >/dev/null || { echo "dev server nie wystartował:" >&2; tail -20 "$LOG" >&2; exit 2; }

npx esbuild scripts/mcp-local-e2e.ts --bundle --platform=node --format=esm --packages=external --outfile="$BUNDLE" --log-level=error || exit 2
node "$BUNDLE"
STATUS=$?
if [ "${MCP_E2E_VIA_DEV:-}" = "1" ] && [ $STATUS -eq 0 ]; then
  # the same checks again through the bundled function behind the dev proxy
  MCP_E2E_URL="http://localhost:8888/api" node "$BUNDLE"
  STATUS=$?
fi
exit $STATUS
