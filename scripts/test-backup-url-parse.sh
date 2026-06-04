#!/usr/bin/env bash
# Unit tests for PostgreSQL URL parsing used by backup-databases.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck disable=SC1091
source "${SCRIPT_DIR}/backup-url-parse.sh"

assert_eq() {
  local label="$1"
  local expected="$2"
  local actual="$3"
  if [ "$expected" != "$actual" ]; then
    echo "FAIL: $label" >&2
    echo "  expected: $expected" >&2
    echo "  actual:   $actual" >&2
    exit 1
  fi
  echo "OK: $label"
}

BASE_PARAMS='sslmode=require&connect_timeout=60&keepalives=1&keepalives_idle=30&keepalives_interval=10&keepalives_count=5&tcp_user_timeout=30000'

# Reproduces the CI failure: password contains '@Rs4Z'
URL="postgresql://backup_user:abc@Rs4Z@ballast.proxy.rlwy.net:20476/railway?${BASE_PARAMS}"
prepare_pg_connection "$URL"
assert_eq "password with @" "$PARSED_PASSWORD" "abc@Rs4Z"
assert_eq "host" "$PARSED_HOST" "ballast.proxy.rlwy.net"
assert_eq "port" "$PARSED_PORT" "20476"
assert_eq "user" "$PARSED_USER" "backup_user"
assert_eq "dbname" "$PARSED_DBNAME" "railway"
assert_eq "target display" "$RESOLVED_TARGET" "postgresql://backup_user:***@ballast.proxy.rlwy.net:20476/railway?${BASE_PARAMS}"

# Percent-encoded password in URL
URL="postgresql://backup_user:abc%40Rs4Z@ballast.proxy.rlwy.net:15257/railway?${BASE_PARAMS}"
prepare_pg_connection "$URL"
assert_eq "percent-encoded password" "$PARSED_PASSWORD" "abc@Rs4Z"
assert_eq "encoded host port" "$PARSED_PORT" "15257"

# Password with dollar sign (GitLab expansion regression shape)
URL='postgresql://backup_user:abc$VAR@ballast.proxy.rlwy.net:53634/railway?'"${BASE_PARAMS}"
prepare_pg_connection "$URL"
assert_eq "password with dollar" "$PARSED_PASSWORD" 'abc$VAR'

echo ""
echo "All URL parse tests passed."
