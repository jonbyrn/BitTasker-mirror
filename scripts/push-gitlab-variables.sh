#!/usr/bin/env bash
# Push key=value pairs from a local .env file into GitLab CI/CD variables (project scope).
#
# Visibility: keys listed under [env.*.vars] in wrangler.toml are pushed visible; all
# other keys are masked (or file type when masking is not possible).
# Every variable is marked protected (-p) and not expanded (-r / raw).
#
# Only keys present in the .env file are pushed. At the end, wrangler public keys
# missing from the .env file are listed (add them locally before re-running).
#
# Requires: glab auth login (or GITLAB_TOKEN + glab configured)
#
# Examples:
#   ./scripts/push-gitlab-variables.sh --scope development --file .env.development
#   ./scripts/push-gitlab-variables.sh --scope production --file .env
#   ./scripts/push-gitlab-variables.sh --scope production --file .env --dry-run
#
set -euo pipefail

SCOPE="*"
ENV_FILE=""
REPO=""
WRANGLER_FILE=""
DRY_RUN=0

usage() {
	sed -n '2,16p' "$0"
	exit "${1:-0}"
}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

while [[ $# -gt 0 ]]; do
	case "$1" in
		-s | --scope)
			SCOPE="$2"
			shift 2
			;;
		-f | --file)
			ENV_FILE="$2"
			shift 2
			;;
		-R | --repo)
			REPO="$2"
			shift 2
			;;
		-w | --wrangler)
			WRANGLER_FILE="$2"
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

if [[ -z "$ENV_FILE" ]]; then
	echo "ERROR: --file is required" >&2
	usage 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
	echo "ERROR: file not found: $ENV_FILE" >&2
	exit 1
fi

WRANGLER_FILE="${WRANGLER_FILE:-$ROOT_DIR/wrangler.toml}"
if [[ ! -f "$WRANGLER_FILE" ]]; then
	echo "ERROR: wrangler.toml not found: $WRANGLER_FILE" >&2
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

# Keys that belong in git only or local dev — never push to GitLab.
SKIP_KEYS='^(TEST_NOSTR_KEY|NSEC_|MNEMONIC|SEED_)'

declare -a PUBLIC_KEYS=()
declare -a ENV_KEYS=()
declare -a FAILED_KEYS=()
declare -a SKIPPED_EMPTY=()
declare -a MISSING_WRANGLER=()

wrangler_section_for_scope() {
	case "$1" in
		development | dev) printf '%s' 'env.dev.vars' ;;
		production | prod) printf '%s' 'env.production.vars' ;;
		staging) printf '%s' 'env.staging.vars' ;;
		*) printf '%s' '' ;;
	esac
}

load_wrangler_public_keys() {
	local target_section
	target_section="$(wrangler_section_for_scope "$SCOPE")"
	PUBLIC_KEYS=()

	local in_section=0
	local current_section=""
	local line key

	while IFS= read -r line || [[ -n "$line" ]]; do
		if [[ "$line" =~ ^\[env\.[^.]+\.vars\]$ ]]; then
			current_section="${line#\[}"
			current_section="${current_section%\]}"
			if [[ -z "$target_section" ]] || [[ "$current_section" == "$target_section" ]]; then
				in_section=1
			else
				in_section=0
			fi
			continue
		fi

		if [[ "$line" =~ ^\[ ]]; then
			in_section=0
			continue
		fi

		if [[ $in_section -eq 1 ]] && [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*[[:space:]]*= ]]; then
			key="${line%%=*}"
			key="${key// /}"
			PUBLIC_KEYS+=("$key")
		fi
	done < "$WRANGLER_FILE"
}

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

is_public_key() {
	list_has_key "$1" "${PUBLIC_KEYS[@]}"
}

