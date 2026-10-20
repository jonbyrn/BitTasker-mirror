import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function walk(dir: string): string[] {
	const found: string[] = [];
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		const stat = statSync(path);
		if (stat.isDirectory()) found.push(...walk(path));
		else found.push(path);
	}
	return found;
}

describe('credit custody boundary', () => {
	it('keeps credit keys out of server routes', () => {
		const serverFiles = walk('src/routes').filter(
			(path) => path.includes('+server.') || path.includes('.server.')
		);
		expect(serverFiles.length).toBeGreaterThan(0);
		for (const path of serverFiles) {
			const text = readFileSync(path, 'utf8');
			expect(text.includes('$lib/credit')).toBe(false);
			expect(text.includes('nsec1')).toBe(false);
			expect(text.toLowerCase().includes('mnemonic')).toBe(false);
		}
	});

	it('does not persist test keys outside session storage or send them', () => {
		const session = readFileSync('src/lib/credit/session.ts', 'utf8');
		expect(/localStorage\s*[.[]/.test(session)).toBe(false);
		expect(session.includes('fetch(')).toBe(false);
		expect(session.includes('sessionStorage')).toBe(true);
		const creditFiles = walk('src/lib/credit');
		expect(creditFiles.some((path) => path.includes('+server'))).toBe(false);
	});
});
