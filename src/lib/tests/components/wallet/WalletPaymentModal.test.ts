import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import { readable } from 'svelte/store';
import WalletPaymentModal from '$lib/components/wallet/WalletPaymentModal.svelte';

vi.mock('svelte-i18n', async () => {
	const { readable: readableStore } = await import('svelte/store');
	return { t: readableStore((key: string) => key), locale: readableStore('en') };
});

vi.mock('$lib/stores/wallet.store', () => ({
	walletStore: readable({ error: '', isConnected: true, isInitializing: false })
}));

describe('WalletPaymentModal sheet', () => {
	it('covers the bottom nav instead of sharing its stacking level', () => {
		const { getByTestId } = render(WalletPaymentModal, {
			props: { isOpen: true, onClose: () => {}, sheet: true }
		});

		const layer = getByTestId('wallet-sheet-layer');
		const sheet = getByTestId('wallet-sheet');
		expect(Number.parseInt(layer.style.zIndex, 10)).toBeGreaterThan(100);
		expect(sheet.className).toContain('max-h-');
		const content = sheet.querySelector('.wallet-sheet-content');
		expect(content).toBeTruthy();
		expect((content as HTMLElement).className).toContain('wallet-sheet-content');
	});
});
