import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const FORBIDDEN = /Rootstock|rBTC|RBTC|\bBoltz\b|Breez|MetaMask|WalletConnect|smart contract|contrato inteligente/i;

function jsonValues(node: unknown, out: string[]): void {
	if (typeof node === 'string') out.push(node);
	else if (Array.isArray(node)) node.forEach((item) => jsonValues(item, out));
	else if (node && typeof node === 'object') {
		for (const value of Object.values(node)) jsonValues(value, out);
	}
}

function walk(dir: string, acc: string[]): void {
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) walk(path, acc);
		else if (name.endsWith('.json')) acc.push(path);
	}
}

describe('user-facing copy', () => {
	it('does not describe the old Rootstock, rBTC, or Boltz stack', () => {
		const files: string[] = [];
		walk('static/locales', files);
		const hits: string[] = [];
		for (const file of files) {
			const values: string[] = [];
			jsonValues(JSON.parse(readFileSync(file, 'utf8')), values);
			for (const value of values) {
				if (FORBIDDEN.test(value)) hits.push(`${file}: ${value.slice(0, 140)}`);
			}
		}
		expect(hits).toEqual([]);
	});

	it('does not say BitTasker escrow runs on Rootstock', () => {
		const files: string[] = [];
		walk('src/lib/content/taproot', files);
		const claim =
			/BitTasker[^.]{0,220}(Rootstock|RBTC|rBTC|MetaMask|Boltz)|(Rootstock|RBTC|rBTC)[^.]{0,160}BitTasker/i;
		const hits = files
			.filter((file) => file.endsWith('.ts'))
			.flatMap((file) => {
				const text = readFileSync(file, 'utf8');
				return claim.test(text) ? [file] : [];
			});
		expect(hits).toEqual([]);
	});
});
