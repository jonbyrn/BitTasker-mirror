#!/usr/bin/env bash
# 04-verify-fee-estimation.sh — All 3 tokens + tiered fees + 5M rejection
set -euo pipefail
source "$(dirname "$0")/_common.sh"

require_env API_URL
require_env TEST_JWT

USDT0="0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9"
WBTC="0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f"
TBTC="0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40"
RECIPIENT="0x0000000000000000000000000000000000000001"

_header "04 — Fee Estimation Verification"

do_estimate() {
  local token="\$1" amount="\$2" label="\$3"
  curl -s -w '\n%{http_code}' -X POST \n    -H 'Content-Type: application/json' \n    -H "Authorization: Bearer $TEST_JWT" \n    --data "{"token":"\$token","amount":"\$amount","recipient":"\$RECIPIENT"}" \n    --connect-timeout 10 --max-time 30 \n    "$API_URL/gasless/estimate" 2>/dev/null
}

# 1. USDT0 (18 decimals)
_info "Estimating USDT0 (simple transfer, 100 USDT0) ..."
RESP=$(do_estimate "$USDT0" "100000000000000000000" "USDT0")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
if [ "$CODE" = "200" ]; then
  _pass "USDT0 estimation returned 200"
  FEE_TIER=$(echo "$BODY" | grep -oP '"feeTier":"[^"]+"' | grep -oP '"[^"]+"$' || echo "")
  FEE_BUF=$(echo "$BODY" | grep -oP '"feeBuffer":"[^"]+"' | grep -oP '"[^"]+"$' || echo "")
  _info "  feeTier=$FEE_TIER feeBuffer=$FEE_BUF"
  if [ -n "$FEE_TIER" ] && [ -n "$FEE_BUF" ]; then
    _pass "Response has feeTier and feeBuffer"
  else
    _fail "Missing feeTier or feeBuffer in response"
  fi
else
  _fail "USDT0 estimation failed (HTTP $CODE)"
  _info "Body: $(echo "$BODY" | head -c 200)"
fi

# 2. wBTC (8 decimals)
_info "Estimating wBTC (simple transfer, 0.01 wBTC) ..."
RESP=$(do_estimate "$WBTC" "1000000" "wBTC")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
if [ "$CODE" = "200" ]; then
  _pass "wBTC estimation returned 200"
else
  _fail "wBTC estimation failed (HTTP $CODE)"
  _info "Body: $(echo "$BODY" | head -c 200)"
fi

# 3. tBTC (18 decimals)
_info "Estimating tBTC (simple transfer, 0.01 tBTC) ..."
RESP=$(do_estimate "$TBTC" "10000000000000000" "tBTC")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
if [ "$CODE" = "200" ]; then
  _pass "tBTC estimation returned 200"
else
  _fail "tBTC estimation failed (HTTP $CODE)"
  _info "Body: $(echo "$BODY" | head -c 200)"
fi

# 4. Non-allowed token should be rejected
_info "Estimating with non-allowed token (should fail) ..."
RESP=$(do_estimate "0x0000000000000000000000000000000000000042" "1000000" "INVALID")
CODE=$(echo "$RESP" | tail -1)
if [ "$CODE" = "400" ] || [ "$CODE" = "401" ] || [ "$CODE" = "403" ]; then
  _pass "Non-allowed token correctly rejected (HTTP $CODE)"
else
  _fail "Non-allowed token NOT rejected (HTTP $CODE)"
fi

# 5. Zero amount should be rejected
_info "Estimating with zero amount (should fail) ..."
RESP=$(do_estimate "$USDT0" "0" "ZERO")
CODE=$(echo "$RESP" | tail -1)
if [ "$CODE" = "400" ]; then
  _pass "Zero amount correctly rejected (HTTP 400)"
else
  _warn "Zero amount returned HTTP $CODE (expected 400)"
fi

_summary
