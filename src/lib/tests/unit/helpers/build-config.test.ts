import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('build config', () => {
	it('does not ship the MetaMask multichain SDK in the app bundle', async () => {
		const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
		const deps = pkg.dependencies ?? {};

		expect(deps['@metamask/connect-multichain']).toBeUndefined();
	});
});