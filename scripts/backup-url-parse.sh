#!/usr/bin/env bash
# Shared PostgreSQL URL parsing for backup-databases.sh and its tests.
set -euo pipefail

urldecode() {
  python3 -c 'import sys, urllib.parse; print(urllib.parse.unquote(sys.argv[1]))' "$1"
}

# Parse postgresql:// URIs where the password may contain '@'.
# Sets PARSED_USER, PARSED_PASSWORD, PARSED_HOST, PARSED_PORT, PARSED_DBNAME, PARSED_PARAMS.
parse_database_url() {
  local url="$1"
  local rest userinfo

  if [[ ! "$url" =~ ^postgres(ql)?://(.+)$ ]]; then
    echo "ERROR: Invalid PostgreSQL URL (expected postgresql://…)" >&2
    return 1
  fi

  rest="${BASH_REMATCH[2]}"
  PARSED_PARAMS=""
  if [[ "$rest" == *'?'* ]]; then
    PARSED_PARAMS="${rest#*\?}"
    rest="${rest%%\?*}"
  fi

  PARSED_DBNAME=""
  if [[ "$rest" == */* ]]; then
    PARSED_DBNAME="${rest##*/}"
    rest="${rest%/*}"
  fi

  # Anchor on the last @host:port — password may contain '@'.
  if [[ ! "$rest" =~ ^(.+)@([^@/]+:([0-9]+))$ ]]; then
    echo "ERROR: Could not locate host:port in PostgreSQL URL" >&2
    return 1
  fi

  userinfo="${BASH_REMATCH[1]}"
  PARSED_HOST="${BASH_REMATCH[2]%%:*}"
  PARSED_PORT="${BASH_REMATCH[3]}"

  if [[ "$userinfo" != *:* ]]; then
    PARSED_USER="$userinfo"
    PARSED_PASSWORD=""
  else
    PARSED_USER="${userinfo%%:*}"
    PARSED_PASSWORD="$(urldecode "${userinfo#*:}")"
  fi
}

build_conninfo() {
  local conninfo="host=${PARSED_HOST} port=${PARSED_PORT} user=${PARSED_USER} dbname=${PARSED_DBNAME}"
  local pair

  if [ -n "$PARSED_PARAMS" ]; then
    local IFS='&'
    for pair in $PARSED_PARAMS; do
      [ -n "$pair" ] && conninfo+=" ${pair}"
    done
  fi

  printf '%s' "$conninfo"
}

format_connection_target() {
  printf 'postgresql://%s:***@%s:%s/%s' "$PARSED_USER" "$PARSED_HOST" "$PARSED_PORT" "$PARSED_DBNAME"
  if [ -n "$PARSED_PARAMS" ]; then
    printf '?%s' "$PARSED_PARAMS"
  fi
}

prepare_pg_connection() {
  local database_url="$1"

  if ! parse_database_url "$database_url"; then
    return 1
  fi

  RESOLVED_CONNINFO="$(build_conninfo)"
  RESOLVED_PASSWORD="$PARSED_PASSWORD"
  RESOLVED_TARGET="$(format_connection_target)"
}
