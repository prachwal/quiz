#!/usr/bin/env bash
# Local gate: the checks a change must pass before it is committed or pushed (CLAUDE.md, Commands).
#
# Usage: scripts/gate.sh [fast | --selftest]   (or npm run gate / npm run gate:fast)
#   no argument  lint, tsc -b, tsc -p tsconfig.server.json, npm test, build, build:api
#                (+ api/index.mjs must be committed), test:ui, test:mcp under flock
#   fast         lint, tsc -b, tsc -p tsconfig.server.json, npm test only
#   --selftest   checks the pure decision helpers against canned vitest output; runs no other step
#
# Every step writes its output to a temp file under ${TMPDIR:-/tmp}; a failing step prints the last 40 lines
# of that output and the gate continues to the summary. Exit code 0 only when every step passed.
#
# Test hooks (for checking that the gate really fails or waits; never used in a normal run):
#   GATE_FORCE_FAIL=<step>     that step reports FAIL without running anything.
#                              Steps: lint, tsc-build, tsc-server, test, build, build-api, test-ui, test-mcp.
#   GATE_TEST_MCP_CMD=<cmd>    command run by the test-mcp step through bash -c (default: env MCP_E2E_ALLOW_REMOTE_DB=1 npm run test:mcp).
#   GATE_LOCK_FILE=<path>      e2e lock file (default: /tmp/claude-1000/mcp-e2e.lock).
#   GATE_PORT_WAIT_SECONDS=<n> how long the test-mcp step waits for ports 8888/5173 to free up once it holds
#                              the lock (default: 60). Nothing is ever killed.
set -u

cd "$(dirname "$0")/.." || exit 1

MODE=full
case "${1:-}" in
  "") ;;
  fast) MODE=fast ;;
  --selftest) MODE=selftest ;;
  *)
    echo "usage: scripts/gate.sh [fast | --selftest]" >&2
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
# The command does not inherit fd 9 (the e2e lock), so a leftover child cannot keep the lock.
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
    "$@" 9>&- >"$LOG" 2>&1
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
  # With node_modules symlinked (git worktrees) the bundle gets different relative paths than the committed one.
  if [ -L node_modules ]; then
    record SKIP build-api "$SECS" "worktree: node_modules is a symlink, bundle sync checked only in the main checkout"
    return
  fi
  if [ -n "$(git status --porcelain -- api/index.mjs)" ]; then
    record FAIL build-api "$SECS" "api/index.mjs modified: commit the regenerated api/index.mjs"
    return
  fi
  record PASS build-api "$SECS" "api/index.mjs in sync"
}

# ui_tests_count FILE : the number from the last 'Tests N passed' summary line, empty when there is none
ui_tests_count() {
  grep -E '^[[:space:]]*Tests[[:space:]]+[0-9]+ passed' "$1" | tail -n 1 | sed -E 's/^[[:space:]]*Tests[[:space:]]+([0-9]+) passed.*/\1/'
}

# only_timeout_failures FILE : true (0) when the vitest output reports at least one failed test and every failed
# test failed with 'Test timed out'. Sets TIMEOUT_FAILURES and TOTAL_FAILURES for the report. Pure: reads the file only.
only_timeout_failures() {
  TIMEOUT_FAILURES=0
  TOTAL_FAILURES=0
  [ -r "$1" ] || return 1
  TOTAL_FAILURES=$(sed -nE 's/^[[:space:]]*Tests[[:space:]]+([0-9]+) failed.*/\1/p' "$1" | tail -n 1)
  TOTAL_FAILURES=${TOTAL_FAILURES:-0}
  TIMEOUT_FAILURES=$(grep -c 'Test timed out' "$1")
  [ "$TOTAL_FAILURES" -gt 0 ] && [ "$TIMEOUT_FAILURES" -eq "$TOTAL_FAILURES" ]
}

step_test_ui() {
  run test-ui npm run test:ui
  local tests
  tests=$(ui_tests_count "$LOG")
  if [ "$RC" -eq 0 ] && [ -n "$tests" ] && ! grep -Eq 'Tests[[:space:]]+[0-9]+ failed' "$LOG"; then
    record PASS test-ui "$SECS" "$tests tests"
    return
  fi
  # Under parallel load vitest can hit its 5 s timeout. Only timeouts earn one retry; anything else fails at once.
  if ! only_timeout_failures "$LOG"; then
    record FAIL test-ui "$SECS" "exit $RC, no 'Tests N passed' without failures"
    show_tail test-ui
    return
  fi
  local first_secs=$SECS flaky=$TIMEOUT_FAILURES
  cp "$LOG" "$TMP_DIR/test-ui-first.log"
  run test-ui-retry npm run test:ui -- --retry=1
  tests=$(ui_tests_count "$LOG")
  SECS=$((SECS + first_secs))
  if [ "$RC" -eq 0 ] && [ -n "$tests" ] && ! grep -Eq 'Tests[[:space:]]+[0-9]+ failed' "$LOG"; then
    record PASS test-ui "$SECS" "passed on retry (flaky timeouts: $flaky)"
  else
    record FAIL test-ui "$SECS" "exit $RC, still failing after one --retry=1 run"
    show_tail test-ui-retry
  fi
}

# ports_busy : true when something listens on 8888 or 5173
ports_busy() {
  ss -ltn | grep -Eq ':(8888|5173)[[:space:]]'
}

