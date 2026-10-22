#!/usr/bin/env bash
# Backfill rgb_ and dev_ embeddings. The admin key is read, never printed.
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

if [ -z "${QVAC_BEARER_TOKEN:-}" ]; then
	printf '%s\n' "Missing QVAC_BEARER_TOKEN."
	printf '%s\n' "It is a Worker secret in services/qvac/README.md, not a GitLab CI variable."
	exit 1
fi

export QVAC_ENABLED=true
export QVAC_BASE_URL="${QVAC_BASE_URL:-https://qvac-dev.bittasker.com}"
export TYPESENSE_HOST="${TYPESENSE_HOST:-https://typesense-dev.bittasker.com}"
case "$QVAC_BASE_URL" in
	https://qvac-dev.bittasker.com|https://qvac-dev.bittasker.com/) ;;
	*)
		printf '%s\n' "QVAC_BASE_URL must be https://qvac-dev.bittasker.com."
		exit 1
		;;
esac
QVAC_BASE_URL="${QVAC_BASE_URL%/}"
export QVAC_BASE_URL
case "$TYPESENSE_HOST" in
	https://typesense-dev.bittasker.com|https://typesense-dev.bittasker.com/) ;;
	*)
		printf '%s\n' "TYPESENSE_HOST must be https://typesense-dev.bittasker.com."
		exit 1
		;;
esac
TYPESENSE_HOST="${TYPESENSE_HOST%/}"
export TYPESENSE_HOST

if [ -z "${TYPESENSE_API_KEY:-}" ]; then
	if [ -z "${TYPESENSE_SSH_HOST:-}" ] || [ -z "${TYPESENSE_SSH_PRIVATE_KEY:-}" ]; then
		printf '%s\n' "Missing Typesense admin key access."
		printf '%s\n' "docs/typesense-sandbox.md says not to store TYPESENSE_API_KEY in GitLab CI."
		printf '%s\n' "The deploy job can read it from the Docker host when these are set:"
		printf '%s\n' "- TYPESENSE_SSH_HOST"
		printf '%s\n' "- TYPESENSE_SSH_PRIVATE_KEY"
		printf '%s\n' "- TYPESENSE_SSH_USER (default root)"
		printf '%s\n' "- TYPESENSE_SSH_PORT (default 22)"
		printf '%s\n' "Those SSH variables are referenced by scripts/deploy-typesense-sandbox.sh."
		printf '%s\n' "docs/typesense-sandbox.md says they are not set on the deploy job today."
		exit 1
	fi
	user="${TYPESENSE_SSH_USER:-root}"
	port="${TYPESENSE_SSH_PORT:-22}"
	key_file="$(mktemp)"
	chmod 600 "$key_file"
	trap 'rm -f "$key_file"; unset TYPESENSE_API_KEY' EXIT
	printf '%s\n' "$TYPESENSE_SSH_PRIVATE_KEY" >"$key_file"
	TYPESENSE_API_KEY="$(
		ssh -i "$key_file" -p "$port" -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes \
			"${user}@${TYPESENSE_SSH_HOST}" \
			'set +x; set -a; . /opt/bittasker/typesense.env; set +a; printf %s "$TYPESENSE_API_KEY"'
	)"
	rm -f "$key_file"
	trap 'unset TYPESENSE_API_KEY' EXIT
	export TYPESENSE_API_KEY
fi

if [ -z "${TYPESENSE_API_KEY:-}" ] || [[ "$TYPESENSE_API_KEY" == *$'\n'* ]]; then
	printf '%s\n' "The Typesense admin key was empty. Nothing from the env file was printed."
	exit 1
fi

export TYPESENSE_COLLECTION_PREFIX=rgb_
printf '%s\n' "search:embed prefix rgb_"
npm run search:embed
export TYPESENSE_COLLECTION_PREFIX=dev_
printf '%s\n' "search:embed prefix dev_"
npm run search:embed
unset TYPESENSE_API_KEY
printf '%s\n' "search:embed finished."
