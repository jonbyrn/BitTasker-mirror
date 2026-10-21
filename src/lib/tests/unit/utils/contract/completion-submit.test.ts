import { afterEach, describe, expect, it, vi } from 'vitest';
import { completionSubmitAllowed, fullCompletionNote } from '$lib/utils/contract/completionSubmit';
import {
	beginSigningPrompt,
	isSigningPromptPending,
	resetSigningPrompt,
	withSigningPrompt
} from '$lib/utils/helpers/signingPrompt';

describe('completion submit while a passkey prompt is up', () => {
	afterEach(() => {
		resetSigningPrompt();
		vi.useRealTimers();
	});

	it('sends the full note when state only has the prefix Mark', () => {
		expect(fullCompletionNote('Mark', 'Mark the walls, ceiling, and fixtures')).toBe(
			'Mark the walls, ceiling, and fixtures'
		);
		expect(fullCompletionNote('Mark the walls, ceiling, and fixtures', 'Mark')).toBe(
			'Mark the walls, ceiling, and fixtures'
		);
		expect(fullCompletionNote('   ', '')).toBeUndefined();
	});

	it('blocks submit while signing or while a submission is in flight', () => {
		expect(completionSubmitAllowed({ signingPending: true, inFlight: false })).toBe(false);
		expect(completionSubmitAllowed({ signingPending: false, inFlight: true })).toBe(false);
		expect(completionSubmitAllowed({ signingPending: false, inFlight: false })).toBe(true);
	});

	it('stays blocked for a moment after the passkey prompt closes', async () => {
		vi.useFakeTimers();
		let release: () => void = () => {};
		const running = withSigningPrompt(
			() =>
				new Promise<void>((resolve) => {
					release = resolve;
				})
		);
		expect(isSigningPromptPending()).toBe(true);
		release();
		await running;
		expect(isSigningPromptPending()).toBe(true);
		await vi.advanceTimersByTimeAsync(1_000);
		expect(isSigningPromptPending()).toBe(false);
	});

	it('beginSigningPrompt matches the same pending flag', () => {
		const end = beginSigningPrompt();
		expect(isSigningPromptPending()).toBe(true);
		end();
		resetSigningPrompt();
		expect(isSigningPromptPending()).toBe(false);
	});
});
