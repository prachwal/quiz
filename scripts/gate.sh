#!/usr/bin/env bash
# Local gate: the checks a change must pass before it is committed or pushed (CLAUDE.md, Commands).
#
# Usage: scripts/gate.sh [fast]   (or npm run gate / npm run gate:fast)
#   no argument  lint, tsc -b, tsc -p tsconfig.server.json, npm test, build, build:api
#                (+ api/index.mjs must be committed), test:ui, test:mcp under flock
#   fast         lint, tsc -b, tsc -p tsconfig.server.json, npm test only
#
# Every step writes its output to a temp file under ${TMPDIR:-/tmp}; a failing step prints the last 40 lines
# of that output and the gate continues to the summary. Exit code 0 only when every step passed.
#
# Test hook (for checking that the gate really fails): GATE_FORCE_FAIL=<step> makes that step report FAIL
# without running anything. Steps: lint, tsc-build, tsc-server, test, build, build-api, test-ui, test-mcp.
set -u

cd "$(dirname "$0")/.." || exit 1

MODE=full
case "${1:-}" in
  "") ;;
  fast) MODE=fast ;;
  *)
    echo "usage: scripts/gate.sh [fast]" >&2
    exit 2
    ;;
esac

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/gate.XXXXXX")" || exit 1
trap 'rm -rf "$TMP_DIR"' EXIT

FAILED=0
SUMMARY=()

# record STATUS NAME SECONDS DETAIL
record() {
  if [ "$1" = FAIL ]; then
    FAILED=$((FAILED + 1))
  fi
  SUMMARY+=("$(printf '%s  %-10s  %ss  %s' "$1" "$2" "$3" "$4")")
}

# run NAME COMMAND... : runs the command with its output in $TMP_DIR/NAME.log; sets LOG, RC and SECS.
run() {
  local name=$1
  shift
  LOG="$TMP_DIR/$name.log"
  local start
  start=$(date +%s)
  if [ "${GATE_FORCE_FAIL:-}" = "$name" ]; then
    echo "GATE_FORCE_FAIL=$name: step not run on purpose" >"$LOG"
    RC=1
  else
    "$@" >"$LOG" 2>&1
    RC=$?
  fi
  SECS=$(($(date +%s) - start))
}

# show_tail NAME : the last 40 lines of a failed step's output
show_tail() {
  echo "----- $1: last 40 lines of output -----"
  tail -n 40 "$LOG"
  echo "----- end of $1 -----"
}

# plain NAME COMMAND... : a step that passes when the command exits 0
plain() {
  local name=$1
  run "$@"
  if [ "$RC" -eq 0 ]; then
    record PASS "$name" "$SECS" "exit 0"
  else
    record FAIL "$name" "$SECS" "exit $RC"
    show_tail "$name"
  fi
}

step_lint() {
  run lint npm run lint
  local warnings
  warnings=$(grep -ci 'warning' "$LOG")
  if [ "$RC" -eq 0 ] && [ "$warnings" -eq 0 ]; then
    record PASS lint "$SECS" "0 warnings"
  else
    record FAIL lint "$SECS" "exit $RC, $warnings line(s) with 'warning'"
    show_tail lint
  fi
}

step_test() {
  run test npm test
  local pass fail
  pass=$(awk '/^# pass /{print $3}' "$LOG" | tail -n 1)
  fail=$(awk '/^# fail /{print $3}' "$LOG" | tail -n 1)
  if [ "$RC" -eq 0 ] && [ -n "$pass" ] && [ -n "$fail" ] && [ "$fail" -eq 0 ]; then
    record PASS test "$SECS" "$pass tests"
  else
    record FAIL test "$SECS" "exit $RC, pass=${pass:-?} fail=${fail:-?}"
    show_tail test
  fi
}

step_build_api() {
  run build-api npm run build:api
  if [ "$RC" -ne 0 ]; then
    record FAIL build-api "$SECS" "exit $RC"
    show_tail build-api
    return
  fi
  if [ -n "$(git status --porcelain -- api/index.mjs)" ]; then
    record FAIL build-api "$SECS" "api/index.mjs modified: commit the regenerated api/index.mjs"
    return
  fi
  record PASS build-api "$SECS" "api/index.mjs in sync"
}

step_test_ui() {
  run test-ui npm run test:ui
  local tests
  tests=$(grep -E '^[[:space:]]*Tests[[:space:]]+[0-9]+ passed' "$LOG" | tail -n 1 | sed -E 's/^[[:space:]]*Tests[[:space:]]+([0-9]+) passed.*/\1/')
  if [ "$RC" -eq 0 ] && [ -n "$tests" ] && ! grep -Eq 'Tests[[:space:]]+[0-9]+ failed' "$LOG"; then
    record PASS test-ui "$SECS" "$tests tests"
  else
    record FAIL test-ui "$SECS" "exit $RC, no 'Tests N passed' without failures"
    show_tail test-ui
  fi
}

step_test_mcp() {
  if ss -ltn | grep -qE ':8888 |:5173 '; then
    record FAIL test-mcp 0s "stop the dev server first (port 8888 or 5173 is in use)"
    return
  fi
  run test-mcp flock /tmp/claude-1000/mcp-e2e.lock env MCP_E2E_ALLOW_REMOTE_DB=1 npm run test:mcp
  local line passed failed
  line=$(grep -E 'MCP local e2e .*: [0-9]+ passed, [0-9]+ failed' "$LOG" | tail -n 1)
  passed=$(printf '%s' "$line" | sed -E 's/.*: ([0-9]+) passed, ([0-9]+) failed.*/\1/')
  failed=$(printf '%s' "$line" | sed -E 's/.*: ([0-9]+) passed, ([0-9]+) failed.*/\2/')
  if [ "$RC" -eq 0 ] && [ -n "$line" ] && [ "$failed" -eq 0 ]; then
    record PASS test-mcp "$SECS" "$passed passed"
  else
    record FAIL test-mcp "$SECS" "exit $RC, passed=${passed:-?} failed=${failed:-?} (or summary line missing)"
    show_tail test-mcp
  fi
}

skip() {
  record SKIP "$1" 0 "$2"
}

step_lint
plain tsc-build npx tsc -b
plain tsc-server npx tsc -p tsconfig.server.json --noEmit
step_test

if [ "$MODE" = fast ]; then
  for name in build build-api test-ui test-mcp; do
    skip "$name" "fast mode"
  done
else
  plain build npm run build
  if [ "$RC" -eq 0 ]; then
    step_build_api
  else
    skip build-api "build failed"
  fi
  step_test_ui
  step_test_mcp
fi

echo
echo "GATE SUMMARY ($MODE)"
for line in "${SUMMARY[@]}"; do
  echo "$line"
done
echo

if [ "$FAILED" -eq 0 ]; then
  echo "GATE: PASS"
  exit 0
fi
echo "GATE: FAIL ($FAILED failed)"
exit 1
