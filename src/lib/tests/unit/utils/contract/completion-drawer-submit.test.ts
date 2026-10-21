/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import TaskCompletionDrawerNDK from '$lib/components/contracts/TaskCompletionDrawerNDK.svelte';
import type { PaymentContractRune } from '$lib/runes/contractRune.svelte';
import { COMPLETION_CONFIRMING_HINT_MS } from '$lib/utils/contract/completionSubmit';
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
		vi.useRealTimers();
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

	it('shows the network hint after 10 seconds and keeps submit disabled', async () => {
		const copies = Object.fromEntries(
			readdirSync('static/locales').map((locale) => {
				const json = JSON.parse(
					readFileSync(`static/locales/${locale}/dashboard/dashboard.json`, 'utf8')
				);
				return [locale, json.dashboard.contracts.timeline.completion.confirming_network as string];
			})
		);
		expect(copies.en).toBe(
			'Still confirming on the network. This can take a few minutes. You can leave this page.'
		);
		expect(copies.es).toBe(
			'Aún estamos confirmando en la red. Esto puede tardar unos minutos. Puedes salir de esta página.'
		);
		for (const copy of Object.values(copies)) {
			expect(copy.trim().length).toBeGreaterThan(0);
		}

		vi.useFakeTimers();
		const { getByRole, queryByTestId, getByTestId, onComplete } = renderDrawer(
			vi.fn(() => new Promise(() => {}))
		);
		const submit = getByRole('button', {
			name: 'dashboard.contracts.timeline.completion.mark_complete'
		}) as HTMLButtonElement;
		submit.click();
		await tick();

		expect(submit).toBeDisabled();
		expect(queryByTestId('completion-network-hint')).toBeNull();

		await vi.advanceTimersByTimeAsync(COMPLETION_CONFIRMING_HINT_MS - 1);
		await tick();
		expect(queryByTestId('completion-network-hint')).toBeNull();
		expect(submit).toBeDisabled();

		await vi.advanceTimersByTimeAsync(1);
		await tick();
		expect(getByTestId('completion-network-hint').textContent).toContain(
			'dashboard.contracts.timeline.completion.confirming_network'
		);
		expect(submit).toBeDisabled();
		submit.click();
		await tick();
		expect(onComplete).toHaveBeenCalledTimes(1);
	});
});
