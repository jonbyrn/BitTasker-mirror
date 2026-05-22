#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# BitTasker — Restore PostgreSQL database from Cloudflare R2 backup
# ─────────────────────────────────────────────────────────────────────────────
# Downloads the latest backup for a specified database from R2 and restores it.
# Prompts for confirmation before overwriting any data.
#
# Required environment variables:
#   CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
#
# Usage:
#   bash scripts/restore-from-r2.sh api [target_db_url]
#   bash scripts/restore-from-r2.sh relay_tasks
#   bash scripts/restore-from-r2.sh relay_general postgresql://user:pass@localhost:5432/restored_db
#
# If target_db_url is omitted, prints the restore command instead of running it.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

LABEL="${1:-}"
TARGET_URL="${2:-}"

if [ -z "$LABEL" ]; then
  echo "Usage: bash scripts/restore-from-r2.sh <api|relay_tasks|relay_general> [target_db_url]" >&2
  echo "" >&2
  echo "  target_db_url  — PostgreSQL connection string for the target database." >&2
  echo "                   If omitted, prints the pg_restore command without running it." >&2
  exit 1
fi

case "$LABEL" in
  api|relay_tasks|relay_general) ;;
  *)
    echo "ERROR: LABEL must be 'api', 'relay_tasks', or 'relay_general' (got '$LABEL')" >&2
    exit 1
    ;;
esac

# ── Validate required variables ─────────────────────────────────────────────
REQUIRED_VARS=(CLOUDFLARE_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET)
MISSING=()
for VAR in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!VAR:-}" ]; then
    MISSING+=("$VAR")
  fi
done
if [ ${#MISSING[@]} -gt 0 ]; then
  echo "ERROR: Missing required environment variables: ${MISSING[*]}" >&2
  echo "Set them before running this script: export VAR=value" >&2
  exit 1
fi

export AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}"
R2_ENDPOINT="https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com"

# ── Ensure aws CLI is available ─────────────────────────────────────────────
if ! command -v aws &>/dev/null; then
  echo "ERROR: aws CLI is required. Install with: pip install awscli" >&2
  exit 1
fi

# ── Find latest backup ──────────────────────────────────────────────────────
echo "Looking for latest backup of '$LABEL' in R2..."
echo ""

# Try daily first, then weekly, then monthly (most recent backup across all prefixes)
LATEST=""
LATEST_DATE=""

for PREFIX in daily weekly monthly; do
  echo "  Searching: s3://${R2_BUCKET}/${PREFIX}/${LABEL}/"
  RESULT=$(aws s3 ls "s3://${R2_BUCKET}/${PREFIX}/${LABEL}/" \
    --endpoint-url "${R2_ENDPOINT}" \
    2>/dev/null || true)

  if [ -n "$RESULT" ]; then
    LAST_LINE=$(echo "$RESULT" | sort | tail -1)
    LAST_FILE=$(echo "$LAST_LINE" | awk '{print $4}')
    LAST_DATE_STR=$(echo "$LAST_LINE" | awk '{print $1" "$2}')

    if [ -n "$LAST_FILE" ]; then
      echo "    Found: ${LAST_FILE} (${LAST_DATE_STR})"
      if [ -z "$LATEST_DATE" ] || [[ "$LAST_DATE_STR" > "$LATEST_DATE" ]]; then
        LATEST="${PREFIX}/${LABEL}/${LAST_FILE}"
        LATEST_DATE="$LAST_DATE_STR"
      fi
    else
      echo "    (empty)"
    fi
  else
    echo "    (empty)"
  fi
done

echo ""

if [ -z "$LATEST" ]; then
  echo "ERROR: No backups found for '$LABEL' in any retention prefix." >&2
  exit 1
fi

echo "Latest backup: ${LATEST_DATE} — ${LATEST}"

# ── Download ────────────────────────────────────────────────────────────────
LOCAL_FILE="/tmp/${LATEST##*/}"
echo "Downloading to ${LOCAL_FILE}..."
aws s3 cp "s3://${R2_BUCKET}/${LATEST}" "${LOCAL_FILE}" \
  --endpoint-url "${R2_ENDPOINT}" \
  --only-show-errors

DUMP_SIZE=$(stat -f%z "${LOCAL_FILE}" 2>/dev/null || stat -c%s "${LOCAL_FILE}" 2>/dev/null || echo 0)
echo "Downloaded: $(( DUMP_SIZE / 1024 / 1024 )) MB"
echo ""

# ── Restore or print command ────────────────────────────────────────────────
if [ -z "$TARGET_URL" ]; then
  echo "──────────────────────────────────────────────────────────"
  echo " No target URL provided. To restore, run:"
  echo ""
  echo "   pg_restore --clean --if-exists --no-owner --no-acl \\"
  echo "     --dbname=\"postgresql://user:pass@host:port/dbname\" \\"
  echo "     ${LOCAL_FILE}"
  echo ""
  echo " Or set DATABASE_URL and run:"
  echo "   pg_restore --clean --if-exists --no-owner --no-acl \\"
  echo "     --dbname=\"\$DATABASE_URL\" \\"
  echo "     ${LOCAL_FILE}"
  echo "──────────────────────────────────────────────────────────"
else
  echo "Restoring to: ${TARGET_URL%%@*}@..."  # hide password in output
  echo ""
  echo "WARNING: This will DROP and recreate tables in the target database."
  read -rp "Continue? [y/N] " CONFIRM
  if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo "Aborted."
    rm -f "${LOCAL_FILE}"
    exit 0
  fi

  echo "Restoring..."
  pg_restore \
    --clean \
    --if-exists \
    --no-owner \
    --no-acl \
    --dbname="${TARGET_URL}" \
    "${LOCAL_FILE}"

  echo ""
  echo "Restore complete. Local dump file kept at: ${LOCAL_FILE}"
  echo "Delete it manually when done: rm ${LOCAL_FILE}"
fi
