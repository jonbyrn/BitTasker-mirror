import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';

// Mock svelte-i18n — t must be a readable store with subscribe()
vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	const tStore = readable((key: string, opts?: { values?: Record<string, unknown> }) => {
		if (opts?.values) {
			let result = key;
			for (const [k, v] of Object.entries(opts.values)) {
				result = result.replace(`{${k}}`, String(v));
			}
			return result;
		}
		return key;
	});
	return {
		t: tStore,
		locale: readable('en'),
		locales: readable(['en', 'es']),
		isLoading: readable(false)
	};
});

// Mock icon components to avoid import/circular issues
const mockIcon = vi.hoisted(() => () => 'svg');
vi.mock('~icons/mdi/lightning-bolt', () => ({ default: mockIcon }));
vi.mock('~icons/mdi/shield-check', () => ({ default: mockIcon }));
vi.mock('~icons/mdi/shield-off', () => ({ default: mockIcon }));
vi.mock('~icons/mdi/send', () => ({ default: mockIcon }));
vi.mock('~icons/mdi/close', () => ({ default: mockIcon }));

import GaslessEnablePrompt from '$lib/components/wallet/GaslessEnablePrompt.svelte';
import GaslessRevokePanel from '$lib/components/wallet/GaslessRevokePanel.svelte';

