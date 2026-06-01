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
#     Full postgresql:// URIs (Railway public TCP proxy). Include sslmode=require
#     and keepalive/timeout query params — see docs/ci/server-backup.md
#   RETENTION_TYPE — "daily", "weekly", or "monthly" (set by GitLab schedule)
#
# Optional:
#   PG_DUMP_MAX_ATTEMPTS — default 3
#   PG_DUMP_RETRY_DELAY_SECONDS — initial backoff, default 30 (doubles each retry)
#   PGOPTIONS — default "-c statement_timeout=0" for long dumps
#
# Usage:
#   RETENTION_TYPE=daily bash scripts/backup-databases.sh
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

# Format: "label|url_variable_name"
DATABASES=(
  "api|DATABASE_URL_API"
  "relay_tasks|DATABASE_URL_RELAY_TASKS"
  "relay_general|DATABASE_URL_RELAY_GENERAL"
)

# ── Helpers ─────────────────────────────────────────────────────────────────
# Log connection target without credentials (postgresql://***@host:port/db?…)
redact_database_url() {
  local url="$1"
  if [[ "$url" =~ ^(postgres(ql)?://)[^@]+@(.+)$ ]]; then
    printf '%s***@%s' "${BASH_REMATCH[1]}" "${BASH_REMATCH[3]}"
  else
    printf '<redacted-connection-string>'
  fi
}

run_pg_dump_with_retry() {
  local database_url="$1"
  local temp_file="$2"
  local attempt=1
  local delay="$PG_DUMP_RETRY_DELAY_SECONDS"

  while true; do
    echo "  pg_dump attempt ${attempt}/${PG_DUMP_MAX_ATTEMPTS}…"
    if pg_dump \
      --verbose \
      -d "$database_url" \
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

# ── Ensure aws CLI is available ─────────────────────────────────────────────
if ! command -v aws &>/dev/null; then
  echo "ERROR: aws CLI is required. Install with: pip install awscli" >&2
  exit 1
fi

# ── Main backup loop ────────────────────────────────────────────────────────
FAILED=()
SUCCESS=0
TOTAL=${#DATABASES[@]}

echo "=== BitTasker Database Backup ($RETENTION_TYPE) — $TIMESTAMP ==="
echo ""

for DB_DEF in "${DATABASES[@]}"; do
  IFS='|' read -r LABEL URL_VAR <<< "$DB_DEF"
  DATABASE_URL="${!URL_VAR}"

  echo "── Backing up: $LABEL ($(redact_database_url "$DATABASE_URL")) ──"

  FILENAME="${TIMESTAMP}_${LABEL}.dump"
  TEMP_FILE="/tmp/${FILENAME}"

  if run_pg_dump_with_retry "$DATABASE_URL" "$TEMP_FILE"; then
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
echo "=== Backup Summary: ${SUCCESS}/${TOTAL} succeeded ==="

if [ ${#FAILED[@]} -gt 0 ]; then
  echo "FAILED: ${FAILED[*]}" >&2
  exit 1
fi

echo "All backups completed successfully."
