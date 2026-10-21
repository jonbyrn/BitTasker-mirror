/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import TaskCompletionDrawerNDK from '$lib/components/contracts/TaskCompletionDrawerNDK.svelte';
import type { PaymentContractRune } from '$lib/runes/contractRune.svelte';
import { beginSigningPrompt, resetSigningPrompt } from '$lib/utils/helpers/signingPrompt';

vi.mock('svelte-i18n', () => ({
	t: {
		subscribe: vi.fn((fn: (value: any) => void) => {
			fn((key: string) => key);
			return () => {};
		})
	}
}));

vi.mock('$lib/components/MediaUploader.svelte', () => ({
	default: vi.fn(() => ({}))
}));

function renderDrawer(onComplete = vi.fn().mockResolvedValue(undefined)) {
	const contractRune = {
		taskTitle: 'Test Task Title',
		contract: {
			paymentId: 'payment-123',
			amount: 100,
			currency: 'USD'
		}
	} as unknown as PaymentContractRune;
	const view = render(TaskCompletionDrawerNDK, {
		props: {
			contractRune,
			isOpen: true,
			onClose: vi.fn(),
			onComplete
		}
	});
	return { ...view, onComplete };
}

describe('completion drawer submit guard', () => {
	beforeEach(() => {
		resetSigningPrompt();
	});

	afterEach(() => {
		resetSigningPrompt();
	});

	it('does not submit the note when Enter is pressed on the button', async () => {
		const { getByRole, getByPlaceholderText, onComplete } = renderDrawer();
		const textarea = getByPlaceholderText(
			'dashboard.contracts.timeline.completion.text_placeholder'
		) as HTMLTextAreaElement;
		textarea.value = 'Mark the walls, ceiling, and fixtures';
		await fireEvent.input(textarea);
		await tick();

		const submitButton = getByRole('button', {
			name: 'dashboard.contracts.timeline.completion.mark_complete'
		});
		const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
		submitButton.dispatchEvent(enter);
		await tick();

		expect(enter.defaultPrevented).toBe(true);
		expect(onComplete).not.toHaveBeenCalled();

		submitButton.click();
		await tick();
		expect(onComplete).toHaveBeenCalledWith([], 'Mark the walls, ceiling, and fixtures');
	});

	it('disables submit and ignores a click while a passkey prompt is pending', async () => {
		const endPrompt = beginSigningPrompt();
		const { getByRole, onComplete } = renderDrawer();
		const submitButton = getByRole('button', {
			name: 'dashboard.contracts.timeline.completion.mark_complete'
		});
		expect(submitButton).toBeDisabled();
		submitButton.click();
		await tick();
		expect(onComplete).not.toHaveBeenCalled();
		endPrompt();
	});

	it('sends the full field value when reactive state is only Mark', async () => {
		const { getByRole, getByPlaceholderText, onComplete } = renderDrawer();
		const textarea = getByPlaceholderText(
			'dashboard.contracts.timeline.completion.text_placeholder'
		) as HTMLTextAreaElement;
		textarea.value = 'Mark';
		await fireEvent.input(textarea);
		await tick();
		textarea.value = 'Mark the walls, ceiling, and fixtures';

		getByRole('button', {
			name: 'dashboard.contracts.timeline.completion.mark_complete'
		}).click();
		await tick();

		expect(onComplete).toHaveBeenCalledWith([], 'Mark the walls, ceiling, and fixtures');
	});
});
