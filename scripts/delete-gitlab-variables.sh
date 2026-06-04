#!/usr/bin/env bash
# Delete GitLab CI/CD variables whose keys appear in a local file.
#
# Accepts the same key formats as push-gitlab-variables.sh:
#   KEY=value lines (.env), export KEY=value, or one KEY per line.
# Only keys listed in the file are deleted; missing variables are reported, not failed.
#
# Requires: glab auth login (or GITLAB_TOKEN + glab configured)
#
# Examples:
#   ./scripts/delete-gitlab-variables.sh --scope production --file .env
#   ./scripts/delete-gitlab-variables.sh --scope development --file .env.development --dry-run
#
set -euo pipefail

SCOPE="*"
KEYS_FILE=""
REPO=""
DRY_RUN=0

usage() {
	sed -n '2,13p' "$0"
	exit "${1:-0}"
}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

while [[ $# -gt 0 ]]; do
	case "$1" in
		-s | --scope)
			SCOPE="$2"
			shift 2
			;;
		-f | --file)
			KEYS_FILE="$2"
			shift 2
			;;
		-R | --repo)
			REPO="$2"
			shift 2
			;;
		--dry-run)
			DRY_RUN=1
			shift
			;;
		-h | --help)
			usage 0
			;;
		*)
			echo "Unknown option: $1" >&2
			usage 1
			;;
	esac
done

if [[ -z "$KEYS_FILE" ]]; then
	echo "ERROR: --file is required" >&2
	usage 1
fi

if [[ ! -f "$KEYS_FILE" ]]; then
	echo "ERROR: file not found: $KEYS_FILE" >&2
	exit 1
fi

if ! command -v glab >/dev/null 2>&1; then
	echo "ERROR: glab not found. Install: https://gitlab.com/gitlab-org/cli" >&2
	exit 1
fi

parse_gitlab_repo() {
	local url="$1"
	url="${url%.git}"
	url="${url#git@gitlab.com:}"
	url="${url#ssh://git@gitlab.com/}"
	url="${url#https://gitlab.com/}"
	url="${url#http://gitlab.com/}"
	printf '%s' "$url"
}

if [[ -z "$REPO" ]]; then
	if git remote get-url origin >/dev/null 2>&1; then
		REPO="$(parse_gitlab_repo "$(git remote get-url origin)")"
	fi
	REPO="${REPO:-bittasker/BitTasker}"
fi

declare -a SEEN_KEYS=()
declare -a DELETED_KEYS=()
declare -a NOT_FOUND_KEYS=()
declare -a FAILED_KEYS=()
declare -a DUPLICATE_KEYS=()

list_has_key() {
	local want="$1"
	shift
	(( $# > 0 )) || return 1
	local item
	for item in "$@"; do
		[[ "$item" == "$want" ]] && return 0
	done
	return 1
}

parse_key_line() {
	local line="$1"
	local key

	line="${line%%#*}"
	line="${line#"${line%%[![:space:]]*}"}"
	line="${line%"${line##*[![:space:]]}"}"
	[[ -z "$line" ]] && return 1

	if [[ "$line" == *=* ]]; then
		key="${line%%=*}"
	else
		key="$line"
	fi

	key="${key#export }"
	key="${key// /}"
	[[ -z "$key" ]] && return 1
	printf '%s' "$key"
}

verify_gitlab_repo() {
	if [[ "$DRY_RUN" -eq 1 ]]; then
		return 0
	fi
	if glab repo view -R "$REPO" >/dev/null 2>&1; then
		return 0
	fi
	echo "ERROR: GitLab project not found: $REPO" >&2
	echo "  Run: glab auth login" >&2
	echo "  Or pass: --repo owner/project (without .git suffix)" >&2
	exit 1
}

delete_var() {
	local key="$1"

	if [[ "$DRY_RUN" -eq 1 ]]; then
		printf '[dry-run] delete %s scope=%s\n' "$key" "$SCOPE"
		DELETED_KEYS+=("$key")
		return 0
	fi

	if glab variable delete "$key" -s "$SCOPE" -R "$REPO" >/dev/null 2>&1; then
		printf 'deleted %s\n' "$key"
		DELETED_KEYS+=("$key")
		return 0
	fi

	local err
	err="$(glab variable delete "$key" -s "$SCOPE" -R "$REPO" 2>&1)" || true
	if echo "$err" | grep -qiE '404|not found'; then
		NOT_FOUND_KEYS+=("$key")
		return 0
	fi

	printf 'FAILED %s\n' "$key" >&2
	FAILED_KEYS+=("$key")
	return 0
}

verify_gitlab_repo

echo "Repo: $REPO  Scope: $SCOPE  File: $KEYS_FILE"

while IFS= read -r line || [[ -n "$line" ]]; do
	key="$(parse_key_line "$line" || true)"
	[[ -z "$key" ]] && continue

	if list_has_key "$key" ${SEEN_KEYS[@]+"${SEEN_KEYS[@]}"}; then
		DUPLICATE_KEYS+=("$key")
		continue
	fi

	SEEN_KEYS+=("$key")
	delete_var "$key"
done < "$KEYS_FILE"

echo ""
echo "Summary: ${#SEEN_KEYS[@]} key(s) from $KEYS_FILE"

if [[ ${#DELETED_KEYS[@]} -gt 0 ]]; then
	echo "Deleted (or dry-run): ${#DELETED_KEYS[@]}"
fi

if [[ ${#NOT_FOUND_KEYS[@]} -gt 0 ]]; then
	echo ""
	echo "Not found in GitLab (scope $SCOPE — already absent or different scope):"
	printf '  %s\n' "${NOT_FOUND_KEYS[@]}"
fi

if [[ ${#DUPLICATE_KEYS[@]} -gt 0 ]]; then
	echo ""
	echo "Skipped duplicate keys in file:"
	printf '  %s\n' "${DUPLICATE_KEYS[@]}"
fi

if [[ ${#FAILED_KEYS[@]} -gt 0 ]]; then
	echo ""
	echo "Failed to delete (${#FAILED_KEYS[@]}):"
	printf '  %s\n' "${FAILED_KEYS[@]}"
	exit 1
fi

exit 0
