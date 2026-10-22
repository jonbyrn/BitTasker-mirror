import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DATE_PATTERNS = [
	/Nov(?:ember)?\.?\s*1\b/i,
	/Nov(?:ember)?\.?\s*28\b/i,
	/\b1\s+de\s+noviembre\b/i,
	/\b28\s+de\s+noviembre\b/i,
	/fecha de lanzamiento/i,
	/\blaunch date\b/i
];

function filesUnder(dir: string, extension: string): string[] {
	const found: string[] = [];
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) found.push(...filesUnder(path, extension));
		else if (path.endsWith(extension)) found.push(path);
	}
	return found;
}

describe('public copy has no launch date', () => {
	const localeFiles = [
		...filesUnder('static/locales/en', '.json'),
		...filesUnder('static/locales/es', '.json')
	];
	const storeFiles = filesUnder('fastlane/metadata/android', '.txt');

	it('does not mention Nov 1, Nov 28, or a launch date in EN/ES copy or the Android listing', () => {
		const hits: string[] = [];
		for (const path of [...localeFiles, ...storeFiles]) {
			const text = readFileSync(path, 'utf8');
			for (const pattern of DATE_PATTERNS) {
				if (pattern.test(text)) hits.push(`${path}: ${pattern}`);
			}
		}
		expect(hits).toEqual([]);
	});

	it('describes USDT as coming soon and does not say USDT payments are live', () => {
		const homeEn = readFileSync('static/locales/en/home.json', 'utf8');
		const homeEs = readFileSync('static/locales/es/home.json', 'utf8');
		expect(homeEn).toContain('Bitcoin at launch, USDT coming soon');
		expect(homeEs).toContain('Bitcoin en el lanzamiento, USDT próximamente');
		expect(homeEn).not.toContain('Bitcoin or USDT');
		expect(homeEs).not.toContain('Bitcoin o USDT');

		const publicFiles = [...localeFiles, ...storeFiles].filter(
			(path) => !path.includes('/dashboard/')
		);
		const liveClaims = publicFiles.filter((path) => {
			const text = readFileSync(path, 'utf8');
			return /Bitcoin or USDT|Bitcoin, rBTC, and USDT|Bitcoin o USDT|Bitcoin, rBTC y USDT/.test(
				text
			);
		});
		expect(liveClaims).toEqual([]);
	});
});
