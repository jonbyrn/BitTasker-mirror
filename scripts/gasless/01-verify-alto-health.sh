#!/usr/bin/env bash
# 01-verify-alto-health.sh — Alto bundler health + EntryPoint v0.8 support
set -euo pipefail
source "$(dirname "$0")/_common.sh"

require_env ALTO_URL
require_env ENTRY_POINT_ADDRESS

_header "01 — Alto Bundler Health Check"

# 1. Alto is responding
_info "Checking Alto is reachable at $ALTO_URL ..."
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 5 --max-time 10 "$ALTO_URL" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" != "000" ]; then
  _pass "Alto is reachable (HTTP $HTTP_CODE)"
else
  _fail "Alto is unreachable at $ALTO_URL"
  _summary
fi

# 2. eth_supportedEntryPoints returns v0.8
_info "Checking supported entry points ..."
RESPONSE=$(curl -s -X POST -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","method":"eth_supportedEntryPoints","params":[],"id":1}' \
  --connect-timeout 10 --max-time 15 "$ALTO_URL" 2>/dev/null)

if echo "$RESPONSE" | grep -qi 'error'; then
  _fail "Alto returned an error: $(echo "$RESPONSE" | head -c 200)"
  _summary
fi

if echo "$RESPONSE" | grep -qi "$ENTRY_POINT_ADDRESS"; then
  _pass "EntryPoint v0.8 ($ENTRY_POINT_ADDRESS) is supported"
else
  _fail "EntryPoint v0.8 ($ENTRY_POINT_ADDRESS) NOT found in supported list"
  _info "Response: $(echo "$RESPONSE" | head -c 300)"
fi

# 3. eth_chainId matches target chain
_info "Checking chain ID ..."
CHAIN_RESPONSE=$(curl -s -X POST -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":2}' \
  --connect-timeout 10 --max-time 15 "$ALTO_URL" 2>/dev/null)

CHAIN_ID=$(echo "$CHAIN_RESPONSE" | grep -oP '"result":"0x[0-9a-fA-F]+"' | grep -oP '0x[0-9a-fA-F]+' || echo "")
if [ -n "$CHAIN_ID" ]; then
  CHAIN_ID_DEC=$((CHAIN_ID))
  if [ "$CHAIN_ID_DEC" -eq 42161 ] || [ "$CHAIN_ID_DEC" -eq 421614 ]; then
    _pass "Chain ID is $CHAIN_ID_DEC (Arbitrum One/Sepolia)"
  else
    _fail "Chain ID is $CHAIN_ID_DEC, expected 42161 or 421614"
  fi
else
  _fail "Could not parse chain ID from response"
fi

_summary
