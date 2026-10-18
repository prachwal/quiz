#!/usr/bin/env bash
# Full local MCP test: starts `netlify dev` (for its local database), runs scripts/mcp-local-e2e.ts against the
# in-process app with the official MCP client, then stops everything it started. Usage: npm run test:mcp
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

if ss -ltn 2>/dev/null | grep -q ':8888 '; then
  # an already running `netlify dev` (e.g. yours) is reused and left untouched; test rows carry the "mcp-e2e" prefix
  echo "Port 8888 jest zajęty - używam działającego serwera i jego lokalnej bazy (nie zatrzymuję go)." >&2
else
  setsid npx netlify dev --offline >"$LOG" 2>&1 &
  DEV=$!
fi

for _ in $(seq 1 60); do
  curl -sf localhost:8888/api/health >/dev/null && break
  sleep 2
done
curl -sf localhost:8888/api/health >/dev/null || { echo "netlify dev nie wystartował:" >&2; tail -20 "$LOG" >&2; exit 2; }

PID=$(ss -ltnp 2>/dev/null | grep ':8888 ' | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)
DBPORT=$(ss -ltnp 2>/dev/null | grep "pid=$PID," | awk '{print $4}' | grep '^127.0.0.1' | head -1 | cut -d: -f2)
[ -n "$DBPORT" ] || { echo "Nie znaleziono portu lokalnej bazy." >&2; exit 2; }

npx esbuild scripts/mcp-local-e2e.ts --bundle --platform=node --format=esm --packages=external --outfile="$BUNDLE" --log-level=error || exit 2
NETLIFY_DB_URL="postgres://postgres@localhost:$DBPORT/postgres" node --env-file=.env "$BUNDLE"
STATUS=$?
if [ "${MCP_E2E_VIA_DEV:-}" = "1" ] && [ $STATUS -eq 0 ]; then
  # the same checks again through the real function behind `netlify dev` (adapter + proxy)
  NETLIFY_DB_URL="postgres://postgres@localhost:$DBPORT/postgres" MCP_E2E_URL="http://localhost:8888/api" node --env-file=.env "$BUNDLE"
  STATUS=$?
fi
exit $STATUS
