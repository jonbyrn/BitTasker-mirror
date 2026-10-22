#!/usr/bin/env bash
# Backfill rgb_ and dev_ embeddings from the vps runner's Docker job.
# QVAC_LOCAL_URL defaults to http://host.docker.internal:11434.
# TYPESENSE_LOCAL_URL defaults to http://host.docker.internal:8108.
# TYPESENSE_API_KEY comes from a masked CI variable. It is never printed.
set +x
set -euo pipefail

if [ "${CI_DEBUG_TRACE:-}" = "true" ]; then
	printf '%s\n' "Refusing search-embed while CI_DEBUG_TRACE is true."
	exit 1
fi

case "${CI_COMMIT_BRANCH:-}" in
	sandbox/rgb-wasm-phase0|dev) ;;
	*)
		printf '%s\n' "search-embed runs only on sandbox/rgb-wasm-phase0 and dev."
		exit 1
		;;
esac

trap 'unset TYPESENSE_API_KEY QVAC_BEARER_TOKEN' EXIT

require_origin() {
	local name="$1"
	local value="$2"
	case "$value" in
		*[$'\n\r \t']*)
			printf '%s\n' "${name} must be a single-line URL."
			exit 1
			;;
		http://*|https://*) ;;
		*)
			printf '%s\n' "${name} must start with http:// or https://."
			exit 1
			;;
	esac
	case "$value" in
		*'@'*|*'?'*|*'#'*)
			printf '%s\n' "${name} must be an origin without credentials, a query, or a fragment."
			exit 1
			;;
	esac
	local rest="${value#*://}"
	case "$rest" in
		''|*'/'*)
			printf '%s\n' "${name} must be an origin without a path."
			exit 1
			;;
	esac
}

case "${QVAC_BEARER_TOKEN:-}" in
	''|\$*)
		printf '%s\n' "Missing QVAC_BEARER_TOKEN."
		printf '%s\n' "Add QVAC_BEARER_TOKEN as a masked GitLab CI variable. The job does not print it."
		exit 1
		;;
	*$'\n'*|*$'\r'*)
		printf '%s\n' "QVAC_BEARER_TOKEN is not a single line. The value was not printed."
		exit 1
		;;
esac

case "${TYPESENSE_API_KEY:-}" in
	''|\$*)
		printf '%s\n' "Missing TYPESENSE_API_KEY."
		printf '%s\n' "Add TYPESENSE_API_KEY as a masked GitLab CI variable. The job does not read /opt/bittasker/typesense.env."
		printf '%s\n' "The value was not printed."
		exit 1
		;;
	*$'\n'*|*$'\r'*)
		printf '%s\n' "TYPESENSE_API_KEY is not a single line. The value was not printed."
		exit 1
		;;
esac

qvac_url="${QVAC_LOCAL_URL:-http://host.docker.internal:11434}"
qvac_url="${qvac_url%/}"
typesense_url="${TYPESENSE_LOCAL_URL:-http://host.docker.internal:8108}"
typesense_url="${typesense_url%/}"
require_origin "QVAC_LOCAL_URL" "$qvac_url"
require_origin "TYPESENSE_LOCAL_URL" "$typesense_url"

export QVAC_ENABLED=true
export QVAC_BASE_URL="$qvac_url"
export TYPESENSE_HOST="$typesense_url"
printf '%s\n' "QVAC_BASE_URL ${QVAC_BASE_URL}"
printf '%s\n' "TYPESENSE_HOST ${TYPESENSE_HOST}"

export TYPESENSE_COLLECTION_PREFIX=rgb_
printf '%s\n' "search:embed prefix rgb_"
npm run search:embed
export TYPESENSE_COLLECTION_PREFIX=dev_
printf '%s\n' "search:embed prefix dev_"
npm run search:embed
printf '%s\n' "search:embed finished."
