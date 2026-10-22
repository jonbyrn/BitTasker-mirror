#!/usr/bin/env bash
# Diagnose the loopback QVAC server. When alias embed is missing, print the
# host commands and stop. This job does not restart QVAC and does not use SSH.
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
		rm -f "$body" "${body}.err"
	fi
	if [ -n "$models_file" ]; then
		rm -f "$models_file" "${models_file}.err"
	fi
}
trap cleanup EXIT

manual_step() {
	printf '%s\n' "Manual step: ask BitTasker Hotfix to restart QVAC on the VPS"
}

# Commands for the VPS shell. This container can reach port 11434 and cannot
# copy the config or restart the listener.
print_hotfix() {
	cat <<'EOF'
QVAC here is `qvac serve --openai` from services/qvac (@qvac/cli 0.22.0 and @qvac/sdk 0.22.0). `npm start` runs `node server.mjs`, which listens on 127.0.0.1:11434. It is not Ollama. The repo has no model directory and no GGUF path. Alias embed is the SDK constant EMBEDDINGGEMMA_300M_Q4_0 (768 dimensions, preload false). Alias ocr is OCR_LATIN. The plugins are @qvac/sdk/llamacpp-embedding/plugin and @qvac/sdk/ggml-ocr/plugin. A process that is already listening does not load aliases added after it started. The first start downloads those weights through the SDK.

This job cannot do that. BitTasker Hotfix runs these commands on the VPS that owns 127.0.0.1:11434:

  install -d /opt/bittasker/qvac
  cp services/qvac/qvac.config.json /opt/bittasker/qvac/qvac.config.json
  cp services/qvac/package.json /opt/bittasker/qvac/package.json
  cp services/qvac/server.mjs /opt/bittasker/qvac/server.mjs
  bash scripts/qvac-restart-remote.sh

Run the copy from a BitTasker checkout that contains services/qvac. qvac-restart-remote.sh stops a listener on port 11434 only when its command contains qvac or server.mjs, then runs npm install and npm start in /opt/bittasker/qvac. The log is /var/log/bittasker-qvac.log. If the SDK download fails, that log has the error. There is no Ollama registry name and no embeddinggemma:300m pull.

Then, still on the VPS, without printing the bearer token:

  curl -sS -o /tmp/qvac-models.json -w 'models %{http_code}\n' \
    -H "Authorization: Bearer $QVAC_BEARER_TOKEN" \
    http://127.0.0.1:11434/v1/models
  node --input-type=module -e 'import {readFileSync} from "node:fs"; const body=JSON.parse(readFileSync("/tmp/qvac-models.json","utf8")); const rows=Array.isArray(body.data)?body.data:Array.isArray(body.models)?body.models:[]; console.log(rows.map((row)=>row.id||row.name||row.model).join(" "));'
  curl -sS -o /dev/null -w 'embed %{http_code}\n' \
    -H "Authorization: Bearer $QVAC_BEARER_TOKEN" \
    -H 'content-type: application/json' \
    -d '{"model":"embed","input":"someone to fix my sink"}' \
    http://127.0.0.1:11434/v1/embeddings

The model list must include embed and ocr. The embed call must return 200. Then play search-embed.
EOF
}

qvac_curl() {
	local outfile="$1"
	local url="$2"
	local payload="${3-}"
	local errfile="${outfile}.err"
	local code
	: >"$errfile"
	if [ -n "$payload" ]; then
		code="$(
			curl -sS -o "$outfile" -w '%{http_code}' \
				-H "Authorization: Bearer ${QVAC_BEARER_TOKEN}" \
				-H 'content-type: application/json' \
				-d "$payload" \
				"$url" 2>"$errfile"
		)" || code="000"
	else
		code="$(
			curl -sS -o "$outfile" -w '%{http_code}' \
				-H "Authorization: Bearer ${QVAC_BEARER_TOKEN}" \
				"$url" 2>"$errfile"
		)" || code="000"
	fi
	printf '%s\n' "$code"
}

print_body() {
	node "$root/scripts/qvac-embed-body.mjs" note "$1"
}

print_err() {
	local file="$1"
	if [ -s "$file" ]; then
		node "$root/scripts/qvac-embed-body.mjs" note "$file"
	fi
}

