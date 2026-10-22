#!/usr/bin/env bash
# Pull EmbeddingGemma when the embed alias is missing, then check it.
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
bash "$root/scripts/ci-ensure-tools.sh" curl

body=""
models_file=""
cleanup() {
	if [ -n "$body" ]; then
		rm -f "$body"
	fi
	if [ -n "$models_file" ]; then
		rm -f "$models_file"
	fi
}
trap cleanup EXIT

manual_step() {
	printf '%s\n' "Manual step: ask BitTasker Hotfix to restart QVAC on the VPS"
}

qvac_curl() {
	local outfile="$1"
	local url="$2"
	local payload="${3-}"
	local code
	if [ -n "$payload" ]; then
		code="$(
			curl -sS -o "$outfile" -w '%{http_code}' \
				-H "Authorization: Bearer ${QVAC_BEARER_TOKEN}" \
				-H 'content-type: application/json' \
				-d "$payload" \
				"$url"
		)" || code="000"
	else
		code="$(
			curl -sS -o "$outfile" -w '%{http_code}' \
				-H "Authorization: Bearer ${QVAC_BEARER_TOKEN}" \
				"$url"
		)" || code="000"
	fi
	printf '%s\n' "$code"
}

list_names() {
	local tags="$1"
	local models="$2"
	local code
	code="$(qvac_curl "$tags" "${qvac_url}/api/tags")"
	printf '%s\n' "tags ${code}" >&2
	node "$root/scripts/qvac-embed-body.mjs" names "$tags" 2>/dev/null || true
	if [ "$code" != "200" ]; then
		code="$(qvac_curl "$models" "${qvac_url}/v1/models")"
		printf '%s\n' "models ${code}" >&2
		node "$root/scripts/qvac-embed-body.mjs" names "$models" 2>/dev/null || true
	fi
}

has_name() {
	local wanted="$1"
	printf '%s\n' "$names" | grep -Fxq "$wanted"
}

gemma_name() {
	printf '%s\n' "$names" | grep -Ei 'embeddinggemma' | head -1 || true
}

body="$(mktemp)"
models_file="$(mktemp)"
names="$(list_names "$body" "$models_file")"
printf '%s\n' "model names: $(printf '%s' "$names" | tr '\n' ' ')"

if ! printf '%s\n' "$names" | grep -Eiq 'embeddinggemma|^embed$'; then
	printf '%s\n' "Embedding alias is missing. Pulling embeddinggemma (EmbeddingGemma 768d)."
	code="$(qvac_curl "$body" "${qvac_url}/api/pull" '{"name":"embeddinggemma","stream":false}')"
	if [ "$code" != "200" ]; then
		code="$(qvac_curl "$body" "${qvac_url}/api/pull" '{"model":"embeddinggemma","stream":false}')"
	fi
	status="$(node "$root/scripts/qvac-embed-body.mjs" status "$body" 2>/dev/null || printf 'none')"
	printf '%s\n' "pull ${code} status=${status}"
	if [ "$code" != "200" ]; then
		printf '%s\n' "Could not pull embeddinggemma. The response body was not printed."
		manual_step
		exit 1
	fi
	names="$(list_names "$body" "$models_file")"
fi

if ! has_name embed; then
	source_name="$(gemma_name)"
	if [ -z "$source_name" ]; then
		printf '%s\n' "EmbeddingGemma is still missing after the pull."
		manual_step
		exit 1
	fi
	printf '%s\n' "Creating embed alias from ${source_name}."
	payload="$(node -e 'process.stdout.write(JSON.stringify({model:"embed",from:process.argv[1],stream:false}))' "$source_name")"
	code="$(qvac_curl "$body" "${qvac_url}/api/create" "$payload")"
	status="$(node "$root/scripts/qvac-embed-body.mjs" status "$body" 2>/dev/null || printf 'none')"
	printf '%s\n' "create ${code} status=${status}"
	if [ "$code" != "200" ]; then
		printf '%s\n' "Could not create the embed alias. Search will use ${source_name} when that name is loaded."
	fi
fi

model="embed"
if ! has_name embed; then
	model="$(gemma_name)"
fi
if [ -z "$model" ]; then
	printf '%s\n' "Embedding alias is not loaded."
	manual_step
	exit 1
fi

probe_ok=0
for route in /api/embed /api/embeddings /v1/embeddings; do
	if [ "$route" = "/api/embeddings" ]; then
		payload="$(node -e 'process.stdout.write(JSON.stringify({model:process.argv[1],prompt:"someone to fix my sink"}))' "$model")"
	else
		payload="$(node -e 'process.stdout.write(JSON.stringify({model:process.argv[1],input:"someone to fix my sink"}))' "$model")"
	fi
	code="$(qvac_curl "$body" "${qvac_url}${route}" "$payload")"
	dim="$(node "$root/scripts/qvac-embed-body.mjs" dim "$body" 2>/dev/null || printf 'none')"
	printf '%s\n' "embed ${code} path=${route} model=${model} dim=${dim}"
	if [ "$code" = "200" ] && [ "$dim" = "768" ]; then
		probe_ok=1
		break
	fi
done

if [ "$probe_ok" -ne 1 ]; then
	printf '%s\n' "Embedding alias ${model} is not loaded. Expected a 768-dimension vector from /api/embed, /api/embeddings, or /v1/embeddings."
	manual_step
	exit 1
fi
manual_step
