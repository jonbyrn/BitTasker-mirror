import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
	presentCompleteTaskFailure,
	completeTaskErrorKey
} from '$lib/utils/contract/completeTaskFailure';
import {
	RelayRequestTimeoutError,
	TaskeeSignerMismatchError,
	assertExpectedSender,
	fallbackRelayContext,
	fetchWithoutAbort,
	localRelayChainId
} from '$lib/utils/contract/v2/completeTaskRelay';

const writesSource = readFileSync(
	resolve(
		dirname(fileURLToPath(import.meta.url)),
		'../../../../../utils/contract/v2/blockchainWrites.ts'
	),
	'utf8'
);
const layoutSource = readFileSync(
	resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../../routes/+layout.svelte'),
	'utf8'
);

describe('complete task relay failure', () => {
	it('uses chain id 30 on mainnet when relay /info does not answer', () => {
		expect(localRelayChainId('mainnet')).toBe('30');
		expect(localRelayChainId('testnet')).toBe('31');
		expect(fallbackRelayContext('0xabc', 'mainnet')).toEqual({
			securePaymentAddress: '0xabc',
			chainId: '30',
			source: 'local'
		});
	});

	it('rejects a hung relay call without aborting the request or reloading', async () => {
		const abort = vi.fn();
		const reload = vi.fn();
		const hanging = new Promise<string>(() => {});

		await expect(fetchWithoutAbort(() => hanging, 25)).rejects.toBeInstanceOf(
			RelayRequestTimeoutError
		);
		await expect(fetchWithoutAbort(() => hanging, 25)).rejects.toThrow(
			/Relay request timed out after 1 seconds/
		);
		expect(abort).not.toHaveBeenCalled();
		expect(reload).not.toHaveBeenCalled();
		expect(writesSource).not.toContain('controller.abort');
		expect(writesSource).not.toContain('new AbortController');
		expect(writesSource).not.toContain('location.reload');
		expect(writesSource).not.toMatch(/signal:\s*controller/);
	});

	it('does not treat the chunk-reload handler as part of mark complete', () => {
		expect(writesSource).not.toContain('vite:preloadError');
		expect(layoutSource).toContain('location.reload()');
		expect(writesSource).not.toContain('chunk-reload');
	});

	it('refuses to send when the wallet is not the worker address', () => {
		expect(() =>
			assertExpectedSender(
				'0x1111111111111111111111111111111111111111',
				'0x88C5000000000000000000000000000000000fBb'
			)
		).toThrow(TaskeeSignerMismatchError);
		expect(
			assertExpectedSender(
				'0x88C5000000000000000000000000000000000fBb',
				'0x88c5000000000000000000000000000000000fbb'
			)
		).toBeUndefined();
	});

	it('shows an English or Spanish error key with Retry and never reloads', () => {
		const reload = vi.fn();
		const showErrorToast = vi.fn();
		const retry = vi.fn();

		presentCompleteTaskFailure({
			showErrorToast,
			message: 'Could not mark this task complete. Your note is still here.',
			retry
		});

		expect(reload).not.toHaveBeenCalled();
		expect(showErrorToast).toHaveBeenCalledWith(
			'Could not mark this task complete. Your note is still here.',
			0,
			expect.objectContaining({
				actions: [
					expect.objectContaining({
						label: 'dashboard.contracts.timeline.completion.retry'
					})
				]
			})
		);
		expect(completeTaskErrorKey('timeout')).toBe(
			'dashboard.contracts.timeline.completion.error_timeout'
		);
		expect(completeTaskErrorKey('signer_mismatch')).toBe(
			'dashboard.contracts.timeline.completion.error_signer'
		);
		expect(completeTaskErrorKey('confirm_timeout')).toBe(
			'dashboard.contracts.timeline.completion.error_confirm_timeout'
		);
	});
});
