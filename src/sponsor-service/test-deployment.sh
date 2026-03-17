#!/bin/bash

##
## Deployment Test Script for Sponsor Service
## Tests both Docker and Cloudflare Workers deployments
## Usage: ./test-deployment.sh [docker|workers|both]
##

set -euo pipefail

# Configuration
DOCKER_URL="${DOCKER_URL:-http://localhost:3001}"
WORKERS_URL="${WORKERS_URL:-https://sponsor-service.workers.dev}"
TEST_CHAIN_ID=97  # BSC Testnet
TEST_CORRELATION_ID="test-$(date +%s%N)"
TEST_TX_HASH="0x$(openssl rand -hex 32)"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
print_test() {
  echo -e "${YELLOW}[TEST]${NC} $1"
  ((TESTS_RUN++))
}

pass_test() {
  echo -e "${GREEN}[PASS]${NC} $1"
  ((TESTS_PASSED++))
}

fail_test() {
  echo -e "${RED}[FAIL]${NC} $1"
  ((TESTS_FAILED++))
}

test_endpoint() {
  local name=$1
  local url=$2
  local method=${3:-GET}
  local data=${4:-}
  local expected_status=${5:-200}

  print_test "$name"

  if [ -z "$data" ]; then
    response=$(curl -s -w "\n%{http_code}" -X "$method" "$url" \
      -H "Content-Type: application/json")
  else
    response=$(curl -s -w "\n%{http_code}" -X "$method" "$url" \
      -H "Content-Type: application/json" \
      -d "$data")
  fi

  http_code=$(echo "$response" | tail -1)
  body=$(echo "$response" | head -n -1)

  if [ "$http_code" = "$expected_status" ]; then
    pass_test "$name (HTTP $http_code)"
    echo "$body"
    return 0
  else
    fail_test "$name (expected $expected_status, got $http_code)"
    echo "Response: $body"
    return 1
  fi
}

test_docker() {
  echo -e "\n${YELLOW}=== Testing Docker Deployment ===${NC}"

  # Health check
  test_endpoint "Docker Health Check" "$DOCKER_URL/health" "GET" "" 200

  # Submit request
  SUBMIT_DATA=$(cat <<EOF
{
  "correlationId": "$TEST_CORRELATION_ID",
  "signedRawTransaction": "0xf86a098085746a528230833a98408080b8441c2d0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f",
  "signedRawTransactionHash": "$TEST_TX_HASH",
  "chainId": $TEST_CHAIN_ID,
  "requestExpiry": $(date +%s)000
}
EOF
)

  test_endpoint "Docker Submit Direct Send" "$DOCKER_URL/v1/usdt-bsc/submit-send" "POST" "$SUBMIT_DATA" 202

  # Get status
  test_endpoint "Docker Get Status" "$DOCKER_URL/v1/usdt-bsc/status/$TEST_CORRELATION_ID" "GET" "" 200

  # Test 404
  test_endpoint "Docker 404 Handler" "$DOCKER_URL/nonexistent" "GET" "" 404
}

test_workers() {
  echo -e "\n${YELLOW}=== Testing Cloudflare Workers Deployment ===${NC}"

  # Health check
  test_endpoint "Workers Health Check" "$WORKERS_URL/health" "GET" "" 200

  # Submit request
  SUBMIT_DATA=$(cat <<EOF
{
  "correlationId": "$TEST_CORRELATION_ID-workers",
  "signedRawTransaction": "0xf86a098085746a528230833a98408080b8441c2d0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f",
  "signedRawTransactionHash": "0x$(openssl rand -hex 32)",
  "chainId": $TEST_CHAIN_ID,
  "requestExpiry": $(date +%s)000
}
EOF
)

  test_endpoint "Workers Submit Direct Send" "$WORKERS_URL/v1/usdt-bsc/submit-send" "POST" "$SUBMIT_DATA" 202

  # Get status
  test_endpoint "Workers Get Status" "$WORKERS_URL/v1/usdt-bsc/status/$TEST_CORRELATION_ID-workers" "GET" "" 200

  # Test 404
  test_endpoint "Workers 404 Handler" "$WORKERS_URL/nonexistent" "GET" "" 404
}

test_idempotency() {
  local url=$1
  local name=$2

  echo -e "\n${YELLOW}=== Testing Idempotency: $name ===${NC}"

  IDEMPOTENCY_TX="0x$(openssl rand -hex 32)"
  IDEMPOTENCY_ID="idempotent-$(date +%s%N)"

  IDEMPOTENCY_DATA=$(cat <<EOF
{
  "correlationId": "$IDEMPOTENCY_ID",
  "signedRawTransaction": "0xf86a098085746a528230833a98408080b8441c2d0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f",
  "signedRawTransactionHash": "$IDEMPOTENCY_TX",
  "chainId": $TEST_CHAIN_ID,
  "requestExpiry": $(date +%s)000
}
EOF
)

  print_test "Submit original request"
  response1=$(curl -s -X POST "$url/v1/usdt-bsc/submit-send" \
    -H "Content-Type: application/json" \
    -d "$IDEMPOTENCY_DATA")

  submission_id=$(echo "$response1" | jq -r '.submissionId // empty')

  if [ -n "$submission_id" ]; then
    pass_test "Original request accepted with ID: $submission_id"
  else
    fail_test "Original request failed"
    echo "$response1"
    return 1
  fi

  print_test "Submit duplicate request"
  response2=$(curl -s -X POST "$url/v1/usdt-bsc/submit-send" \
    -H "Content-Type: application/json" \
    -d "$IDEMPOTENCY_DATA")

  submission_id_2=$(echo "$response2" | jq -r '.submissionId // empty')

  if [ "$submission_id" = "$submission_id_2" ]; then
    pass_test "Duplicate request returned same submission ID"
  else
    fail_test "Duplicate request returned different ID"
    echo "First: $submission_id"
    echo "Second: $submission_id_2"
    return 1
  fi
}

