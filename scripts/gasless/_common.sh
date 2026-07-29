#!/usr/bin/env bash
# Common helpers for gasless CLI verification scripts
# Source this file: source "$(dirname "\$0")/_common.sh"

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

_pass() { echo -e "  ${GREEN}✅ PASS${NC}: $1"; }
_fail() { echo -e "  ${RED}❌ FAIL${NC}: $1"; FAILURES=$((FAILURES + 1)); }
_info() { echo -e "  ${BLUE}ℹ️  INFO${NC}: $1"; }
_warn() { echo -e "  ${YELLOW}⚠️  WARN${NC}: $1"; }
_header() { echo -e "\n${BLUE}━━━ $1 ━━━${NC}"; }
_summary() {
  echo -e "\n${BLUE}═══════════════════════════════════════${NC}"
  if [ "\$FAILURES" -eq 0 ]; then
    echo -e "${GREEN}  ALL CHECKS PASSED ✅${NC}"
  else
    echo -e "${RED}  $FAILURES CHECK(S) FAILED ❌${NC}"
  fi
  echo -e "${BLUE}═══════════════════════════════════════${NC}"
  exit "\$FAILURES"
}

FAILURES=0

# Validate required environment variable
require_env() {
  local var_name="\$1"
  local var_value="\${!var_name:-}"
  if [ -z "\$var_value" ]; then
    _fail "Environment variable $var_name is not set"
    echo "  Set it: export $var_name=..."
    exit 1
  fi
}

# curl wrapper with timeout and JSON check
api_call() {
  local method="\$1"
  local url="\$2"
  local data="\${3:-}"
  local http_code_and_body

  if [ "\$method" = "POST" ]; then
    http_code_and_body=$(curl -s -w '\n%{http_code}' -X POST -H 'Content-Type: application/json' --data "\$data" --connect-timeout 10 --max-time 30 "\$url" 2>/dev/null)
  else
    http_code_and_body=$(curl -s -w '\n%{http_code}' --connect-timeout 10 --max-time 30 "\$url" 2>/dev/null)
  fi

  echo "\$http_code_and_body"
}
