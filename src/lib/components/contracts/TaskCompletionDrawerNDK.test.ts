/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import TaskCompletionDrawerNDK from './TaskCompletionDrawerNDK.svelte';
import type { PaymentContractRune } from '$lib/runes/contractRune.svelte';

// Mock svelte-i18n (the component imports t from 'svelte-i18n', not '$lib/i18n')
vi.mock('svelte-i18n', () => ({
	t: {
		subscribe: vi.fn((fn: (value: any) => void) => {
			fn((key: string) => key);
			return () => {};
		})
	}
}));

// Mock MediaUploader - capture onChange on globalThis so tests can simulate uploads
// In Svelte 5, the component function is called as (anchor_node, props),
// so we must read props.onChange from the second argument.
vi.mock('$lib/components/MediaUploader.svelte', () => ({
	default: vi.fn((_anchor: any, props: any) => {
		(globalThis as any).__taskCompletionMediaOnChange = props?.onChange;
		return {};
	})
}));

function createMockContractRune() {
	return {
		taskTitle: 'Test Task Title',
		contract: {
			paymentId: 'payment-123',
			amount: 100,
			currency: 'USD'
		}
	} as unknown as PaymentContractRune;
}

function simulateAttachmentUpload() {
	const onChange = (globalThis as any).__taskCompletionMediaOnChange;
	if (onChange) {
		onChange([
			{
				key: 'test-key',
				url: 'https://example.com/test.jpg',
				type: 'image',
				alt: 'Test attachment',
				size: 1024
			}
		]);
	}
}

