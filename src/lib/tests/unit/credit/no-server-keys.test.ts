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

	it('stays peer-to-peer with no treasury, KYC hook, or house key', () => {
		const roots = ['src/lib/credit', 'src/lib/components/credit', 'src/routes/(app)/credit'];
		const files = roots.flatMap((root) => walk(root)).filter((path) => !path.endsWith('.test.ts'));
		const banned = [
			/treasury/i,
			/\bkyc\b/i,
			/sumsub/i,
			/jumio/i,
			/onfido/i,
			/houseLender/i,
			/identity document/i
		];
		for (const path of files) {
			const text = readFileSync(path, 'utf8');
			for (const pattern of banned) {
				expect(text, path).not.toMatch(pattern);
			}
		}
		const roles = readFileSync('src/lib/credit/types.ts', 'utf8');
		expect(roles).toContain("export type CreditPartyRole = 'worker' | 'lender' | 'hirer'");
		const phase2 = readFileSync('src/lib/credit/phase2/collateralLoan.ts', 'utf8');
		expect(phase2).toContain('cannot spend alone');
		expect(phase2).toContain('not-implemented');
	});
});
