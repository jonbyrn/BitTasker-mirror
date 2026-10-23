#!/usr/bin/env bash
# Runs as root on the BitTasker QVAC VPS. Downloads the ungated
# EmbeddingGemma 300M Q4_0 GGUF into /opt/qvac/models so the embed alias
# can load it from disk. No Hugging Face token is sent. A hash mismatch
# deletes the temp file and leaves any previous model in place.
set +x
set -euo pipefail

if [ "${CI_DEBUG_TRACE:-}" = "true" ]; then
	printf '%s\n' "Refusing to fetch the embed model while CI_DEBUG_TRACE is true."
	exit 1
fi

if [ "$(id -u)" -ne 0 ]; then
	printf '%s\n' "Run this as root: sudo bash scripts/qvac-fetch-embed-model.sh"
	exit 1
fi

host_ips="$(hostname -I 2>/dev/null || true)"
if printf '%s\n' "$host_ips" | grep -F '65.49.60.206' >/dev/null 2>&1; then
	printf '%s\n' "Refusing to fetch the embed model on this host."
	exit 1
fi

unset HF_TOKEN HUGGING_FACE_HUB_TOKEN HF_HUB_TOKEN

dest_dir="/opt/qvac/models"
dest="${dest_dir}/embeddinggemma-300m-Q4_0.gguf"
expected="edc6015cb15694c27be7d1d33f1bc015db9a358ff51ed524628c027504907ba9"
revision="6661a6504c30d8304af13455cb4a5d4f5bc6011f"
url="https://huggingface.co/unsloth/embeddinggemma-300m-GGUF/resolve/${revision}/embeddinggemma-300m-Q4_0.gguf"

install -d -o qvac -g qvac /opt/qvac/models

if [ -f "$dest" ]; then
	current="$(sha256sum "$dest" | awk 'NR==1 { print $1 }')"
	if [ "$current" = "$expected" ]; then
		chown qvac:qvac "$dest"
		printf '%s\n' "Installed ${dest}."
		exit 0
	fi
fi

tmp="$(mktemp "${dest_dir}/.embeddinggemma-300m-Q4_0.gguf.XXXXXX")"
cleanup() {
	if [ -n "${tmp:-}" ] && [ -f "$tmp" ]; then
		rm -f "$tmp"
	fi
}
trap cleanup EXIT

curl -q --fail --location --silent --show-error \
	--proto '=https' --proto-redir '=https' \
	--retry 5 --retry-delay 2 \
	-o "$tmp" \
	"$url"

actual="$(sha256sum "$tmp" | awk 'NR==1 { print $1 }')"
if [ "$actual" != "$expected" ]; then
	printf '%s\n' "sha256 mismatch for embeddinggemma-300m-Q4_0.gguf."
	printf '%s\n' "Expected ${expected}."
	printf '%s\n' "Got ${actual}."
	exit 1
fi

mv -f "$tmp" "$dest"
tmp=""
chown qvac:qvac "$dest"
chmod 644 "$dest"
printf '%s\n' "Installed ${dest}."
