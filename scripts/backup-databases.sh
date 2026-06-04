#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# BitTasker — PostgreSQL backup to Cloudflare R2
# ─────────────────────────────────────────────────────────────────────────────
# Runs pg_dump for all three Railway PostgreSQL databases and uploads
# compressed custom-format dumps to Cloudflare R2.
#
# Required environment variables (set as GitLab CI variables):
#   CLOUDFLARE_ACCOUNT_ID
#   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
#   DATABASE_URL_API, DATABASE_URL_RELAY_TASKS, DATABASE_URL_RELAY_GENERAL
#     Full postgresql:// URIs (Railway public TCP proxy). Passwords may contain
#     @ or $ — the script parses the URL and passes the password via PGPASSWORD.
#   RETENTION_TYPE — "daily", "weekly", or "monthly" (set by GitLab schedule)
#
# Optional:
#   BACKUP_VERIFY_ONLY=1 — parse URLs and test connections only (no dump/upload)
#   PG_DUMP_MAX_ATTEMPTS — default 3
#   PG_DUMP_RETRY_DELAY_SECONDS — initial backoff, default 30 (doubles each retry)
#   PGOPTIONS — default "-c statement_timeout=0" for long dumps
#
# Usage:
#   RETENTION_TYPE=daily bash scripts/backup-databases.sh
#   BACKUP_VERIFY_ONLY=1 RETENTION_TYPE=daily bash scripts/backup-databases.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Validate required variables ─────────────────────────────────────────────
REQUIRED_VARS=(
  CLOUDFLARE_ACCOUNT_ID
  R2_ACCESS_KEY_ID
  R2_SECRET_ACCESS_KEY
  R2_BUCKET
  DATABASE_URL_API
  DATABASE_URL_RELAY_TASKS
  DATABASE_URL_RELAY_GENERAL
  RETENTION_TYPE
)
MISSING=()
for VAR in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!VAR:-}" ]; then
    MISSING+=("$VAR")
  fi
done
if [ ${#MISSING[@]} -gt 0 ]; then
  echo "ERROR: Missing required environment variables: ${MISSING[*]}" >&2
  exit 1
fi

# ── Validate RETENTION_TYPE ─────────────────────────────────────────────────
case "$RETENTION_TYPE" in
  daily|weekly|monthly) ;;
  *)
    echo "ERROR: RETENTION_TYPE must be 'daily', 'weekly', or 'monthly' (got '$RETENTION_TYPE')" >&2
    exit 1
    ;;
esac

# ── Derived values ──────────────────────────────────────────────────────────
R2_ENDPOINT="https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com"
TIMESTAMP=$(date -u +%Y%m%d_%H%M%S)
export AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}"
export PGOPTIONS="${PGOPTIONS:--c statement_timeout=0}"

PG_DUMP_MAX_ATTEMPTS="${PG_DUMP_MAX_ATTEMPTS:-3}"
PG_DUMP_RETRY_DELAY_SECONDS="${PG_DUMP_RETRY_DELAY_SECONDS:-30}"
BACKUP_VERIFY_ONLY="${BACKUP_VERIFY_ONLY:-0}"

# Format: "label|url_variable_name"
DATABASES=(
  "api|DATABASE_URL_API"
  "relay_tasks|DATABASE_URL_RELAY_TASKS"
  "relay_general|DATABASE_URL_RELAY_GENERAL"
)

# ── Helpers ─────────────────────────────────────────────────────────────────
# shellcheck source=scripts/backup-url-parse.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/backup-url-parse.sh"

run_pg_dump_with_retry() {
  local conninfo="$1"
  local password="$2"
  local temp_file="$3"
  local attempt=1
  local delay="$PG_DUMP_RETRY_DELAY_SECONDS"

  while true; do
    echo "  pg_dump attempt ${attempt}/${PG_DUMP_MAX_ATTEMPTS}…"
    if PGPASSWORD="$password" pg_dump \
      --verbose \
      -d "$conninfo" \
      --format=custom \
      --compress=9 \
      --no-owner \
      --no-acl \
      --file="${temp_file}" \
      2>&1; then
      return 0
    fi

    rm -f "${temp_file}"

    if [ "$attempt" -ge "$PG_DUMP_MAX_ATTEMPTS" ]; then
      echo "  ERROR: pg_dump failed after ${PG_DUMP_MAX_ATTEMPTS} attempts" >&2
      return 1
    fi

    echo "  pg_dump failed; waiting ${delay}s before retry…" >&2
    sleep "$delay"
    attempt=$((attempt + 1))
    delay=$((delay * 2))
  done
}

