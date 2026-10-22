/**
 * Report whether the QVAC model list includes embed and ocr.
 * Prints those two lines only. The response body stays in the file.
 */
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
	process.stderr.write('Missing model list file.\n');
	process.exit(1);
}

/** @param {unknown} body */
function modelIds(body) {
	const rows = Array.isArray(body)
		? body
		: body && typeof body === 'object'
			? /** @type {{ data?: unknown, models?: unknown }} */ (body).data ||
				/** @type {{ models?: unknown }} */ (body).models ||
				[]
			: [];
	if (!Array.isArray(rows)) return [];
	return rows
		.map((row) => {
			if (!row || typeof row !== 'object') return '';
			const record = /** @type {{ id?: unknown, name?: unknown, alias?: unknown }} */ (row);
			return String(record.id || record.name || record.alias || '');
		})
		.filter(Boolean);
}

let ids = [];
try {
	ids = modelIds(JSON.parse(readFileSync(file, 'utf8')));
} catch {
	ids = [];
}

const embed = ids.includes('embed');
const ocr = ids.includes('ocr');
process.stdout.write(embed ? 'embed present\n' : 'embed missing\n');
process.stdout.write(ocr ? 'ocr present\n' : 'ocr missing\n');
if (!embed || !ocr) process.exit(1);
