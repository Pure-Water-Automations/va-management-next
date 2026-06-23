#!/usr/bin/env bash
# Smoke-test driver for va-management-next.
# Starts the dev server (if not already running), hits a handful of routes,
# and prints PASS/FAIL for each. Exit code 0 = all passed.
#
# Usage (from repo root):
#   bash .claude/skills/run-va-management-next/smoke.sh
#
# To stop the server afterwards, kill the PID printed at the top.

set -euo pipefail
cd "$(dirname "$0")/../../.."   # repo root

PORT=3032
BASE="http://localhost:3032"
PASS=0; FAIL=0

check() {
  local label="$1" url="$2" expect_code="${3:-200}"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>&1)
  if [ "$code" = "$expect_code" ]; then
    echo "  PASS  $label  ($code)"
    PASS=$((PASS+1))
  else
    echo "  FAIL  $label  (got $code, wanted $expect_code)  ← $url"
    FAIL=$((FAIL+1))
  fi
}

# ── 1. Start server if not already listening ────────────────────────────────
if ! curl -s -o /dev/null -m 2 "$BASE/" 2>/dev/null; then
  echo "Starting dev server on :$PORT …"
  export PRISMA_QUERY_ENGINE_LIBRARY="$(pwd)/node_modules/@prisma/engines/libquery_engine-debian-openssl-3.0.x.so.node"
  npm run dev > /tmp/va-next-dev.log 2>&1 &
  SERVER_PID=$!
  echo "  server PID: $SERVER_PID  (logs: /tmp/va-next-dev.log)"
  echo "  waiting for ready …"
  for i in $(seq 1 20); do
    sleep 2
    if grep -q "Ready in" /tmp/va-next-dev.log 2>/dev/null; then
      echo "  ready after ${i}x2s"
      break
    fi
  done
else
  echo "Dev server already running on :$PORT"
fi

# ── 2. Route smoke tests ────────────────────────────────────────────────────
echo ""
echo "Route checks:"
check "root redirect"         "$BASE/"          307
check "HR dashboard"          "$BASE/hr"        200
check "VA console"            "$BASE/va"        200
check "Payroll console"       "$BASE/payroll"   200
check "Recruitment"           "$BASE/recruitment" 200
check "Public apply form"     "$BASE/apply"     200
check "Login page"            "$BASE/login"     200

# ── 3. API smoke ───────────────────────────────────────────────────────────
echo ""
echo "API checks:"
check "health endpoint"       "$BASE/api/health"           200  # always public

echo ""
echo "────────────────────────────────"
echo "  Passed: $PASS   Failed: $FAIL"
[ "$FAIL" -eq 0 ] && echo "  ✓ All checks passed" && exit 0
echo "  ✗ Some checks failed" && exit 1