verify_pg_connection() {
  local conninfo="$1"
  local password="$2"

  echo "  Testing connection (SELECT 1)…"
  if PGPASSWORD="$password" psql -d "$conninfo" -v ON_ERROR_STOP=1 -tAc 'SELECT 1' >/dev/null 2>&1; then
    echo "  Connection OK"
    return 0
  fi

  echo "  ERROR: Connection failed" >&2
  return 1
}

# ── Ensure required tools are available ───────────────────────────────────────
if [ "$BACKUP_VERIFY_ONLY" != "1" ] && ! command -v aws &>/dev/null; then
  echo "ERROR: aws CLI is required. Install with: pip install awscli" >&2
  exit 1
fi

if ! command -v python3 &>/dev/null; then
  echo "ERROR: python3 is required for URL parsing" >&2
  exit 1
fi

# ── Main backup loop ────────────────────────────────────────────────────────
FAILED=()
SUCCESS=0
TOTAL=${#DATABASES[@]}

if [ "$BACKUP_VERIFY_ONLY" = "1" ]; then
  echo "=== BitTasker Database Backup VERIFY — $TIMESTAMP ==="
else
  echo "=== BitTasker Database Backup ($RETENTION_TYPE) — $TIMESTAMP ==="
fi
echo ""

for DB_DEF in "${DATABASES[@]}"; do
  IFS='|' read -r LABEL URL_VAR <<< "$DB_DEF"
  DATABASE_URL="${!URL_VAR}"

  if ! prepare_pg_connection "$DATABASE_URL"; then
    FAILED+=("${LABEL} (parse)")
    echo ""
    continue
  fi

  if [ "$BACKUP_VERIFY_ONLY" = "1" ]; then
    echo "── Verifying: $LABEL ($RESOLVED_TARGET) ──"
  else
    echo "── Backing up: $LABEL ($RESOLVED_TARGET) ──"
  fi

  if [ "$BACKUP_VERIFY_ONLY" = "1" ]; then
    if verify_pg_connection "$RESOLVED_CONNINFO" "$RESOLVED_PASSWORD"; then
      SUCCESS=$((SUCCESS + 1))
    else
      FAILED+=("${LABEL} (connection)")
    fi
    echo ""
    continue
  fi

  FILENAME="${TIMESTAMP}_${LABEL}.dump"
  TEMP_FILE="/tmp/${FILENAME}"

  if run_pg_dump_with_retry "$RESOLVED_CONNINFO" "$RESOLVED_PASSWORD" "$TEMP_FILE"; then
    DUMP_SIZE=$(stat -f%z "${TEMP_FILE}" 2>/dev/null || stat -c%s "${TEMP_FILE}" 2>/dev/null || echo 0)
    echo "  pg_dump OK — ${DUMP_SIZE} bytes ($(( DUMP_SIZE / 1024 / 1024 )) MB)"

    echo "  Uploading to R2: ${RETENTION_TYPE}/${LABEL}/${FILENAME}"
    UPLOAD_OK=false
    for upload_attempt in 1 2; do
      if aws s3 cp "${TEMP_FILE}" \
        "s3://${R2_BUCKET}/${RETENTION_TYPE}/${LABEL}/${FILENAME}" \
        --endpoint-url "${R2_ENDPOINT}" \
        --only-show-errors; then
        UPLOAD_OK=true
        break
      fi
      if [ "$upload_attempt" -lt 2 ]; then
        echo "  Upload failed; retrying in 10s…" >&2
        sleep 10
      fi
    done
    if [ "$UPLOAD_OK" = true ]; then
      echo "  Upload OK"
      SUCCESS=$((SUCCESS + 1))
    else
      echo "  ERROR: Upload failed for $LABEL" >&2
      FAILED+=("${LABEL} (upload)")
    fi

    rm -f "${TEMP_FILE}"
  else
    FAILED+=("${LABEL} (pg_dump)")
    rm -f "${TEMP_FILE}"
  fi

  echo ""
done

# ── Summary ─────────────────────────────────────────────────────────────────
if [ "$BACKUP_VERIFY_ONLY" = "1" ]; then
  echo "=== Verify Summary: ${SUCCESS}/${TOTAL} connections OK ==="
else
  echo "=== Backup Summary: ${SUCCESS}/${TOTAL} succeeded ==="
fi

if [ ${#FAILED[@]} -gt 0 ]; then
  echo "FAILED: ${FAILED[*]}" >&2
  exit 1
fi

if [ "$BACKUP_VERIFY_ONLY" = "1" ]; then
  echo "All database connections verified."
else
  echo "All backups completed successfully."
fi