# wait_ports_free : polls the ports for GATE_PORT_WAIT_SECONDS (default 60); never kills anything
wait_ports_free() {
  local limit=${GATE_PORT_WAIT_SECONDS:-60} waited=0
  while ports_busy; do
    if [ "$waited" -ge "$limit" ]; then
      return 1
    fi
    sleep 1
    waited=$((waited + 1))
  done
  return 0
}

step_test_mcp() {
  local start lock_file cmd line passed failed waited
  start=$(date +%s)
  if ! command -v ss >/dev/null 2>&1; then
    record FAIL test-mcp 0s "cannot check ports: ss not found"
    return
  fi
  lock_file=${GATE_LOCK_FILE:-/tmp/claude-1000/mcp-e2e.lock}
  cmd=${GATE_TEST_MCP_CMD:-env MCP_E2E_ALLOW_REMOTE_DB=1 npm run test:mcp}
  mkdir -p "$(dirname "$lock_file")"
  # The lock comes first: parallel runs queue here instead of failing on a port another run is using.
  exec 9>"$lock_file"
  if ! flock -n 9; then
    echo "waiting for the e2e lock…"
    if ! flock -w 1200 9; then
      exec 9>&-
      record FAIL test-mcp "$(($(date +%s) - start))" "gave up after 20 min waiting for the e2e lock $lock_file"
      return
    fi
  fi
  waited=$(($(date +%s) - start))
  # The ports are checked only while holding the lock: the run that holds it may still be shutting its server down.
  if ! wait_ports_free; then
    exec 9>&-
    record FAIL test-mcp "$(($(date +%s) - start))" "stop the dev server first (port 8888 or 5173 still in use after ${GATE_PORT_WAIT_SECONDS:-60}s)"
    return
  fi
  run test-mcp bash -c "$cmd"
  exec 9>&-
  line=$(grep -E 'MCP local e2e .*: [0-9]+ passed, [0-9]+ failed' "$LOG" | tail -n 1)
  passed=$(printf '%s' "$line" | sed -E 's/.*: ([0-9]+) passed, ([0-9]+) failed.*/\1/')
  failed=$(printf '%s' "$line" | sed -E 's/.*: ([0-9]+) passed, ([0-9]+) failed.*/\2/')
  if [ "$RC" -eq 0 ] && [ -n "$line" ] && [ "$failed" -eq 0 ]; then
    record PASS test-mcp "$(($(date +%s) - start))" "$passed passed (waited ${waited}s for the lock)"
  else
    record FAIL test-mcp "$(($(date +%s) - start))" "exit $RC, passed=${passed:-?} failed=${failed:-?} (or summary line missing)"
    show_tail test-mcp
  fi
}

# selftest_gate : canned vitest outputs for only_timeout_failures; prints one line per case
selftest_gate() {
  local ok=0 file
  check() { # check NAME EXPECTED(0 true | 1 false) FILE
    only_timeout_failures "$3"
    local got=$?
    if [ "$got" -eq "$2" ]; then
      echo "ok    $1 (timeouts=$TIMEOUT_FAILURES failures=$TOTAL_FAILURES)"
    else
      echo "FAIL  $1: expected $2, got $got (timeouts=$TIMEOUT_FAILURES failures=$TOTAL_FAILURES)"
      ok=1
    fi
  }

  file="$TMP_DIR/sample-timeouts.txt"
  printf '%s\n' ' FAIL  tests/a.test.tsx > A > slow one' 'Error: Test timed out in 5000ms.' ' FAIL  tests/b.test.tsx > B > slow two' 'Error: Test timed out in 5000ms.' '' ' Test Files  2 failed | 10 passed (12)' '      Tests  2 failed | 300 passed (302)' > "$file"
  check "only timeouts" 0 "$file"

  file="$TMP_DIR/sample-mixed.txt"
  printf '%s\n' ' FAIL  tests/a.test.tsx > A > slow one' 'Error: Test timed out in 5000ms.' ' FAIL  tests/c.test.tsx > C > wrong' 'AssertionError: expected 1 to be 2' '      Tests  2 failed | 300 passed (302)' > "$file"
  check "timeout plus assertion" 1 "$file"

  file="$TMP_DIR/sample-no-tests-failed.txt"
  printf '%s\n' ' FAIL  tests/a.test.tsx > A > slow one' 'Error: Test timed out in 5000ms.' ' Test Files  1 failed | 11 passed (12)' '      Tests  302 passed (302)' > "$file"
  check "timeout text but no failed tests in summary" 1 "$file"

  file="$TMP_DIR/sample-plain-failure.txt"
  printf '%s\n' ' FAIL  tests/d.test.tsx > D > broken' 'TypeError: x is not a function' '      Tests  1 failed | 301 passed (302)' > "$file"
  check "single non-timeout failure" 1 "$file"

  file="$TMP_DIR/sample-clean.txt"
  printf '%s\n' '      Tests  302 passed (302)' > "$file"
  check "clean run" 1 "$file"

  check "missing file" 1 "$TMP_DIR/does-not-exist.txt"

  if [ "$ok" -eq 0 ]; then
    echo "SELFTEST: PASS"
  else
    echo "SELFTEST: FAIL"
  fi
  return "$ok"
}

skip() {
  record SKIP "$1" 0 "$2"
}

if [ "$MODE" = selftest ]; then
  selftest_gate
  exit $?
fi

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
