import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import ContractInitiationDrawer from '$lib/components/contracts/ContractInitiationDrawer.svelte';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => {
			if (key === 'common.cancel') {
				return 'Cancel';
			}
			if (key === 'common.components.drawer.close') {
				return 'Close';
			}
			return key;
		}),
		locale: readable('en')
	};
});

describe('ContractInitiationDrawer', () => {
	it('renders the shared initiation shell', () => {
		const { getByTestId, getByText } = render(ContractInitiationDrawer, {
			props: {
				open: true,
				title: 'Fund Contract',
				subtitle: 'Review the agreement before funding the escrow.',
				confirmLabel: 'Fund',
				drawerTestId: 'test-contract-initiation'
			}
		});

		expect(getByTestId('test-contract-initiation')).toBeTruthy();
		expect(getByText('Fund Contract')).toBeTruthy();
		expect(getByText('Review the agreement before funding the escrow.')).toBeTruthy();
		expect(getByText('Fund')).toBeTruthy();
	});

	it('surfaces recoverable errors and blocks close while submitting', async () => {
		const onRetry = vi.fn();
		const onClose = vi.fn();
		const { getByTestId } = render(ContractInitiationDrawer, {
			props: {
				open: true,
				title: 'Fund Contract',
				confirmLabel: 'Fund',
				isSubmitting: true,
				errorMessage: 'Unable to prepare the contract.',
				errorHint: 'Reconnect your wallet and retry.',
				retryTestId: 'test-contract-initiation-retry',
				errorTestId: 'test-contract-initiation-error',
				errorHintTestId: 'test-contract-initiation-error-hint',
				onRetry,
				onClose
			}
		});

		expect(getByTestId('test-contract-initiation-error').textContent).toContain(
			'Unable to prepare the contract.'
		);
		expect(getByTestId('test-contract-initiation-error-hint').textContent).toContain(
			'Reconnect your wallet and retry.'
		);

		const confirmButton = getByTestId('contract-initiation-confirm') as HTMLButtonElement;
		expect(confirmButton.disabled).toBe(true);

		const cancelButtons = Array.from(
			document.querySelectorAll('button.btn-ghost')
		) as HTMLButtonElement[];
		const cancelButton = cancelButtons[cancelButtons.length - 1] ?? null;
		expect(cancelButton?.disabled).toBe(true);

		expect(document.querySelector('[data-testid="test-contract-initiation-retry"]')).toBeNull();
		await fireEvent.click(cancelButton as HTMLButtonElement);
		expect(onClose).not.toHaveBeenCalled();
	});

	it('renders warnings in the shared alert slot when no error is present', () => {
		const { getByTestId, queryByTestId } = render(ContractInitiationDrawer, {
			props: {
				open: true,
				title: 'Fund Contract',
				confirmLabel: 'Fund',
				warningMessage: 'The quoted start time has already passed.',
				warningHint: 'The contract will keep the quoted duration.'
			}
		});

		expect(getByTestId('contract-initiation-warning').textContent).toContain(
			'The quoted start time has already passed.'
		);
		expect(getByTestId('contract-initiation-warning')).toHaveAttribute('role', 'alert');
		expect(getByTestId('contract-initiation-warning')).toHaveAttribute('aria-live', 'polite');
		expect(getByTestId('contract-initiation-warning-hint').textContent).toContain(
			'The contract will keep the quoted duration.'
		);
		expect(queryByTestId('contract-initiation-error')).toBeNull();
	});
});
