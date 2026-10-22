#!/usr/bin/env bash
# Generate one assistant key for this environment and store it with wrangler.
# The nsec is piped on stdin. The log gets the npub only.
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
nsec_file="$(mktemp)"
chmod 600 "$nsec_file"
trap 'rm -f "$nsec_file"' EXIT

npub="$(node "$root/scripts/qvac-assistant-key.mjs" "$nsec_file")"
case "$npub" in
	npub1*) ;;
	*)
		printf '%s\n' "The key script did not return an npub."
		exit 1
		;;
esac
printf '%s\n' "Replacing ASSISTANT_NSEC on wrangler env ${wrangler_env}."
printf '%s\n' "assistant npub: ${npub}"

WRANGLER_LOG=error npx wrangler secret put ASSISTANT_NSEC --env "$wrangler_env" <"$nsec_file"
rm -f "$nsec_file"
trap - EXIT
printf '%s\n' "ASSISTANT_NSEC stored. The secret was not printed."
