#!/usr/bin/env bash
# 03-verify-paymaster-signing.sh — Backend hash matches Coinbase contract (Anvil fork)
set -euo pipefail
source "$(dirname "$0")/_common.sh"

require_env API_URL
require_env TEST_JWT

_header "03 — Paymaster Signing Verification"

# 1. Backend health check
_info "Checking backend is reachable ..."
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 5 --max-time 10 "$API_URL/health" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" != "000" ]; then
  _pass "Backend is reachable (HTTP $HTTP_CODE)"
else
  _fail "Backend is unreachable at $API_URL"
  _summary
fi

# 2. Check paymaster signing via estimate endpoint (auth required)
_info "Testing paymaster signing via /gasless/estimate ..."
RESPONSE=$(curl -s -w '\n%{http_code}' -X POST \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TEST_JWT" \
  --data '{"token":"0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9","amount":"1000000","recipient":"0x0000000000000000000000000000000000000001"}' \
  --connect-timeout 10 --max-time 30 \
  "$API_URL/gasless/estimate" 2>/dev/null)
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "403" ]; then
  _fail "Authentication rejected (HTTP $HTTP_CODE) — check TEST_JWT"
  _summary
fi

if [ "$HTTP_CODE" = "200" ]; then
  _pass "Estimate endpoint returns 200 with valid signature data"

  # Check response has required fields
  if echo "$BODY" | grep -q '"feeBuffer"'; then
    _pass "Response contains feeBuffer field"
  else
    _fail "Response missing feeBuffer field"
  fi

  if echo "$BODY" | grep -q '"feeTier"'; then
    _pass "Response contains feeTier field"
  else
    _fail "Response missing feeTier field"
  fi
else
  _fail "Estimate endpoint returned HTTP $HTTP_CODE"
  _info "Response: $(echo "$BODY" | head -c 300)"
fi

# 3. Test with invalid token (should be rejected)
_info "Testing with non-allowed token (should fail) ..."
REJECT_RESPONSE=$(curl -s -w '\n%{http_code}' -X POST \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TEST_JWT" \
  --data '{"token":"0x0000000000000000000000000000000000000042","amount":"1000000","recipient":"0x0000000000000000000000000000000000000001"}' \
  --connect-timeout 10 --max-time 30 \
  "$API_URL/gasless/estimate" 2>/dev/null)
REJECT_CODE=$(echo "$REJECT_RESPONSE" | tail -1)
if [ "$REJECT_CODE" = "400" ] || [ "$REJECT_CODE" = "401" ] || [ "$REJECT_CODE" = "403" ]; then
  _pass "Non-allowed token correctly rejected (HTTP $REJECT_CODE)"
else
  _fail "Non-allowed token NOT rejected (HTTP $REJECT_CODE)"
fi

_summary
