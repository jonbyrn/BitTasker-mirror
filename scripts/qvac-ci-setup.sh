#!/usr/bin/env bash
# Check and load the embed and ocr aliases at QVAC_LOCAL_URL.
# The vps runner uses host networking, so the default is http://127.0.0.1:11434.
# This job does not restart QVAC and does not use SSH.
# The bearer token stays out of the log.
set +x
set -euo pipefail

if [ "${CI_DEBUG_TRACE:-}" = "true" ]; then
	printf '%s\n' "Refusing qvac-setup while CI_DEBUG_TRACE is true."
	exit 1
fi

case "${CI_COMMIT_BRANCH:-}" in
	sandbox/rgb-wasm-phase0|dev) ;;
	*)
		printf '%s\n' "qvac-setup runs only on sandbox/rgb-wasm-phase0 and dev."
		exit 1
		;;
esac

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

qvac_url="${QVAC_LOCAL_URL:-http://127.0.0.1:11434}"
qvac_url="${qvac_url%/}"
require_origin "QVAC_LOCAL_URL" "$qvac_url"

root="$(cd "$(dirname "$0")/.." && pwd)"
body=""
cleanup() {
	if [ -n "$body" ]; then
		rm -f "$body"
	fi
}
trap cleanup EXIT

manual_step() {
	printf '%s\n' "Manual step: ask BitTasker Hotfix to restart QVAC on the VPS"
}

printf '%s\n' "Checking QVAC at ${qvac_url}."
body="$(mktemp)"
code="$(
	curl -sS -o "$body" -w '%{http_code}' \
		-H "Authorization: Bearer ${QVAC_BEARER_TOKEN}" \
		"${qvac_url}/v1/models"
)"
printf '%s\n' "models ${code}"
if [ "$code" != "200" ]; then
	rm -f "$body"
	body=""
	printf '%s\n' "The model list did not return 200. The body was not printed."
	manual_step
	exit 1
fi
if ! node "$root/scripts/qvac-models-check.mjs" "$body"; then
	rm -f "$body"
	body=""
	manual_step
	exit 1
fi
rm -f "$body"
body=""

# preload is false, so the first request loads each alias.
load_alias() {
	local name="$1"
	local path="$2"
	local payload="$3"
	local line
	line="$(
		curl -sS -o /dev/null -w '%{http_code} %{time_total}' \
			-H "Authorization: Bearer ${QVAC_BEARER_TOKEN}" \
			-H 'content-type: application/json' \
			-d "$payload" \
			"${qvac_url}${path}"
	)" || line="000"
	printf '%s\n' "${name} ${line}"
	case "$line" in
		200\ *) ;;
		*)
			printf '%s\n' "${name} did not return 200. The body was not printed."
			manual_step
			exit 1
			;;
	esac
}

load_alias embed /v1/embeddings '{"model":"embed","input":"someone to fix my sink"}'
load_alias ocr /v1/ocr '{"model":"ocr","image":"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="}'
manual_step
