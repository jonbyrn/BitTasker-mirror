#!/usr/bin/env node
/**
 * Read one QVAC or Ollama JSON body and print a short fact.
 * names: one model name per line
 * dim: the first vector width, or none
 * status: the status field, or none
 * note: one short error line, with no vector and no bearer token
 * The vector itself is not printed.
 */
import { readFileSync } from 'node:fs';

const mode = process.argv[2];
const file = process.argv[3];
if (!mode || !file) {
	process.stderr.write('Usage: qvac-embed-body.mjs names|dim|status|note file\n');
	process.exit(1);
}

/** @param {unknown} body */
function names(body) {
	if (!body || typeof body !== 'object') return [];
	const record = /** @type {{ models?: unknown, data?: unknown }} */ (body);
	const rows = Array.isArray(record.models)
		? record.models
		: Array.isArray(record.data)
			? record.data
			: [];
	return rows
		.map((row) => {
			if (!row || typeof row !== 'object') return '';
			const item = /** @type {{ name?: unknown, model?: unknown, id?: unknown }} */ (row);
			return String(item.name || item.model || item.id || '');
		})
		.filter(Boolean);
}

/** @param {unknown} value */
function width(value) {
	if (!Array.isArray(value) || value.length === 0) return 0;
	if (typeof value[0] === 'number') return value.length;
	if (Array.isArray(value[0]) && typeof value[0][0] === 'number') return value[0].length;
	return 0;
}

/** @param {unknown} body */
function dimension(body) {
	if (!body || typeof body !== 'object') return 0;
	const record = /** @type {{ embeddings?: unknown, embedding?: unknown, data?: unknown }} */ (
		body
	);
	const fromEmbeddings = width(record.embeddings);
	if (fromEmbeddings) return fromEmbeddings;
	const fromEmbedding = width(record.embedding);
	if (fromEmbedding) return fromEmbedding;
	if (Array.isArray(record.data) && record.data[0] && typeof record.data[0] === 'object') {
		const row = /** @type {{ embedding?: unknown }} */ (record.data[0]);
		return width(row.embedding);
	}
	return 0;
}

const raw = readFileSync(file, 'utf8');

/** @param {string} text */
function redact(text) {
	return text
		.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
		.replace(/authorization:\s*\S+/gi, 'authorization: [redacted]')
		.replace(/nsec1[0-9a-z]+/gi, '[redacted]');
}

/** @param {string} text */
function clip(text) {
	const flat = redact(text).replace(/\s+/g, ' ').trim();
	if (!flat) return '(empty body)';
	return flat.length > 400 ? `${flat.slice(0, 400)}…` : flat;
}

/**
 * One line an operator can read. A vector body reports its width only.
 * @param {string} source
 * @param {unknown} parsed
 */
function note(source, parsed) {
	if (parsed && typeof parsed === 'object') {
		const record = /** @type {{ error?: unknown, message?: unknown }} */ (parsed);
		const error = record.error;
		const message =
			typeof error === 'string'
				? error
				: error && typeof error === 'object' && 'message' in error
					? String(/** @type {{ message?: unknown }} */ (error).message || '')
					: typeof record.message === 'string'
						? record.message
						: '';
		if (message) return clip(message);
		const dim = dimension(parsed);
		if (dim) return `embedding body dim=${dim}`;
	}
	return clip(source);
}

let body;
try {
	body = JSON.parse(raw);
} catch {
	body = null;
}

if (mode === 'names') {
	process.stdout.write(names(body).join('\n'));
	process.exit(0);
}
if (mode === 'dim') {
	const dim = dimension(body);
	process.stdout.write(dim ? String(dim) : 'none');
	process.exit(0);
}
if (mode === 'status') {
	const status =
		body && typeof body === 'object' && 'status' in body ? String(body.status || '') : '';
	process.stdout.write(status || 'none');
	process.exit(0);
}
if (mode === 'note') {
	process.stdout.write(`${note(raw, body)}\n`);
	process.exit(0);
}
process.stderr.write('Unknown mode.\n');
process.exit(1);
