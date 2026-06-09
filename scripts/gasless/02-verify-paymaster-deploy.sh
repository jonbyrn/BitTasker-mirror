#!/usr/bin/env bash
# 02-verify-paymaster-deploy.sh — Contract deployed, correct signer, correct EntryPoint
set -euo pipefail
source "$(dirname "$0")/_common.sh"

require_env ARBITRUM_RPC_URL
require_env PAYMASTER_ADDRESS
require_env PAYMASTER_SIGNER_ADDRESS
require_env ENTRY_POINT_ADDRESS

_header "02 — Paymaster Deployment Verification"

# 1. Paymaster contract has code
_info "Checking contract code at $PAYMASTER_ADDRESS ..."
RESULT=$(curl -s -X POST -H 'Content-Type: application/json' \
  --data "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getCode\",\"params\":[\"$PAYMASTER_ADDRESS\",\"latest\"],\"id\":1}" \
  --connect-timeout 10 --max-time 15 "$ARBITRUM_RPC_URL" 2>/dev/null)
CODE=$(echo "$RESULT" | grep -oP '"result":"(0x[0-9a-fA-F]+)"' | grep -oP '0x[0-9a-fA-F]+' || echo "0x")
if [ "$CODE" != "0x" ] && [ ${#CODE} -gt 10 ]; then
  _pass "Paymaster contract deployed (${#CODE} chars of bytecode)"
else
  _fail "No contract code at $PAYMASTER_ADDRESS"
  _summary
fi

# 2. Check verifyingSigner via eth_call (Coinbase contract has verifyingSigner() getter)
_info "Checking verifyingSigner ..."
SELECTOR=$(echo -n "verifyingSigner()" | sha256sum | cut -c1-8)
SIGNER_RESULT=$(curl -s -X POST -H 'Content-Type: application/json' \
  --data "{\"jsonrpc\":\"2.0\",\"method\":\"eth_call\",\"params\":[{\"to\":\"$PAYMASTER_ADDRESS\",\"data\":\"0x${SELECTOR}\"},\"latest\"],\"id\":2}" \
  --connect-timeout 10 --max-time 15 "$ARBITRUM_RPC_URL" 2>/dev/null)
SIGNER_ADDR=$(echo "$SIGNER_RESULT" | grep -oP '"result":"0x000000000000000000000000([0-9a-fA-F]{40})"' | grep -oP '[0-9a-fA-F]{40}$' || echo "")
if [ -n "$SIGNER_ADDR" ]; then
  SIGNER_LOWER=$(echo "$SIGNER_ADDR" | tr '[:upper:]' '[:lower:]')
  EXPECTED_LOWER=$(echo "$PAYMASTER_SIGNER_ADDRESS" | sed 's/^0x//' | tr '[:upper:]' '[:lower:]')
  if [ "$SIGNER_LOWER" = "$EXPECTED_LOWER" ]; then
    _pass "VerifyingSigner matches expected address ($PAYMASTER_SIGNER_ADDRESS)"
  else
    _fail "VerifyingSigner is 0x$SIGNER_ADDR, expected $PAYMASTER_SIGNER_ADDRESS"
  fi
else
  _warn "Could not parse verifyingSigner (contract may use different ABI)"
  _info "Raw response: $(echo "$SIGNER_RESULT" | head -c 200)"
fi

# 3. Check EntryPoint via eth_call (entryPoint() getter)
_info "Checking entryPoint ..."
EP_SELECTOR=$(echo -n "entryPoint()" | sha256sum | cut -c1-8)
EP_RESULT=$(curl -s -X POST -H 'Content-Type: application/json' \
  --data "{\"jsonrpc\":\"2.0\",\"method\":\"eth_call\",\"params\":[{\"to\":\"$PAYMASTER_ADDRESS\",\"data\":\"0x${EP_SELECTOR}\"},\"latest\"],\"id\":3}" \
  --connect-timeout 10 --max-time 15 "$ARBITRUM_RPC_URL" 2>/dev/null)
EP_ADDR=$(echo "$EP_RESULT" | grep -oP '"result":"0x000000000000000000000000([0-9a-fA-F]{40})"' | grep -oP '[0-9a-fA-F]{40}$' || echo "")
if [ -n "$EP_ADDR" ]; then
  EP_LOWER=$(echo "$EP_ADDR" | tr '[:upper:]' '[:lower:]')
  EXPECTED_EP_LOWER=$(echo "$ENTRY_POINT_ADDRESS" | sed 's/^0x//' | tr '[:upper:]' '[:lower:]')
  if [ "$EP_LOWER" = "$EXPECTED_EP_LOWER" ]; then
    _pass "EntryPoint matches v0.8 ($ENTRY_POINT_ADDRESS)"
  else
    _fail "EntryPoint is 0x$EP_ADDR, expected $ENTRY_POINT_ADDRESS"
  fi
else
  _warn "Could not parse entryPoint address (contract may use different ABI)"
fi

_summary
