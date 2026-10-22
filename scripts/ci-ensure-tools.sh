#!/usr/bin/env bash
# Install the named commands when they are missing.
# Debian images use apt-get. Alpine images use apk.
set -euo pipefail

if [ "$#" -eq 0 ]; then
	printf '%s\n' "Name the commands to install, for example curl or jq."
	exit 1
fi

missing=()
for cmd in "$@"; do
	if ! command -v "$cmd" >/dev/null 2>&1; then
		missing+=("$cmd")
	fi
done

if [ "${#missing[@]}" -eq 0 ]; then
	exit 0
fi

export DEBIAN_FRONTEND=noninteractive
if command -v apt-get >/dev/null 2>&1; then
	apt-get update -qq
	apt-get install -y -qq ca-certificates "${missing[@]}"
elif command -v apk >/dev/null 2>&1; then
	apk add --no-cache ca-certificates "${missing[@]}"
else
	printf '%s\n' "Cannot install ${missing[*]}: neither apt-get nor apk is available."
	exit 1
fi
