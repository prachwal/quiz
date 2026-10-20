#!/usr/bin/env bash
# Full local MCP test: starts the local dev server (scripts/dev-server.mjs, which serves the bundled
# Express app on :8888), runs scripts/mcp-local-e2e.ts against it with the official MCP client, then
# stops everything it started. Usage: npm run test:mcp
#
# The test writes rows prefixed with "mcp-e2e" into DATABASE_URL and removes them afterwards. It refuses a
# database that is not on localhost unless MCP_E2E_ALLOW_REMOTE_DB=1 (there is no separate dev database when
# .env points at Neon - then you accept that the prefixed rows are created and deleted there).
set -uo pipefail
cd "$(dirname "$0")/.."

# Media: the memory driver and a fixed public base keep the URLs predictable and the bucket out of the picture.
# MEDIA_MEMORY_DIR makes the memory driver write its objects to a temporary directory, so the dev server and this
# script (two processes) see the same objects. URL fetching is pinned OFF: the test never makes a network request.
# All of this is set here, not in .env, on purpose.
export MEDIA_DRIVER=memory
export MEDIA_PUBLIC_BASE_URL=https://media.test
export MEDIA_URL_FETCH=false
MEDIA_DIR="$(mktemp -d)"
export MEDIA_MEMORY_DIR="$MEDIA_DIR"

LOG="$(mktemp)"
BUNDLE=".mcp-e2e.mjs"
DEV=""
cleanup() {
  [ -n "$DEV" ] && kill -- "-$DEV" 2>/dev/null
  rm -f "$BUNDLE" "$LOG"
  rm -rf "$MEDIA_DIR"
}
trap cleanup EXIT

# `.env` first, then `.env.local`; read with node (not by sourcing, which breaks on `&` in connection strings).
# Like scripts/dev-server.mjs, variables already set in the shell win over the files.
ENV_FLAGS=(--env-file-if-exists=.env --env-file-if-exists=.env.local)
DB_HOST="$(node "${ENV_FLAGS[@]}" -p "process.env.DATABASE_URL ? (new URL(process.env.DATABASE_URL).hostname || 'socket') : ''")"
[ -n "$DB_HOST" ] || { echo "DATABASE_URL nie jest ustawione (.env / .env.local)." >&2; exit 2; }
case "$DB_HOST" in
  localhost|127.0.0.1|::1|\[::1\]|socket) ;;
  *)
    if [ "${MCP_E2E_ALLOW_REMOTE_DB:-}" != "1" ]; then
      echo "DATABASE_URL wskazuje na $DB_HOST, nie na lokalną bazę. Test dopisuje i kasuje wiersze z prefiksem mcp-e2e." >&2
      echo "Jeśli to zamierzone: MCP_E2E_ALLOW_REMOTE_DB=1 npm run test:mcp" >&2
      exit 2
    fi
    ;;
esac

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
node "${ENV_FLAGS[@]}" "$BUNDLE"
STATUS=$?
if [ "${MCP_E2E_VIA_DEV:-}" = "1" ] && [ $STATUS -eq 0 ]; then
  # the same checks again through the bundled function behind the dev proxy
  MCP_E2E_URL="http://localhost:8888/api" node "${ENV_FLAGS[@]}" "$BUNDLE"
  STATUS=$?
fi
exit $STATUS
