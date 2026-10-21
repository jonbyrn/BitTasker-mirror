#!/usr/bin/env bash
# Bring up Typesense 27.1 and the relay indexer on the sandbox Docker host.
# Keys are generated on that host and stored only in /opt/bittasker/typesense.env (root, 0600).
# This script does not write GitLab CI variables and does not print either key.
set -euo pipefail
set +x

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${TYPESENSE_ENV_FILE:-/opt/bittasker/typesense.env}"
PROJECT="${TYPESENSE_COMPOSE_PROJECT:-bittasker-typesense}"
export TYPESENSE_ENV_FILE="$ENV_FILE"

log() {
	printf '%s\n' "$*"
}

docker_cmd() {
	if [ -n "${TYPESENSE_DOCKER_BIN+x}" ]; then
		if [ -z "$TYPESENSE_DOCKER_BIN" ]; then
			return 1
		fi
		"$TYPESENSE_DOCKER_BIN" "$@"
		return
	fi
	docker "$@"
}

docker_ok() {
	if [ -n "${TYPESENSE_DOCKER_BIN+x}" ]; then
		if [ -z "$TYPESENSE_DOCKER_BIN" ] || [ ! -x "$TYPESENSE_DOCKER_BIN" ]; then
			return 1
		fi
	elif ! command -v docker >/dev/null 2>&1; then
		return 1
	fi
	docker_cmd info >/dev/null 2>&1 && docker_cmd compose version >/dev/null 2>&1
}

warn_no_host() {
	log "WARNING: Typesense skipped. No Docker host is available (no /var/run/docker.sock and no TYPESENSE_SSH_HOST). The Worker deploy continues on the relay fallback."
	log "deploy-sandbox uses image node:24-bookworm-slim and runner tag self-hosted."
	log "Missing:"
	log "- /var/run/docker.sock with the docker CLI and the compose plugin visible to this job, or"
	log "- TYPESENSE_SSH_HOST"
	log "- TYPESENSE_SSH_USER (defaults to root when the host is set)"
	log "- TYPESENSE_SSH_PRIVATE_KEY (must already exist; this job does not create GitLab CI variables)"
	log "- TYPESENSE_SSH_PORT (optional, default 22)"
	log "- openssh-client in the job image when TYPESENSE_SSH_HOST is set"
	log "The Worker keeps its current search vars. MEILI_SEARCH_KEY inheritance is unchanged."
	exit 0
}

compose() {
	docker_cmd compose --env-file "$ENV_FILE" -f "$ROOT/docker/docker-compose.typesense.yml" -p "$PROJECT" "$@"
}

probe_typesense() {
	# Port 8108 is published on the Docker host. --network host reaches that
	# loopback even when this script is running inside a job container that
	# only has the Docker socket.
	docker_cmd run --rm --network host node:22-bookworm-slim \
		node -e 'fetch("http://127.0.0.1:8108/health",{signal:AbortSignal.timeout(5000)}).then((response)=>process.exit(response.ok?0:1)).catch(()=>process.exit(1))'
}

run_node() {
	if command -v node >/dev/null 2>&1; then
		node "$@"
		return
	fi
	docker_cmd run --rm -u 0 \
		-e TYPESENSE_ENV_FILE="$ENV_FILE" \
		-v /opt/bittasker:/opt/bittasker \
		-v "$ROOT":/app:ro \
		-w /app \
		node:22-bookworm-slim \
		node "$@"
}

deploy_here() {
	if [ "$(id -u)" -ne 0 ]; then
		log "Typesense env file must be created as root so /opt/bittasker/typesense.env stays root-owned mode 0600."
		exit 1
	fi
	mkdir -p /opt/bittasker
	chmod 700 /opt/bittasker
	run_node scripts/typesense-env.mjs
	compose build indexer
	compose up -d --remove-orphans typesense
	ready=0
	for _ in $(seq 1 30); do
		if probe_typesense; then
			ready=1
			break
		fi
		sleep 2
	done
	if [ "$ready" -ne 1 ]; then
		log "Typesense did not answer http://127.0.0.1:8108/health."
		exit 1
	fi
	log "typesense health: ok"
	compose run --rm --no-deps -e TYPESENSE_CREATE_SEARCH_KEY=true indexer node scripts/typesense-keys.mjs
	log "indexer backfill: start"
	compose run --rm --no-deps -e INDEXER_ONCE=true indexer
	log "indexer backfill: done"
	compose up -d --remove-orphans indexer
	compose run --rm --no-deps indexer node scripts/typesense-health.mjs
}

remote_deploy() {
	if ! command -v ssh >/dev/null 2>&1 || ! command -v tar >/dev/null 2>&1; then
		log "TYPESENSE_SSH_HOST is set, but openssh-client or tar is missing from this job image."
		exit 1
	fi
	if [ -z "${TYPESENSE_SSH_PRIVATE_KEY:-}" ]; then
		log "TYPESENSE_SSH_HOST is set and TYPESENSE_SSH_PRIVATE_KEY is missing."
		log "This job does not create GitLab CI variables. Add the existing key to the runner environment, or mount the Docker socket instead."
		exit 1
	fi
	local user="${TYPESENSE_SSH_USER:-root}"
	local port="${TYPESENSE_SSH_PORT:-22}"
	local key_file
	key_file="$(mktemp)"
	chmod 600 "$key_file"
	printf '%s\n' "$TYPESENSE_SSH_PRIVATE_KEY" >"$key_file"
	# shellcheck disable=SC2064
	trap "rm -f '$key_file'" EXIT
	local ssh_opts=(-i "$key_file" -p "$port" -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes)
	tar -C "$ROOT" -czf - \
		docker/docker-compose.typesense.yml \
		docker/indexer.Dockerfile \
		scripts/deploy-typesense-sandbox.sh \
		scripts/typesense-env.mjs \
		scripts/typesense-keys.mjs \
		scripts/typesense-health.mjs \
		scripts/typesense-indexer.mjs \
		src/lib/search |
		ssh "${ssh_opts[@]}" "$user@${TYPESENSE_SSH_HOST}" \
			'mkdir -p /opt/bittasker/app && tar -xzf - -C /opt/bittasker/app'
	ssh "${ssh_opts[@]}" "$user@${TYPESENSE_SSH_HOST}" \
		"cd /opt/bittasker/app && TYPESENSE_ON_HOST=1 TYPESENSE_ENV_FILE=/opt/bittasker/typesense.env bash scripts/deploy-typesense-sandbox.sh"
	rm -f "$key_file"
	trap - EXIT
}

if [ "${TYPESENSE_ON_HOST:-}" != "1" ] && ! docker_ok; then
	if [ -n "${TYPESENSE_SSH_HOST:-}" ]; then
		remote_deploy
		exit 0
	fi
	warn_no_host
fi

if ! docker_ok; then
	log "ERROR: A Typesense host is configured, but docker is not usable on it. Deploy stopped."
	exit 1
fi

deploy_here
