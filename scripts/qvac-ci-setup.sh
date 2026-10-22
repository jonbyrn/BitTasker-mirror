#!/usr/bin/env bash
# Check embed and ocr on QVAC_LOCAL_URL. The vps runner uses host networking,
# so the default is http://127.0.0.1:11434. Copying the config and
# restarting the host process happens only when QVAC_SSH_HOST is set.
# Tokens and SSH keys stay out of the log.
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
key_file=""
body=""
cleanup() {
	if [ -n "$key_file" ]; then
		rm -f "$key_file"
	fi
	if [ -n "$body" ]; then
		rm -f "$body"
	fi
}
trap cleanup EXIT

if [ -n "${QVAC_SSH_HOST:-}" ]; then
	if [ -z "${QVAC_SSH_PRIVATE_KEY:-}" ]; then
		printf '%s\n' "Missing QVAC_SSH_PRIVATE_KEY."
		printf '%s\n' "QVAC_SSH_HOST is set, so this job copies services/qvac and restarts the host process."
		printf '%s\n' "QVAC_SSH_USER defaults to root. QVAC_SSH_PORT defaults to 22."
		exit 1
	fi
	user="${QVAC_SSH_USER:-root}"
	port="${QVAC_SSH_PORT:-22}"
	key_file="$(mktemp)"
	chmod 600 "$key_file"
	printf '%s\n' "$QVAC_SSH_PRIVATE_KEY" >"$key_file"
	ssh_opts=(-i "$key_file" -p "$port" -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes)
	target="${user}@${QVAC_SSH_HOST}"
	printf '%s\n' "Copying services/qvac and restarting it over SSH."
	ssh "${ssh_opts[@]}" "$target" 'mkdir -p /opt/bittasker/qvac'
	tar -C "$root/services/qvac" -czf - . | ssh "${ssh_opts[@]}" "$target" 'tar -xzf - -C /opt/bittasker/qvac'
	ssh "${ssh_opts[@]}" "$target" 'cat > /opt/bittasker/qvac/qvac-restart-remote.sh && chmod 700 /opt/bittasker/qvac/qvac-restart-remote.sh' \
		<"$root/scripts/qvac-restart-remote.sh"
	ssh "${ssh_opts[@]}" "$target" 'bash /opt/bittasker/qvac/qvac-restart-remote.sh'
	rm -f "$key_file"
	key_file=""
else
	printf '%s\n' "QVAC_SSH_HOST is unset."
	printf '%s\n' "This container cannot copy files onto the host or restart the process listening on port 11434."
	printf '%s\n' "Checking the embed and ocr aliases already loaded at ${qvac_url}."
	printf '%s\n' "Set QVAC_SSH_HOST and QVAC_SSH_PRIVATE_KEY to copy services/qvac and restart it."
fi

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
	exit 1
fi
node "$root/scripts/qvac-models-check.mjs" "$body"
rm -f "$body"
body=""

curl -sS -o /dev/null -w 'embed %{http_code} %{time_total}\n' \
	-H "Authorization: Bearer ${QVAC_BEARER_TOKEN}" \
	-H 'content-type: application/json' \
	-d '{"model":"embed","input":"someone to fix my sink"}' \
	"${qvac_url}/v1/embeddings"
curl -sS -o /dev/null -w 'chat %{http_code} %{time_total}\n' \
	-H "Authorization: Bearer ${QVAC_BEARER_TOKEN}" \
	-H 'content-type: application/json' \
	-d '{"model":"llama","messages":[{"role":"user","content":"Say ok"}],"max_tokens":8}' \
	"${qvac_url}/v1/chat/completions"
