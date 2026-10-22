#!/usr/bin/env bash
# Copy services/qvac to the tunnel host, restart it, then check embed and ocr.
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

missing=0
for name in QVAC_SSH_HOST QVAC_SSH_PRIVATE_KEY QVAC_BEARER_TOKEN; do
	if [ -z "${!name:-}" ]; then
		printf '%s\n' "Missing ${name}."
		missing=1
	fi
done
if [ "$missing" -ne 0 ]; then
	printf '%s\n' "QVAC_SSH_USER defaults to root. QVAC_SSH_PORT defaults to 22."
	printf '%s\n' "QVAC_BASE_URL defaults to https://qvac-dev.bittasker.com."
	printf '%s\n' "No GitLab CI variable in this repo names the QVAC tunnel host."
	printf '%s\n' "TYPESENSE_SSH_HOST is the Typesense Docker host. This job does not use it."
	printf '%s\n' "QVAC_BEARER_TOKEN is a Worker secret in services/qvac/README.md, not a GitLab CI variable."
	exit 1
fi

base="${QVAC_BASE_URL:-https://qvac-dev.bittasker.com}"
base="${base%/}"
case "$base" in
	https://qvac-dev.bittasker.com|http://127.0.0.1:11434) ;;
	*)
		printf '%s\n' "QVAC_BASE_URL must be the qvac-dev tunnel or loopback."
		exit 1
		;;
esac

root="$(cd "$(dirname "$0")/.." && pwd)"
user="${QVAC_SSH_USER:-root}"
port="${QVAC_SSH_PORT:-22}"
key_file="$(mktemp)"
chmod 600 "$key_file"
trap 'rm -f "$key_file"' EXIT
printf '%s\n' "$QVAC_SSH_PRIVATE_KEY" >"$key_file"

ssh_opts=(-i "$key_file" -p "$port" -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes)
target="${user}@${QVAC_SSH_HOST}"

printf '%s\n' "Copying services/qvac to the tunnel host."
ssh "${ssh_opts[@]}" "$target" 'mkdir -p /opt/bittasker/qvac'
tar -C "$root/services/qvac" -czf - . | ssh "${ssh_opts[@]}" "$target" 'tar -xzf - -C /opt/bittasker/qvac'
ssh "${ssh_opts[@]}" "$target" 'cat > /opt/bittasker/qvac/qvac-restart-remote.sh && chmod 700 /opt/bittasker/qvac/qvac-restart-remote.sh' \
	<"$root/scripts/qvac-restart-remote.sh"
ssh "${ssh_opts[@]}" "$target" 'bash /opt/bittasker/qvac/qvac-restart-remote.sh'

body="$(mktemp)"
trap 'rm -f "$key_file" "$body"' EXIT
code="$(
	curl -sS -o "$body" -w '%{http_code}' \
		-H "Authorization: Bearer ${QVAC_BEARER_TOKEN}" \
		"$base/v1/models"
)"
printf '%s\n' "models ${code}"
if [ "$code" != "200" ]; then
	rm -f "$body"
	printf '%s\n' "The model list did not return 200. The body was not printed."
	exit 1
fi
node "$root/scripts/qvac-models-check.mjs" "$body"
rm -f "$body"

curl -sS -o /dev/null -w 'embed %{http_code} %{time_total}\n' \
	-H "Authorization: Bearer ${QVAC_BEARER_TOKEN}" \
	-H 'content-type: application/json' \
	-d '{"model":"embed","input":"someone to fix my sink"}' \
	"$base/v1/embeddings"
curl -sS -o /dev/null -w 'chat %{http_code} %{time_total}\n' \
	-H "Authorization: Bearer ${QVAC_BEARER_TOKEN}" \
	-H 'content-type: application/json' \
	-d '{"model":"llama","messages":[{"role":"user","content":"Say ok"}],"max_tokens":8}' \
	"$base/v1/chat/completions"
