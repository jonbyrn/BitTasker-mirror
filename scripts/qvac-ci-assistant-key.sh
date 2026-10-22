#!/usr/bin/env bash
# Store ASSISTANT_NSEC for this environment. Reuse the existing secret.
# The nsec is piped on stdin. The log gets the npub only after a successful put.
set +x
set -euo pipefail

if [ "${CI_DEBUG_TRACE:-}" = "true" ]; then
	printf '%s\n' "Refusing assistant-key while CI_DEBUG_TRACE is true."
	exit 1
fi

case "${CI_COMMIT_BRANCH:-}" in
	sandbox/rgb-wasm-phase0) wrangler_env="sandbox" ;;
	dev) wrangler_env="dev" ;;
	*)
		printf '%s\n' "assistant-key runs only on sandbox/rgb-wasm-phase0 and dev."
		exit 1
		;;
esac
case "$wrangler_env" in
	sandbox|dev) ;;
	*)
		printf '%s\n' "Refusing to write ASSISTANT_NSEC outside sandbox and dev."
		exit 1
		;;
esac

export CLOUDFLARE_API_TOKEN="${CF_API_TOKEN:-}"
export CLOUDFLARE_ACCOUNT_ID="${CF_ACCOUNT_ID:-}"
case "$CLOUDFLARE_API_TOKEN" in
	''|\$*)
		printf '%s\n' "Missing CLOUDFLARE_API_TOKEN."
		exit 1
		;;
esac
case "$CLOUDFLARE_ACCOUNT_ID" in
	''|\$*)
		printf '%s\n' "Missing CLOUDFLARE_ACCOUNT_ID."
		exit 1
		;;
esac

root="$(cd "$(dirname "$0")/.." && pwd)"
worker_name="$(node "$root/scripts/qvac-worker-name.mjs" "$wrangler_env" "$root/wrangler.toml")"
case "$worker_name" in
	''|bittasker-prod-worker|production)
		printf '%s\n' "Refusing to write ASSISTANT_NSEC without a sandbox or dev worker name."
		exit 1
		;;
esac
printf '%s\n' "Worker ${worker_name} env ${wrangler_env}."

nsec_file=""
list_file=""
log_file=""
cleanup() {
	if [ -n "$nsec_file" ]; then
		rm -f "$nsec_file"
	fi
	if [ -n "$list_file" ]; then
		rm -f "$list_file"
	fi
	if [ -n "$log_file" ]; then
		rm -f "$log_file"
	fi
}
trap cleanup EXIT

secret_listed() {
	node --input-type=module - "$1" <<'JS'
import { readFileSync } from 'node:fs';
const file = process.argv[2];
let body = '';
try {
	body = readFileSync(file, 'utf8');
} catch {
	process.exit(2);
}
try {
	const parsed = JSON.parse(body);
	const rows = Array.isArray(parsed) ? parsed : parsed?.secrets || parsed?.result || [];
	const names = rows.map((row) => (typeof row === 'string' ? row : String(row?.name || '')));
	if (names.includes('ASSISTANT_NSEC')) process.exit(0);
} catch {
	// Fall through to a plain name line. Wrangler error text is not a list.
}
process.exit(body.split('\n').some((line) => line.trim() === 'ASSISTANT_NSEC') ? 0 : 1);
JS
}

print_sanitized() {
	node --input-type=module - "$1" "$2" <<'JS'
import { readFileSync } from 'node:fs';
const log = readFileSync(process.argv[2], 'utf8');
let secret = '';
try {
	secret = readFileSync(process.argv[3], 'utf8').trim();
} catch {
	secret = '';
}
const lines = log.split('\n').filter((line) => {
	if (line.includes('nsec1')) return false;
	if (secret && line.includes(secret)) return false;
	return true;
});
process.stdout.write(lines.join('\n').slice(0, 4000));
if (!log.endsWith('\n')) process.stdout.write('\n');
JS
}

list_file="$(mktemp)"
export CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID
set +e
WRANGLER_LOG=error npx wrangler secret list \
	--name "$worker_name" \
	--env "$wrangler_env" \
	--format json >"$list_file" 2>&1
list_status=$?
set -e
if [ "$list_status" -ne 0 ]; then
	set +e
	WRANGLER_LOG=error npx wrangler versions secret list \
		--name "$worker_name" \
		--env "$wrangler_env" >"$list_file" 2>&1
	list_status=$?
	set -e
fi

if [ "$list_status" -eq 0 ] && secret_listed "$list_file"; then
	printf '%s\n' "ASSISTANT_NSEC already set on ${worker_name}. Keeping the existing key."
	exit 0
fi
if [ "$list_status" -ne 0 ]; then
	printf '%s\n' "Secret list failed. Setting ASSISTANT_NSEC with wrangler versions secret put."
fi

nsec_file="$(mktemp)"
chmod 600 "$nsec_file"
npub="$(node "$root/scripts/qvac-assistant-key.mjs" "$nsec_file")"
case "$npub" in
	npub1*) ;;
	*)
		printf '%s\n' "The key script did not return an npub."
		exit 1
		;;
esac

log_file="$(mktemp)"
set +e
WRANGLER_LOG=error npx wrangler versions secret put ASSISTANT_NSEC \
	--name "$worker_name" \
	--env "$wrangler_env" <"$nsec_file" >"$log_file" 2>&1
put_status=$?
set -e
if [ "$put_status" -ne 0 ]; then
	printf '%s\n' "wrangler versions secret put failed. The secret was not printed."
	print_sanitized "$log_file" "$nsec_file"
	exit 1
fi
printf '%s\n' "assistant npub: ${npub}"
printf '%s\n' "ASSISTANT_NSEC stored on ${worker_name}. The secret was not printed."
