/**
 * Starts `qvac serve --openai` on loopback.
 * Prints short lifecycle lines only, so a prompt or a transcript cannot land in the log.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const bin = path.join(root, 'node_modules', '.bin', 'qvac');
const child = spawn(bin, ['serve', '--openai', '--host', '127.0.0.1', '--port', '11434'], {
	cwd: root,
	stdio: ['ignore', 'pipe', 'pipe'],
	env: process.env
});

const allowed = /listening|started|ready|preload|loaded|exit|EADDRINUSE|error|warn|11434|model/i;

function emit(line) {
	const trimmed = line.trim();
	if (!trimmed || trimmed.length > 160) return;
	if (/content|prompt|messages|transcript|translation|text"/i.test(trimmed)) return;
	if (!allowed.test(trimmed)) return;
	process.stdout.write(`[qvac] ${trimmed}\n`);
}

function attach(stream) {
	let buffer = '';
	stream.on('data', (chunk) => {
		buffer += chunk.toString('utf8');
		const lines = buffer.split(/\n/);
		buffer = lines.pop() || '';
		for (const line of lines) emit(line);
	});
}

attach(child.stdout);
attach(child.stderr);

child.on('exit', (code) => {
	process.stdout.write(`[qvac] exit ${code ?? 0}\n`);
	process.exit(code ?? 0);
});

child.on('error', () => {
	process.stderr.write('[qvac] the qvac binary is missing. Run npm install in services/qvac.\n');
	process.exit(1);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
	process.on(signal, () => child.kill(signal));
}
