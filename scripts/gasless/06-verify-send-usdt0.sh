#!/usr/bin/env bash
# 06-verify-send-usdt0.sh — Full E2E send of USDT0 on Arbitrum Sepolia
set -euo pipefail
source "$(dirname "$0")/_common.sh"

require_env ARBITRUM_RPC_URL
require_env ALTO_URL
require_env API_URL
require_env PAYMASTER_ADDRESS
require_env TEST_JWT
require_env TEST_PRIVATE_KEY
require_env TEST_EOA
require_env RECIPIENT_ADDRESS

USDT0="0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AMOUNT="1000000" # 1 USDT0 (6 decimals)

_header "06 — E2E Send USDT0"

# 1. Get fee estimate
_info "Requesting fee estimate ..."
ESTIMATE_RESP=$(curl -s -X POST \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TEST_JWT" \
  --data "{\"token\":\"$USDT0\",\"amount\":\"$AMOUNT\",\"recipient\":\"$RECIPIENT_ADDRESS\"}" \
  --connect-timeout 10 --max-time 30 \
  "$API_URL/gasless/estimate" 2>/dev/null)

if echo "$ESTIMATE_RESP" | grep -q '"feeBuffer"'; then
  FEE_BUF=$(echo "$ESTIMATE_RESP" | grep -oP '"feeBuffer":"([^"]+)"' | grep -oP ':"([^"]+)"' | tr -d ':")' || echo "")
  _pass "Fee estimate received (feeBuffer=$FEE_BUF)"
else
  _fail "Failed to get fee estimate"
  _info "Response: $(echo "$ESTIMATE_RESP" | head -c 300)"
  _summary
fi

# 2. Build and sign UserOp using helper
_info "Building and signing UserOp ..."
if [ -f "$SCRIPT_DIR/build-and-sign-userop.mjs" ]; then
  USEROP_JSON=$(node "$SCRIPT_DIR/build-and-sign-userop.mjs" \
    --token "$USDT0" \
    --amount "$AMOUNT" \
    --recipient "$RECIPIENT_ADDRESS" \
    --fee-buffer "$FEE_BUF" \
    --private-key "$TEST_PRIVATE_KEY" \
    --rpc-url "$ARBITRUM_RPC_URL" \
    --paymaster "$PAYMASTER_ADDRESS" 2>&1)

  if [ $? -eq 0 ] && echo "$USEROP_JSON" | grep -q '"callData"'; then
    _pass "UserOp built and signed successfully"
  else
    _fail "Failed to build/sign UserOp"
    _info "Output: $(echo "$USEROP_JSON" | head -c 300)"
    _summary
  fi
else
  _fail "build-and-sign-userop.mjs not found at $SCRIPT_DIR"
  _summary
fi

# 3. Relay UserOp
_info "Relaying UserOp to backend ..."
RELAY_RESP=$(curl -s -w '\n%{http_code}' -X POST \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TEST_JWT" \
  --data "$USEROP_JSON" \
  --connect-timeout 10 --max-time 30 \
  "$API_URL/gasless/relay" 2>/dev/null)

RELAY_CODE=$(echo "$RELAY_RESP" | tail -1)
RELAY_BODY=$(echo "$RELAY_RESP" | sed '$d')

if [ "$RELAY_CODE" = "200" ] || [ "$RELAY_CODE" = "201" ]; then
  _pass "UserOp relayed successfully (HTTP $RELAY_CODE)"
  USEROP_HASH=$(echo "$RELAY_BODY" | grep -oP '"userOpHash":"([^"]+)"' | grep -oP ':[^"]*"([^"]+)"' | tr -d ':")' || echo "")
  _info "  userOpHash=$USEROP_HASH"
else
  _fail "UserOp relay failed (HTTP $RELAY_CODE)"
  _info "Body: $(echo "$RELAY_BODY" | head -c 300)"
  _summary
fi

# 4. Poll for receipt
_info "Polling for receipt ..."
if [ -n "$USEROP_HASH" ] && [ -f "$SCRIPT_DIR/receipt-polling.mjs" ]; then
  RECEIPT=$(node "$SCRIPT_DIR/receipt-polling.mjs" \
    --hash "$USEROP_HASH" \
    --rpc-url "$ARBITRUM_RPC_URL" \
    --timeout 120 2>&1)

  if echo "$RECEIPT" | grep -qi 'success\|confirmed'; then
    _pass "Transaction confirmed on-chain"
    _info "  Receipt: $(echo "$RECEIPT" | head -c 200)"
  else
    _fail "Transaction not confirmed within timeout"
    _info "  Output: $(echo "$RECEIPT" | head -c 300)"
  fi
else
  _warn "Skipping receipt poll (missing hash or helper)"
fi

_summary
