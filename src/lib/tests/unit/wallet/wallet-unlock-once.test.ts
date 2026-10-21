import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('wallet unlock control', () => {
	it('shows one unlock button when the simple wallet and its details are both open', () => {
		const page = readFileSync('src/routes/(app)/(protected)/wallet/+page.svelte', 'utf8');
		const mounts = page.match(/testId="unlock-wallet"/g)?.length ?? 0;
		expect(mounts).toBe(2);
		expect(page).toContain('{#if !advanced}');
		expect(page).toContain('{#if $walletStore.locked}');
		// Advanced mode hides the simple wallet, so this copy is not on screen with it.
		expect(page).toContain('{#if advanced && $walletStore.locked}');
	});
});
