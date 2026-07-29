#!/usr/bin/env bash
# verify-all.sh — Master script: runs all 10 verification scripts in dependency order
# Usage: bash scripts/gasless/verify-all.sh
# Required env vars: see individual scripts (ARBITRUM_RPC_URL, ALTO_URL, API_URL, etc.)
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TOTAL_FAILURES=0
PASSED=0
FAILED=0
SKIPPED=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║    Gasless CLI Verification Suite — All 10 Checks           ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo -e ""

echo -e "${BLUE}Required environment variables:${NC}"
echo "  ARBITRUM_RPC_URL=https://arb-sepolia.g.alchemy.com/v2/YOUR_KEY"
echo "  ALTO_URL=http://localhost:3000"
echo "  API_URL=http://localhost:4000"
echo "  PAYMASTER_ADDRESS=0xYOUR_CONTRACT"
echo "  PAYMASTER_SIGNER_ADDRESS=0xSIGNER"
echo "  ENTRY_POINT_ADDRESS=0x433709009B8330FDa32311DF1C2AFA402eD8D009"
echo "  TEST_JWT=eyJhbGciOi..."
echo "  TEST_PRIVATE_KEY=0xabc..."
echo "  TEST_EOA=0x123..."
echo "  RECIPIENT_ADDRESS=0xdef..."
echo -e ""

# Scripts in dependency order
# Phase 0: Infrastructure (must pass first)
SCRIPTS_0=(
  "01-verify-alto-health.sh"
  "02-verify-paymaster-deploy.sh"
)

# Phase 1: Backend verification
SCRIPTS_1=(
  "03-verify-paymaster-signing.sh"
  "04-verify-fee-estimation.sh"
  "05-verify-validation.sh"
)

# Phase 4: E2E verification
SCRIPTS_2=(
  "06-verify-send-usdt0.sh"
  "07-verify-send-wbtc.sh"
  "08-verify-send-tbtc.sh"
  "09-verify-escape-hatch.sh"
  "10-verify-paymaster-deposit.sh"
)

run_check() {
  local script="\$1"
  local phase="\$2"
  local path="$SCRIPT_DIR/$script"

  if [ ! -f "$path" ]; then
    echo -e "  ${YELLOW}⏭️  SKIP${NC}: $script (file not found)"
    SKIPPED=$((SKIPPED + 1))
    return 0
  fi

  echo -e "${BLUE}▶ Running: $script${NC}"

  # Run script and capture exit code
  local output
  local exit_code=0
  output=$(bash "$path" 2>&1) || exit_code=$?

  # Print output
  echo "$output" | sed 's/^/  /'

  if [ "$exit_code" -eq 0 ]; then
    echo -e "  ${GREEN}✅ $script PASSED${NC}"
    PASSED=$((PASSED + 1))
  else
    echo -e "  ${RED}❌ $script FAILED (exit code: $exit_code)${NC}"
    FAILED=$((FAILED + 1))
    TOTAL_FAILURES=$((TOTAL_FAILURES + exit_code))
  fi
  echo -e ""
}

# Phase 0: Infrastructure
echo -e "${BLUE}━━━ Phase 0: Infrastructure ━━━${NC}"
for script in "${SCRIPTS_0[@]}"; do
  run_check "$script" "Phase 0"
done

# Check if Phase 0 passed — if not, skip dependent phases
if [ "$FAILED" -gt 0 ]; then
  echo -e "${RED}Phase 0 had failures. Skipping dependent phases.${NC}"
  SKIPPED=$((SKIPPED + ${#SCRIPTS_1[@]} + ${#SCRIPTS_2[@]}))
else
  # Phase 1: Backend
  echo -e "${BLUE}━━━ Phase 1: Backend Verification ━━━${NC}"
  for script in "${SCRIPTS_1[@]}"; do
    run_check "$script" "Phase 1"
  done

  if [ "$FAILED" -gt 0 ]; then
    echo -e "${RED}Phase 1 had failures. Skipping E2E phases.${NC}"
    SKIPPED=$((SKIPPED + ${#SCRIPTS_2[@]}))
  else
    # Phase 4: E2E
    echo -e "${BLUE}━━━ Phase 4: E2E Verification ━━━${NC}"
    for script in "${SCRIPTS_2[@]}"; do
      run_check "$script" "Phase 4"
    done
  fi
fi

# Final summary
echo -e ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                    VERIFICATION SUMMARY                     ║${NC}"
echo -e "${BLUE}╠══════════════════════════════════════════════════════════════╣${NC}"
echo -e "${BLUE}║${NC}  ${GREEN}Passed:${NC}  $PASSED  ${YELLOW}Skipped:${NC}  $SKIPPED  ${RED}Failed:${NC}  $FAILED                    ${BLUE}║${NC}"
echo -e "${BLUE}╠══════════════════════════════════════════════════════════════╣${NC}"

if [ "$FAILED" -eq 0 ]; then
  echo -e "${BLUE}║${NC}  ${GREEN}ALL CHECKS PASSED ✅ — UI work may begin${NC}                   ${BLUE}║${NC}"
else
  echo -e "${BLUE}║${NC}  ${RED}$FAILED CHECK(S) FAILED ❌ — Fix before proceeding${NC}            ${BLUE}║${NC}"
fi

echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"

exit "$FAILED"
