#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# BitTasker — PostgreSQL backup to Cloudflare R2
# ─────────────────────────────────────────────────────────────────────────────
# Runs pg_dump for all three Railway PostgreSQL databases and uploads
# compressed custom-format dumps to Cloudflare R2.
#
# Required environment variables (set as GitLab CI variables):
#   R2_ACCOUNT_ID        — Cloudflare account ID (36-char hex)
#   R2_ACCESS_KEY_ID     — R2 API token access key
#   R2_SECRET_ACCESS_KEY — R2 API token secret
#   R2_BUCKET            — R2 bucket name (e.g. "bittasker-backups")
#   PG_HOST_API          — PostgreSQL host for bittasker-nestjs (API)
#   PG_HOST_RELAY_TASKS  — PostgreSQL host for nostr-relay-nestjs (Tasks Relay)
#   PG_HOST_RELAY_GENERAL— PostgreSQL host for bittasker-nostr-rs-relay (General Relay)
#   PGUSER_BACKUP        — Read-only backup user (same on all 3 DBs)
#   PGPASSWORD_BACKUP    — Backup user password (same on all 3 DBs)
#   RETENTION_TYPE       — "daily", "weekly", or "monthly" (set by GitLab schedule)
#
# Usage:
#   RETENTION_TYPE=daily bash scripts/backup-databases.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Validate required variables ─────────────────────────────────────────────
REQUIRED_VARS=(
  R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET
  PG_HOST_API PG_HOST_RELAY_TASKS PG_HOST_RELAY_GENERAL
  PGUSER_BACKUP PGPASSWORD_BACKUP RETENTION_TYPE
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
R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
TIMESTAMP=$(date -u +%Y%m%d_%H%M%S)
export AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}"

# ── Database definitions ────────────────────────────────────────────────────
# Format: "label|host_variable|database_name"
# label is used for the filename; database_name is the DB to dump
DATABASES=(
  "api|PG_HOST_API|bittasker"
  "relay_tasks|PG_HOST_RELAY_TASKS|bittasker_relay_tasks"
  "relay_general|PG_HOST_RELAY_GENERAL|bittasker_relay_general"
)

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
  IFS='|' read -r LABEL HOST_VAR DB_NAME <<< "$DB_DEF"
  PG_HOST="${!HOST_VAR}"

  echo "── Backing up: $LABEL ($DB_NAME @ $PG_HOST) ──"

  FILENAME="${TIMESTAMP}_${LABEL}.dump"
  TEMP_FILE="/tmp/${FILENAME}"

  # Run pg_dump with custom format (compressed, supports pg_restore)
  if PGPASSWORD="${PGPASSWORD_BACKUP}" pg_dump \
    --host="${PG_HOST}" \
    --port=5432 \
    --username="${PGUSER_BACKUP}" \
    --dbname="${DB_NAME}" \
    --format=custom \
    --compress=9 \
    --no-owner \
    --no-acl \
    --no-password \
    --file="${TEMP_FILE}" \
    2>&1; then

    DUMP_SIZE=$(stat -f%z "${TEMP_FILE}" 2>/dev/null || stat -c%s "${TEMP_FILE}" 2>/dev/null || echo 0)
    echo "  pg_dump OK — ${DUMP_SIZE} bytes ($(( DUMP_SIZE / 1024 / 1024 )) MB)"

    # Upload to R2
    echo "  Uploading to R2: ${RETENTION_TYPE}/${LABEL}/${FILENAME}"
    if aws s3 cp "${TEMP_FILE}" \
      "s3://${R2_BUCKET}/${RETENTION_TYPE}/${LABEL}/${FILENAME}" \
      --endpoint-url "${R2_ENDPOINT}" \
      --only-show-errors; then
      echo "  Upload OK"
      SUCCESS=$((SUCCESS + 1))
    else
      echo "  ERROR: Upload failed for $LABEL" >&2
      FAILED+=("${LABEL} (upload)")
    fi

    rm -f "${TEMP_FILE}"
  else
    echo "  ERROR: pg_dump failed for $LABEL" >&2
    FAILED+=("${LABEL}")
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