describe('TaskCompletionDrawerNDK', () => {
	let mockContractRune: PaymentContractRune;
	let mockOnClose: ReturnType<typeof vi.fn>;
	let mockOnComplete: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		mockContractRune = createMockContractRune();
		mockOnClose = vi.fn();
		mockOnComplete = vi.fn().mockResolvedValue(undefined);
		(globalThis as any).__taskCompletionMediaOnChange = null;
	});

	it('renders the drawer with task information', async () => {
		const { getByText } = render(TaskCompletionDrawerNDK, {
			props: {
				contractRune: mockContractRune,
				isOpen: true,
				onClose: mockOnClose,
				onComplete: mockOnComplete
			}
		});

		expect(getByText('Test Task Title')).toBeTruthy();
		expect(getByText('100 USD')).toBeTruthy();
	});

	it('renders textarea for completion notes', async () => {
		const { getByPlaceholderText } = render(TaskCompletionDrawerNDK, {
			props: {
				contractRune: mockContractRune,
				isOpen: true,
				onClose: mockOnClose,
				onComplete: mockOnComplete
			}
		});

		const textarea = getByPlaceholderText(
			'dashboard.contracts.timeline.completion.text_placeholder'
		);
		expect(textarea).toBeTruthy();
	});

	it('shows character count starting at 0/1000', async () => {
		const { getByText } = render(TaskCompletionDrawerNDK, {
			props: {
				contractRune: mockContractRune,
				isOpen: true,
				onClose: mockOnClose,
				onComplete: mockOnComplete
			}
		});

		expect(getByText('0/1000')).toBeTruthy();
	});

	it('updates character count when text is entered', async () => {
		const { getByPlaceholderText, getByText } = render(TaskCompletionDrawerNDK, {
			props: {
				contractRune: mockContractRune,
				isOpen: true,
				onClose: mockOnClose,
				onComplete: mockOnComplete
			}
		});

		const textarea = getByPlaceholderText(
			'dashboard.contracts.timeline.completion.text_placeholder'
		) as HTMLTextAreaElement;
		textarea.value = 'Test completion notes';
		await fireEvent.input(textarea);
		await tick();

		expect(getByText('21/1000')).toBeTruthy();
	});

	it('enforces 1000 character limit', async () => {
		const { getByPlaceholderText } = render(TaskCompletionDrawerNDK, {
			props: {
				contractRune: mockContractRune,
				isOpen: true,
				onClose: mockOnClose,
				onComplete: mockOnComplete
			}
		});

		const textarea = getByPlaceholderText(
			'dashboard.contracts.timeline.completion.text_placeholder'
		) as HTMLTextAreaElement;
		const longText = 'a'.repeat(1001);

		textarea.value = longText;
		await fireEvent.input(textarea);
		await tick();

		// The component enforces the limit via handleTextInput which truncates
		// the completionText rune to 1000 chars and sets the DOM .value directly
		expect(textarea.value.length).toBe(1000);
	});

	it('enables Mark as Complete with no note and no evidence', async () => {
		const { getByRole } = render(TaskCompletionDrawerNDK, {
			props: {
				contractRune: mockContractRune,
				isOpen: true,
				onClose: mockOnClose,
				onComplete: mockOnComplete
			}
		});

		const submitButton = getByRole('button', {
			name: 'dashboard.contracts.timeline.completion.mark_complete'
		});
		expect(submitButton).not.toBeDisabled();
		submitButton.click();
		await tick();

		expect(mockOnComplete).toHaveBeenCalledWith([], undefined);
	});

	it('submits a note without evidence', async () => {
		const { getByRole, getByPlaceholderText } = render(TaskCompletionDrawerNDK, {
			props: {
				contractRune: mockContractRune,
				isOpen: true,
				onClose: mockOnClose,
				onComplete: mockOnComplete
			}
		});

		const textarea = getByPlaceholderText(
			'dashboard.contracts.timeline.completion.text_placeholder'
		) as HTMLTextAreaElement;
		textarea.value = 'I completed the task!';
		await fireEvent.input(textarea);
		await tick();

		const submitButton = getByRole('button', {
			name: 'dashboard.contracts.timeline.completion.mark_complete'
		});
		expect(submitButton).not.toBeDisabled();
		submitButton.click();
		await tick();

		expect(mockOnComplete).toHaveBeenCalledWith([], 'I completed the task!');
	});

	it('submits evidence without a note', async () => {
		const { getByRole } = render(TaskCompletionDrawerNDK, {
			props: {
				contractRune: mockContractRune,
				isOpen: true,
				onClose: mockOnClose,
				onComplete: mockOnComplete
			}
		});

		simulateAttachmentUpload();
		await tick();

		const submitButton = getByRole('button', {
			name: 'dashboard.contracts.timeline.completion.mark_complete'
		});
		expect(submitButton).not.toBeDisabled();
		submitButton.click();
		await tick();

		expect(mockOnComplete).toHaveBeenCalledWith(
			[
				{
					key: 'test-key',
					url: 'https://example.com/test.jpg',
					type: 'image/*',
					cloudflareId: undefined,
					alt: 'Completion evidence',
					size: 1024
				}
			],
			undefined
		);
	});

	it('calls onComplete with attachments and text when submitted', async () => {
		const { getByRole, getByPlaceholderText } = render(TaskCompletionDrawerNDK, {
			props: {
				contractRune: mockContractRune,
				isOpen: true,
				onClose: mockOnClose,
				onComplete: mockOnComplete
			}
		});

		// Set text first
		const textarea = getByPlaceholderText(
			'dashboard.contracts.timeline.completion.text_placeholder'
		) as HTMLTextAreaElement;
		textarea.value = 'Task completed successfully';
		await fireEvent.input(textarea);
		await tick();

		// Then simulate attachment upload after render so onChange callback is captured
		simulateAttachmentUpload();
		await tick();

		const submitButton = getByRole('button', {
			name: 'dashboard.contracts.timeline.completion.mark_complete'
		});
		submitButton.click();

		expect(mockOnComplete).toHaveBeenCalledWith(
			[
				{
					key: 'test-key',
					url: 'https://example.com/test.jpg',
					type: 'image/*',
					cloudflareId: undefined,
					alt: 'Completion evidence',
					size: 1024
				}
			],
			'Task completed successfully'
		);
	});

	it('disables submit button during submission', async () => {
		mockOnComplete = vi
			.fn()
			.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)));

		const { getByRole, getByPlaceholderText } = render(TaskCompletionDrawerNDK, {
			props: {
				contractRune: mockContractRune,
				isOpen: true,
				onClose: mockOnClose,
				onComplete: mockOnComplete
			}
		});

		// Set text first
		const textarea = getByPlaceholderText(
			'dashboard.contracts.timeline.completion.text_placeholder'
		) as HTMLTextAreaElement;
		textarea.value = 'Completing...';
		await fireEvent.input(textarea);
		await tick();

		// Then simulate attachment upload after render so onChange callback is captured
		simulateAttachmentUpload();
		await tick();

		const submitButton = getByRole('button', {
			name: 'dashboard.contracts.timeline.completion.mark_complete'
		});
		expect(submitButton).not.toBeDisabled();
		submitButton.click();
		await tick();

		// Button should be disabled during submission
		expect(submitButton).toBeDisabled();
	});

	it('calls onClose when cancel is clicked', async () => {
		const { getByRole } = render(TaskCompletionDrawerNDK, {
			props: {
				contractRune: mockContractRune,
				isOpen: true,
				onClose: mockOnClose,
				onComplete: mockOnComplete
			}
		});

		const cancelButton = getByRole('button', { name: 'common.cancel' });
		await fireEvent.click(cancelButton);

		expect(mockOnClose).toHaveBeenCalled();
	});

	it('shows completing text when completing', async () => {
		mockOnComplete = vi
			.fn()
			.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)));

		const { container, getByRole, getByPlaceholderText } = render(TaskCompletionDrawerNDK, {
			props: {
				contractRune: mockContractRune,
				isOpen: true,
				onClose: mockOnClose,
				onComplete: mockOnComplete
			}
		});

		// Set text first
		const textarea = getByPlaceholderText(
			'dashboard.contracts.timeline.completion.text_placeholder'
		) as HTMLTextAreaElement;
		textarea.value = 'Working...';
		await fireEvent.input(textarea);
		await tick();

		// Then simulate attachment upload after render so onChange callback is captured
		simulateAttachmentUpload();
		await tick();

		const submitButton = getByRole('button', {
			name: 'dashboard.contracts.timeline.completion.mark_complete'
		});
		submitButton.click();
		await tick();

		// The submit button text should switch to completing state
		expect(container.querySelector('.btn-primary')?.textContent?.trim()).toContain(
			'dashboard.contracts.timeline.completion.completing'
		);
	});
});