describe('GaslessEnablePrompt', () => {
	const defaultProps = {
		onEnable: vi.fn(),
		onDismiss: vi.fn(),
		isEnabling: false
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('renders the title', () => {
		const { getByText } = render(GaslessEnablePrompt, { props: defaultProps });
		expect(getByText('wallet.gasless_enable.title')).toBeTruthy();
	});

	it('renders the description', () => {
		const { getByText } = render(GaslessEnablePrompt, { props: defaultProps });
		expect(getByText('wallet.gasless_enable.description')).toBeTruthy();
	});

	it('renders all three benefits', () => {
		const { getByText } = render(GaslessEnablePrompt, { props: defaultProps });
		expect(getByText(/wallet.gasless_enable.benefit_1/)).toBeTruthy();
		expect(getByText(/wallet.gasless_enable.benefit_2/)).toBeTruthy();
		expect(getByText(/wallet.gasless_enable.benefit_3/)).toBeTruthy();
	});

	it('renders the reversible notice', () => {
		const { getByText } = render(GaslessEnablePrompt, { props: defaultProps });
		expect(getByText('wallet.gasless_enable.reversible')).toBeTruthy();
	});

	it('calls onEnable when enable button is clicked', async () => {
		const onEnable = vi.fn();
		const { getByText } = render(GaslessEnablePrompt, {
			props: { ...defaultProps, onEnable }
		});
		await fireEvent.click(getByText('wallet.gasless_enable.enable'));
		expect(onEnable).toHaveBeenCalledOnce();
	});

	it('calls onDismiss when dismiss button is clicked', async () => {
		const onDismiss = vi.fn();
		const { getByText } = render(GaslessEnablePrompt, {
			props: { ...defaultProps, onDismiss }
		});
		await fireEvent.click(getByText('common.not_now'));
		expect(onDismiss).toHaveBeenCalledOnce();
	});

	it('disables buttons when isEnabling is true', () => {
		const { getByText } = render(GaslessEnablePrompt, {
			props: { ...defaultProps, isEnabling: true }
		});
		const enableBtn = getByText('wallet.gasless_enable.enable').closest('button');
		const dismissBtn = getByText('common.not_now').closest('button');
		expect(enableBtn?.disabled).toBe(true);
		expect(dismissBtn?.disabled).toBe(true);
	});

	it('has correct accessibility attributes', () => {
		const { container } = render(GaslessEnablePrompt, { props: defaultProps });
		const region = container.querySelector('[role="region"]');
		expect(region).toBeTruthy();
		expect(region?.getAttribute('aria-label')).toBe('wallet.gasless_enable.title');
	});

	it('list has role="list"', () => {
		const { container } = render(GaslessEnablePrompt, { props: defaultProps });
		const list = container.querySelector('ul[role="list"]');
		expect(list).toBeTruthy();
	});

	it('buttons have min-h-[44px] touch target', () => {
		const { getByText } = render(GaslessEnablePrompt, { props: defaultProps });
		const enableBtn = getByText('wallet.gasless_enable.enable').closest('button');
		const dismissBtn = getByText('common.not_now').closest('button');
		expect(enableBtn?.classList.contains('min-h-[44px]')).toBe(true);
		expect(dismissBtn?.classList.contains('min-h-[44px]')).toBe(true);
	});
});

describe('GaslessRevokePanel', () => {
	const defaultProps = {
		isDelegated: true,
		delegateAddress: '0x' + 'ab'.repeat(20),
		isRevoking: false,
		onRevoke: vi.fn(),
		onReEnable: vi.fn()
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('renders active title when delegated', () => {
		const { getByText } = render(GaslessRevokePanel, { props: defaultProps });
		expect(getByText('wallet.gasless_revoke.active_title')).toBeTruthy();
	});

	it('renders inactive title when not delegated', () => {
		const { getByText } = render(GaslessRevokePanel, {
			props: { ...defaultProps, isDelegated: false }
		});
		expect(getByText('wallet.gasless_revoke.inactive_title')).toBeTruthy();
	});

	it('shows delegate address when delegated', () => {
		const { container } = render(GaslessRevokePanel, { props: defaultProps });
		const code = container.querySelector('code');
		expect(code?.textContent).toContain('...');
	});

	it('shows revoke button when delegated', () => {
		const { getByText } = render(GaslessRevokePanel, { props: defaultProps });
		expect(getByText('wallet.gasless_revoke.revoke')).toBeTruthy();
	});

	it('shows re-enable button when not delegated', () => {
		const { getByText } = render(GaslessRevokePanel, {
			props: { ...defaultProps, isDelegated: false }
		});
		expect(getByText('wallet.gasless_revoke.re_enable')).toBeTruthy();
	});

	it('calls onReEnable when re-enable button is clicked', async () => {
		const onReEnable = vi.fn();
		const { getByText } = render(GaslessRevokePanel, {
			props: { ...defaultProps, isDelegated: false, onReEnable }
		});
		await fireEvent.click(getByText('wallet.gasless_revoke.re_enable'));
		expect(onReEnable).toHaveBeenCalledOnce();
	});

	it('shows confirmation dialog when revoke button is clicked', async () => {
		const { getByText } = render(GaslessRevokePanel, { props: defaultProps });
		await fireEvent.click(getByText('wallet.gasless_revoke.revoke'));
		expect(getByText('wallet.gasless_revoke.confirm_message')).toBeTruthy();
		expect(getByText('wallet.gasless_revoke.confirm')).toBeTruthy();
	});

	it('calls onRevoke when confirm button is clicked', async () => {
		const onRevoke = vi.fn();
		const { getByText } = render(GaslessRevokePanel, {
			props: { ...defaultProps, onRevoke }
		});
		await fireEvent.click(getByText('wallet.gasless_revoke.revoke'));
		await fireEvent.click(getByText('wallet.gasless_revoke.confirm'));
		expect(onRevoke).toHaveBeenCalledOnce();
	});

	it('hides confirmation when cancel is clicked', async () => {
		const { getByText, queryByText } = render(GaslessRevokePanel, { props: defaultProps });
		await fireEvent.click(getByText('wallet.gasless_revoke.revoke'));
		expect(getByText('wallet.gasless_revoke.confirm_message')).toBeTruthy();
		await fireEvent.click(getByText('common.cancel'));
		expect(queryByText('wallet.gasless_revoke.confirm_message')).toBeNull();
	});

	it('disables confirm button when isRevoking is true', async () => {
		const { getByText } = render(GaslessRevokePanel, {
			props: { ...defaultProps, isRevoking: true }
		});
		await fireEvent.click(getByText('wallet.gasless_revoke.revoke'));
		const confirmBtn = getByText('wallet.gasless_revoke.confirm').closest('button');
		expect(confirmBtn?.disabled).toBe(true);
	});

	it('has correct accessibility attributes', () => {
		const { container } = render(GaslessRevokePanel, { props: defaultProps });
		const region = container.querySelector('[role="region"]');
		expect(region).toBeTruthy();
		expect(region?.getAttribute('aria-label')).toBe('wallet.gasless_revoke.active_title');
	});

	it('buttons have min-h-[44px] touch target', () => {
		const { getByText } = render(GaslessRevokePanel, { props: defaultProps });
		const revokeBtn = getByText('wallet.gasless_revoke.revoke').closest('button');
		expect(revokeBtn?.classList.contains('min-h-[44px]')).toBe(true);
	});
});
