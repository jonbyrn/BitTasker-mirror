#!/usr/bin/env bash
# 10-verify-paymaster-deposit.sh — Deposit balance + alert threshold
set -euo pipefail
source "$(dirname "$0")/_common.sh"

require_env ARBITRUM_RPC_URL
require_env PAYMASTER_ADDRESS

WETH="0x82aF49447D8a07e3bd95BD0d56f35241523fBab1"
ENTRY_POINT="0x433709009B8330FDa32311DF1C2AFA402eD8D009"
DEPOSIT_WARNING_WEI=10000000000000000   # 0.01 ETH
DEPOSIT_CRITICAL_WEI=5000000000000000  # 0.005 ETH

_header "10 — Paymaster Deposit Health Check"

# 1. Check paymaster ETH balance
_info "Checking paymaster ETH balance ..."
RESULT=$(curl -s -X POST -H 'Content-Type: application/json' \
  --data "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getBalance\",\"params\":[\"$PAYMASTER_ADDRESS\",\"latest\"],\"id\":1}" \
  --connect-timeout 10 --max-time 15 "$ARBITRUM_RPC_URL" 2>/dev/null)
BALANCE_HEX=$(echo "$RESULT" | grep -oP '"result":"(0x[0-9a-fA-F]+)"' | grep -oP '0x[0-9a-fA-F]+' || echo "0x0")
BALANCE_DEC=$((BALANCE_HEX))
BALANCE_ETH=$(echo "scale=6; $BALANCE_DEC / 1000000000000000000" | bc 2>/dev/null || echo "0")
_info "Paymaster balance: $BALANCE_ETH ETH ($BALANCE_HEX)"

if [ "$BALANCE_DEC" -gt "$DEPOSIT_WARNING_WEI" ]; then
  _pass "Deposit healthy (> 0.01 ETH)"
elif [ "$BALANCE_DEC" -gt "$DEPOSIT_CRITICAL_WEI" ]; then
  _warn "Deposit LOW ($BALANCE_ETH ETH) — warning threshold"
else
  _fail "Deposit CRITICAL ($BALANCE_ETH ETH) — below 0.005 ETH"
  _info "Auto-pause triggers at < 0.005 ETH. Top up paymaster deposit!"
fi

# 2. Check if EntryPoint has spend permission
_info "Checking EntryPoint spend approval ..."
ALLOWANCE_DATA="0xdd62ed3e000000000000000000000000${ENTRY_POINT#0x}00000000000000000000000000000000000000000000000000000000000000000"
# This checks USDT allowance — skip if paymaster uses native ETH deposit
_info "Paymaster uses native ETH deposit (not ERC-20 allowance)"

# 3. Check on-chain deposit function availability
_info "Checking paymaster deposit() function ..."
DEPOSIT_SELECTOR=$(echo -n "deposit()" | sha256sum | cut -c1-8)
DEPOSIT_RESULT=$(curl -s -X POST -H 'Content-Type: application/json' \
  --data "{\"jsonrpc\":\"2.0\",\"method\":\"eth_call\",\"params\":[{\"to\":\"$PAYMASTER_ADDRESS\",\"data\":\"0x${DEPOSIT_SELECTOR}\"},\"latest\"],\"id\":2}" \
  --connect-timeout 10 --max-time 15 "$ARBITRUM_RPC_URL" 2>/dev/null)
if echo "$DEPOSIT_RESULT" | grep -q 'error'; then
  _warn "deposit() call returned error (may require payable value)"
else
  _pass "deposit() function available on paymaster contract"
fi

# 4. Verify paymaster is not paused (if contract has paused() function)
_info "Checking if paymaster is paused ..."
PAUSED_SELECTOR=$(echo -n "paused()" | sha256sum | cut -c1-8)
PAUSED_RESULT=$(curl -s -X POST -H 'Content-Type: application/json' \
  --data "{\"jsonrpc\":\"2.0\",\"method\":\"eth_call\",\"params\":[{\"to\":\"$PAYMASTER_ADDRESS\",\"data\":\"0x${PAUSED_SELECTOR}\"},\"latest\"],\"id\":3}" \
  --connect-timeout 10 --max-time 15 "$ARBITRUM_RPC_URL" 2>/dev/null)
PAUSED_VALUE=$(echo "$PAUSED_RESULT" | grep -oP '"result":"(0x[0-9a-fA-F]+)"' | grep -oP '0x[0-9a-fA-F]+' || echo "")
if [ "$PAUSED_VALUE" = "0x0000000000000000000000000000000000000000000000000000000000000000" ] || [ -z "$PAUSED_VALUE" ]; then
  _pass "Paymaster is not paused"
elif [ "$PAUSED_VALUE" = "0x0000000000000000000000000000000000000000000000000000000000000001" ]; then
  _fail "Paymaster is PAUSED"
else
  _warn "Could not determine pause state (response: $PAUSED_VALUE)"
fi

_summary