# GitLab masked vars: single line, length >= 8, limited charset.
can_mask_value() {
	local value="$1"
	[[ "$value" != *$'\n'* ]] || return 1
	(( ${#value} >= 8 )) || return 1
	[[ "$value" =~ ^[A-Za-z0-9+/=@:.,_-]+$ ]]
}

var_visibility() {
	local key="$1" value="$2"
	if is_public_key "$key"; then
		printf '%s' 'public'
	elif [[ "$value" == *$'\n'* ]]; then
		printf '%s' 'file'
	elif can_mask_value "$value"; then
		printf '%s' 'masked'
	else
		printf '%s' 'protected'
	fi
}

upsert_var() {
	local key="$1" value="$2"
	local visibility
	local -a extra=(-p -r)

	visibility="$(var_visibility "$key" "$value")"
	if [[ "$visibility" == "file" ]]; then
		extra+=(-t file)
	elif [[ "$visibility" == "masked" ]]; then
		extra+=(-m)
	fi

	if [[ "$DRY_RUN" -eq 1 ]]; then
		printf '[dry-run] %s visibility=%s protected=1 raw=1\n' "$key" "$visibility"
		return 0
	fi

	if glab variable update "$key" -v "$value" -s "$SCOPE" -R "$REPO" "${extra[@]}" 2>/dev/null; then
		printf 'updated %s (%s)\n' "$key" "$visibility"
		return 0
	fi

	if glab variable set "$key" -v "$value" -s "$SCOPE" -R "$REPO" "${extra[@]}" >/dev/null 2>&1; then
		printf 'created %s (%s)\n' "$key" "$visibility"
		return 0
	fi

	printf 'FAILED %s (check glab auth or GitLab variable constraints)\n' "$key" >&2
	FAILED_KEYS+=("$key")
	return 0
}

strip_quotes() {
	local v="$1"
	v="${v#"${v%%[![:space:]]*}"}"
	v="${v%"${v##*[![:space:]]}"}"
	if [[ "$v" == \"*\" && "$v" == *\" ]]; then
		v="${v:1:${#v}-2}"
	elif [[ "$v" == \'*\' && "$v" == *\' ]]; then
		v="${v:1:${#v}-2}"
	fi
	printf '%s' "$v"
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

report_missing_wrangler_keys() {
	local key
	(( ${#PUBLIC_KEYS[@]} > 0 )) || return 0
	for key in "${PUBLIC_KEYS[@]}"; do
		if ! list_has_key "$key" ${ENV_KEYS[@]+"${ENV_KEYS[@]}"}; then
			MISSING_WRANGLER+=("$key")
		fi
	done
}

load_wrangler_public_keys
verify_gitlab_repo

echo "Repo: $REPO  Scope: $SCOPE  File: $ENV_FILE"
echo "Wrangler public keys for scope ($(wrangler_section_for_scope "$SCOPE")): ${#PUBLIC_KEYS[@]}"

pushed=0

while IFS= read -r line || [[ -n "$line" ]]; do
	line="${line%%#*}"
	line="${line#"${line%%[![:space:]]*}"}"
	[[ -z "$line" ]] && continue
	[[ "$line" != *=* ]] && continue

	key="${line%%=*}"
	key="${key#export }"
	key="${key// /}"

	value="${line#*=}"
	value="$(strip_quotes "$value")"

	[[ -z "$key" ]] && continue
	[[ "$key" =~ $SKIP_KEYS ]] && continue

	if [[ -z "$value" ]]; then
		SKIPPED_EMPTY+=("$key")
		continue
	fi

	ENV_KEYS+=("$key")
	upsert_var "$key" "$value"
	pushed=$((pushed + 1))
done < "$ENV_FILE"

report_missing_wrangler_keys

echo ""
echo "Summary: $pushed variable(s) pushed from $ENV_FILE"

if [[ ${#SKIPPED_EMPTY[@]} -gt 0 ]]; then
	echo ""
	echo "Skipped (empty value in $ENV_FILE — set a value and re-run):"
	printf '  %s\n' "${SKIPPED_EMPTY[@]}"
fi

if [[ ${#MISSING_WRANGLER[@]} -gt 0 ]]; then
	echo ""
	echo "Missing from $ENV_FILE (wrangler public keys for scope $SCOPE — add to .env and re-run):"
	printf '  %s\n' "${MISSING_WRANGLER[@]}"
fi

if [[ ${#FAILED_KEYS[@]} -gt 0 ]]; then
	echo ""
	echo "Failed to push (${#FAILED_KEYS[@]}):"
	printf '  %s\n' "${FAILED_KEYS[@]}"
	exit 1
fi

exit 0
