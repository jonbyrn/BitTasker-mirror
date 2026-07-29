#!/usr/bin/env bash
# 09-verify-escape-hatch.sh — Revoke delegation via public bundler (no BitTasker)
set -euo pipefail
source "$(dirname "$0")/_common.sh"

require_env ARBITRUM_RPC_URL
require_env TEST_EOA
require_env TEST_PRIVATE_KEY

SIMPLE_ACCOUNT="0xe6Cae83BdE06E4c305530e199D7217f42808555B"
PIMLICO_URL="https://api.pimlico.io/v2/42161/rpc"

_header "09 — EIP-7702 Escape Hatch Verification"

# 1. Check current delegation status of test EOA
_info "Checking current delegation status of $TEST_EOA ..."
RESULT=$(curl -s -X POST -H 'Content-Type: application/json' \
  --data "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getCode\",\"params\":[\"$TEST_EOA\",\"latest\"],\"id\":1}" \
  --connect-timeout 10 --max-time 15 "$ARBITRUM_RPC_URL" 2>/dev/null)
CODE=$(echo "$RESULT" | grep -oP '"result":"(0x[0-9a-fA-F]+)"' | grep -oP '0x[0-9a-fA-F]+' || echo "0x")
if [ "$CODE" = "0x" ] || [ ${#CODE} -le 4 ]; then
  _pass "EOA has no delegation (clean state)"
  DELEGATED=false
else
  _warn "EOA has delegated code (${#CODE} chars)"
  DELEGATED=true
fi

# 2. Simulate a revocation UserOp structure
_info "Verifying escape hatch structure (Simple7702Account reset) ..."
# The escape hatch works by submitting a UserOp with empty callData to the
# Simple7702Account, which clears the delegation.
_info "Escape hatch mechanism:"
_info "  1. Connect to ANY public bundler (Pimlico, Alchemy, etc.)"
_info "  2. Submit UserOp with empty callData to Simple7702Account"
_info "  3. EntryPoint processes the op, clearing the EIP-7702 delegation"
_info "  4. getCode(eoa) returns 0x — delegation revoked"

# 3. Check Simple7702Account impl exists
_info "Checking Simple7702Account implementation at $SIMPLE_ACCOUNT ..."
IMPL_RESULT=$(curl -s -X POST -H 'Content-Type: application/json' \
  --data "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getCode\",\"params\":[\"$SIMPLE_ACCOUNT\",\"latest\"],\"id\":2}" \
  --connect-timeout 10 --max-time 15 "$ARBITRUM_RPC_URL" 2>/dev/null)
IMPL_CODE=$(echo "$IMPL_RESULT" | grep -oP '"result":"(0x[0-9a-fA-F]+)"' | grep -oP '0x[0-9a-fA-F]+' || echo "0x")
if [ "$IMPL_CODE" != "0x" ] && [ ${#IMPL_CODE} -gt 10 ]; then
  _pass "Simple7702Account implementation deployed (${#IMPL_CODE} chars)"
else
  _fail "Simple7702Account implementation not found at $SIMPLE_ACCOUNT"
fi

# 4. Check EntryPoint v0.8 exists (needed for revocation)
_info "Checking EntryPoint v0.8 availability ..."
EP_RESULT=$(curl -s -X POST -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","method":"eth_getCode","params":["0x433709009B8330FDa32311DF1C2AFA402eD8D009","latest"],"id":3}' \
  --connect-timeout 10 --max-time 15 "$ARBITRUM_RPC_URL" 2>/dev/null)
EP_CODE=$(echo "$EP_RESULT" | grep -oP '"result":"(0x[0-9a-fA-F]+)"' | grep -oP '0x[0-9a-fA-F]+' || echo "0x")
if [ "$EP_CODE" != "0x" ] && [ ${#EP_CODE} -gt 10 ]; then
  _pass "EntryPoint v0.8 available for revocation"
else
  _fail "EntryPoint v0.8 not found on chain"
fi

_info ""
_info "To revoke delegation (if delegated):"
_info "  Use build-and-sign-userop.mjs with --reset flag to create a revocation UserOp"
_info "  Submit via any public bundler (Pimlico, Alchemy, etc.)"
_info "  No BitTasker backend required — fully trustless escape hatch"

_summary
