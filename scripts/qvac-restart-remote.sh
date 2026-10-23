#!/usr/bin/env bash
# Runs on the QVAC VPS as root. The live process is systemd unit qvac,
# user qvac, app directory /opt/qvac/app, Node at /opt/qvac/node/bin/node.
# Backs up the app directory, installs as qvac with that npm, then restarts
# the unit. Does not print tokens, prompts, or the process environment.
set +x
set -euo pipefail

if [ "${CI_DEBUG_TRACE:-}" = "true" ]; then
	printf '%s\n' "Refusing to restart QVAC while CI_DEBUG_TRACE is true."
	exit 1
fi

if [ "$(id -u)" -ne 0 ]; then
	printf '%s\n' "Run this as root: sudo bash scripts/qvac-restart-remote.sh"
	exit 1
fi

app="/opt/qvac/app"
node_bin="/opt/qvac/node/bin/node"
npm_bin="/opt/qvac/node/bin/npm"
qvac_user="qvac"

if [ ! -d "$app" ]; then
	printf '%s\n' "Missing ${app}. Copy qvac.config.json, package.json, and server.mjs there first."
	exit 1
fi
if [ ! -x "$node_bin" ] || [ ! -x "$npm_bin" ]; then
	printf '%s\n' "Missing ${node_bin} or ${npm_bin}."
	exit 1
fi
if ! id "$qvac_user" >/dev/null 2>&1; then
	printf '%s\n' "User qvac does not exist."
	exit 1
fi
if ! systemctl cat qvac >/dev/null 2>&1; then
	printf '%s\n' "systemd unit qvac is not installed."
	exit 1
fi

qvac_home="$(getent passwd "$qvac_user" | cut -d: -f6)"
if [ -z "$qvac_home" ]; then
	printf '%s\n' "User qvac has no home directory."
	exit 1
fi

(
	cd "$app"
	"$node_bin" --input-type=module -e '
import { readFileSync } from "node:fs";
const config = JSON.parse(readFileSync("qvac.config.json", "utf8"));
const models = config.serve && config.serve.models;
if (!models || !models.embed || !models.ocr) process.exit(1);
const ocr = String(models.ocr.model || "");
const localEmbed = "/opt/qvac/models/embeddinggemma-300m-Q4_0.gguf";
const constantEmbed = String(models.embed.model || "") === "EMBEDDINGGEMMA_300M_Q4_0" && !models.embed.src;
const fileEmbed = !models.embed.model && models.embed.src === localEmbed && models.embed.type === "llamacpp-embedding";
if ((!constantEmbed && !fileEmbed) || ocr !== "OCR_LATIN") process.exit(1);
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const cli = String(pkg.dependencies && pkg.dependencies["@qvac/cli"] || "");
if (cli !== "0.16.0") process.exit(1);
'
)

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup="/opt/qvac/backups/app-${stamp}"
mkdir -p "$backup"
tar -C "$app" --exclude=node_modules -cf - . | tar -C "$backup" -xf -
printf '%s\n' "Backed up ${app} to ${backup}. node_modules was left out because npm install replaces it."

chown "$qvac_user:$qvac_user" \
	"$app/package.json" \
	"$app/server.mjs" \
	"$app/qvac.config.json"
if [ -d "$app/node_modules" ]; then
	chown -R "$qvac_user:$qvac_user" "$app/node_modules"
fi
install -d -o "$qvac_user" -g "$qvac_user" /opt/qvac/npm-cache

printf '%s\n' "Installing QVAC as user qvac with ${npm_bin}."
sudo -u "$qvac_user" -H env \
	HOME="$qvac_home" \
	PATH="/opt/qvac/node/bin:/usr/bin:/bin" \
	npm_config_cache="/opt/qvac/npm-cache" \
	"$npm_bin" install --omit=dev --prefix "$app"

printf '%s\n' "Restarting systemd unit qvac."
systemctl restart qvac

ready=0
for _ in $(seq 1 90); do
	if bash -c 'echo >/dev/tcp/127.0.0.1/11434' >/dev/null 2>&1; then
		ready=1
		break
	fi
	sleep 2
done
if [ "$ready" -ne 1 ]; then
	printf '%s\n' "qvac did not listen on 127.0.0.1:11434 after systemctl restart qvac."
	printf '%s\n' "The app backup is ${backup}. Read the unit log with: journalctl -u qvac -n 80 --no-pager"
	exit 1
fi
printf '%s\n' "qvac.service is listening on 127.0.0.1:11434."
