#!/usr/bin/env bash
# Runs on the QVAC host. Restarts the loopback server with the copied config.
# Does not print tokens, prompts, or the process environment.
set +x
set -euo pipefail

if [ "${CI_DEBUG_TRACE:-}" = "true" ]; then
	printf '%s\n' "Refusing to restart QVAC while CI_DEBUG_TRACE is true."
	exit 1
fi

root="/opt/bittasker/qvac"
cd "$root"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
	printf '%s\n' "node and npm are missing on the QVAC host."
	exit 1
fi

node --input-type=module -e '
import { readFileSync } from "node:fs";
const config = JSON.parse(readFileSync("qvac.config.json", "utf8"));
const models = config.serve && config.serve.models;
if (!models || !models.embed || !models.ocr) process.exit(1);
const embed = String(models.embed.model || "");
const ocr = String(models.ocr.model || "");
if (embed !== "EMBEDDINGGEMMA_300M_Q4_0" || ocr !== "OCR_LATIN") process.exit(1);
'

printf '%s\n' "Installing QVAC plugins."
npm install --omit=dev

pid=""
if command -v ss >/dev/null 2>&1; then
	pid="$(ss -ltnp 'sport = :11434' 2>/dev/null | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' | head -1 || true)"
fi
if [ -z "$pid" ] && command -v lsof >/dev/null 2>&1; then
	pid="$(lsof -ti tcp:11434 2>/dev/null | head -1 || true)"
fi

if [ -n "$pid" ]; then
	cmd="$(ps -p "$pid" -o args= 2>/dev/null || true)"
	case "$cmd" in
		*qvac*|*server.mjs*) ;;
		*)
			printf '%s\n' "Port 11434 is not the qvac process. Refusing to stop it."
			exit 1
			;;
	esac
	kill "$pid"
	for _ in 1 2 3 4 5 6 7 8 9 10; do
		if ! kill -0 "$pid" 2>/dev/null; then
			break
		fi
		sleep 1
	done
	if kill -0 "$pid" 2>/dev/null; then
		printf '%s\n' "qvac did not exit after SIGTERM."
		exit 1
	fi
	printf '%s\n' "Stopped the previous qvac process."
else
	printf '%s\n' "No process was listening on 11434."
fi

mkdir -p /var/log /var/run
nohup npm start >/var/log/bittasker-qvac.log 2>&1 &
printf '%s\n' "$!" >/var/run/bittasker-qvac.pid
disown || true

ready=0
for _ in $(seq 1 30); do
	if bash -c 'echo >/dev/tcp/127.0.0.1/11434' >/dev/null 2>&1; then
		ready=1
		break
	fi
	sleep 2
done
if [ "$ready" -ne 1 ]; then
	printf '%s\n' "qvac did not listen on 127.0.0.1:11434 after restart."
	exit 1
fi
printf '%s\n' "qvac restarted."