test_rate_limiting() {
  local url=$1
  local name=$2

  echo -e "\n${YELLOW}=== Testing Rate Limiting: $name ===${NC}"

  print_test "Send rapid requests to trigger rate limit"

  local rate_limited=0
  for i in {1..60}; do
    response=$(curl -s -w "\n%{http_code}" -X POST "$url/v1/usdt-bsc/submit-send" \
      -H "Content-Type: application/json" \
      -d "{
        \"correlationId\": \"rate-limit-$i\",
        \"signedRawTransaction\": \"0xf86a...\",
        \"signedRawTransactionHash\": \"0x$(openssl rand -hex 32)\",
        \"chainId\": $TEST_CHAIN_ID,
        \"requestExpiry\": $(date +%s)000
      }")

    http_code=$(echo "$response" | tail -1)

    if [ "$http_code" = "429" ]; then
      rate_limited=1
      pass_test "Rate limit (429) triggered after $i requests"
      break
    fi
  done

  if [ $rate_limited -eq 0 ]; then
    echo -e "${YELLOW}[INFO]${NC} Rate limit not triggered in test window"
  fi
}

test_validation() {
  local url=$1
  local name=$2

  echo -e "\n${YELLOW}=== Testing Input Validation: $name ===${NC}"

  # Missing required field
  print_test "Missing signedRawTransaction"
  response=$(curl -s -w "\n%{http_code}" -X POST "$url/v1/usdt-bsc/submit-send" \
    -H "Content-Type: application/json" \
    -d "{
      \"correlationId\": \"validation-1\",
      \"signedRawTransactionHash\": \"0x...\",
      \"chainId\": 97,
      \"requestExpiry\": $(date +%s)000
    }")

  http_code=$(echo "$response" | tail -1)
  if [ "$http_code" = "400" ]; then
    pass_test "Properly rejected missing field with 400"
  else
    fail_test "Expected 400, got $http_code"
  fi

  # Invalid chain ID
  print_test "Invalid chain ID"
  response=$(curl -s -w "\n%{http_code}" -X POST "$url/v1/usdt-bsc/submit-send" \
    -H "Content-Type: application/json" \
    -d "{
      \"correlationId\": \"validation-2\",
      \"signedRawTransaction\": \"0xf86a...\",
      \"signedRawTransactionHash\": \"0x...\",
      \"chainId\": 999,
      \"requestExpiry\": $(date +%s)000
    }")

  http_code=$(echo "$response" | tail -1)
  if [ "$http_code" = "400" ]; then
    pass_test "Properly rejected invalid chain ID with 400"
  else
    fail_test "Expected 400, got $http_code"
  fi
}

test_comparison() {
  echo -e "\n${YELLOW}=== Comparing Deployments ===${NC}"

  print_test "Health check response format"
  docker_health=$(curl -s "$DOCKER_URL/health")
  workers_health=$(curl -s "$WORKERS_URL/health")

  docker_status=$(echo "$docker_health" | jq -r '.status // empty')
  workers_status=$(echo "$workers_health" | jq -r '.status // empty')

  if [ "$docker_status" = "ok" ] && [ "$workers_status" = "ok" ]; then
    pass_test "Both deployments return healthy status"
  else
    fail_test "Health check mismatch"
  fi
}

print_summary() {
  echo -e "\n${YELLOW}=== Test Summary ===${NC}"
  echo "Total Tests: $TESTS_RUN"
  echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
  echo -e "${RED}Failed: $TESTS_FAILED${NC}"

  local pass_rate=$((TESTS_PASSED * 100 / TESTS_RUN))
  echo "Success Rate: $pass_rate%"

  if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "\n${GREEN}✓ All tests passed!${NC}"
    return 0
  else
    echo -e "\n${RED}✗ Some tests failed${NC}"
    return 1
  fi
}

# Main test execution
main() {
  local test_type=${1:-both}

  echo -e "${YELLOW}Sponsor Service Deployment Testing${NC}"
  echo "Test Type: $test_type"
  echo "Timestamp: $(date)"

  case "$test_type" in
    docker)
      test_docker
      test_idempotency "$DOCKER_URL" "Docker"
      test_rate_limiting "$DOCKER_URL" "Docker"
      test_validation "$DOCKER_URL" "Docker"
      ;;
    workers)
      test_workers
      test_idempotency "$WORKERS_URL" "Workers"
      test_rate_limiting "$WORKERS_URL" "Workers"
      test_validation "$WORKERS_URL" "Workers"
      ;;
    both)
      test_docker
      test_workers
      test_idempotency "$DOCKER_URL" "Docker"
      test_idempotency "$WORKERS_URL" "Workers"
      test_validation "$DOCKER_URL" "Docker"
      test_validation "$WORKERS_URL" "Workers"
      test_comparison
      ;;
    *)
      echo "Unknown test type: $test_type"
      echo "Usage: $0 [docker|workers|both]"
      exit 1
      ;;
  esac

  print_summary
}

main "$@"
