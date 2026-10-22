#!/usr/bin/env node
/**
 * Read one QVAC or Ollama JSON body and print a short fact.
 * names: one model name per line
 * dim: the first vector width, or none
 * status: the status field, or none
 * The vector itself is not printed.
 */
import { readFileSync } from 'node:fs';

const mode = process.argv[2];
const file = process.argv[3];
if (!mode || !file) {
	process.stderr.write('Usage: qvac-embed-body.mjs names|dim|status file\n');
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

let body;
try {
	body = JSON.parse(readFileSync(file, 'utf8'));
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
process.stderr.write('Unknown mode.\n');
process.exit(1);