has_alias() {
	printf '%s\n' "$names" | grep -Fxq "$1"
}

has_embed() {
	has_alias embed || printf '%s\n' "$names" | grep -Eiq 'embeddinggemma'
}

body="$(mktemp)"
models_file="$(mktemp)"
tags_code=""
models_code=""
names=""

refresh_names() {
	tags_code="$(qvac_curl "$body" "${qvac_url}/api/tags")"
	models_code="$(qvac_curl "$models_file" "${qvac_url}/v1/models")"
	printf '%s\n' "GET /api/tags HTTP ${tags_code}"
	if [ "$tags_code" != "200" ]; then
		print_body "$body"
		print_err "${body}.err"
	fi
	printf '%s\n' "GET /v1/models HTTP ${models_code}"
	if [ "$models_code" != "200" ]; then
		print_body "$models_file"
		print_err "${models_file}.err"
	fi
	names="$(
		{
			node "$root/scripts/qvac-embed-body.mjs" names "$body" 2>/dev/null || true
			node "$root/scripts/qvac-embed-body.mjs" names "$models_file" 2>/dev/null || true
		} | awk 'NF && !seen[$0]++'
	)"
	if [ -z "$names" ]; then
		printf '%s\n' "model names: (none)"
	else
		printf '%s\n' "model names: $(printf '%s' "$names" | tr '\n' ' ')"
	fi
}

refresh_names

if [ "$models_code" = "401" ] || [ "$models_code" = "403" ]; then
	printf '%s\n' "GET /v1/models was not authorized. QVAC_BEARER_TOKEN was not printed."
	exit 1
fi

if ! has_embed; then
	printf '%s\n' "Alias embed is not in the model list."
	printf '%s\n' "The listener is qvac serve --openai. GET /api/tags is an Ollama route and is absent here."
	printf '%s\n' "Registered names above are the aliases that process loaded at startup."
	printf '%s\n' "Alias embed is EMBEDDINGGEMMA_300M_Q4_0. Recording one POST /api/pull. That route is not how this server loads a model."
	pull_body='{"name":"embeddinggemma","stream":false}'
	pull_code="$(qvac_curl "$body" "${qvac_url}/api/pull" "$pull_body")"
	printf '%s\n' "POST /api/pull {\"name\":\"embeddinggemma\",\"stream\":false} HTTP ${pull_code}"
	print_body "$body"
	print_err "${body}.err"
	printf '%s\n' "That HTTP status and body are the pull error."
	refresh_names
fi

if ! has_embed; then
	print_hotfix
	manual_step
	exit 1
fi

model="embed"
if ! has_alias embed; then
	model="$(printf '%s\n' "$names" | grep -Ei 'embeddinggemma' | head -1 || true)"
fi

probe_ok=0
for route in /v1/embeddings /api/embed /api/embeddings; do
	if [ "$route" = "/api/embeddings" ]; then
		payload="$(node -e 'process.stdout.write(JSON.stringify({model:process.argv[1],prompt:"someone to fix my sink"}))' "$model")"
	else
		payload="$(node -e 'process.stdout.write(JSON.stringify({model:process.argv[1],input:"someone to fix my sink"}))' "$model")"
	fi
	code="$(qvac_curl "$body" "${qvac_url}${route}" "$payload")"
	dim="$(node "$root/scripts/qvac-embed-body.mjs" dim "$body" 2>/dev/null || printf 'none')"
	printf '%s\n' "embed HTTP ${code} path=${route} model=${model} dim=${dim}"
	if [ "$code" != "200" ]; then
		print_body "$body"
		print_err "${body}.err"
	fi
	if [ "$code" = "200" ] && [ "$dim" = "768" ]; then
		probe_ok=1
		break
	fi
done

if ! has_alias ocr; then
	printf '%s\n' "Alias ocr is not in the model list. The same restart registers OCR_LATIN."
fi

if [ "$probe_ok" -ne 1 ]; then
	printf '%s\n' "Embedding alias ${model} did not return a 768-dimension vector from /v1/embeddings."
	print_hotfix
	manual_step
	exit 1
fi
manual_step
