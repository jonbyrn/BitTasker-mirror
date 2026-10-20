import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { shouldKeepLocalStatus } from '$lib/utils/ui/contract-status-rank';
import {
	AA_TEXT_CONTRAST,
	TEXT_PAIRS,
	contrastRatio,
	parseThemeColors
} from '$lib/utils/ui/contrast';
import {
	bidAmountLabel,
	contractDisplayAmount,
	contractPayUnits,
	formatMoneyAmount
} from '$lib/utils/ui/money-display';
import { createSingleFlight, withNextStep } from '$lib/utils/ui/single-flight';

describe('single flight', () => {
	it('runs the first tap and ignores a second tap until it finishes', async () => {
		const flight = createSingleFlight();
		let started = 0;
		let release: (() => void) | undefined;
		const gate = new Promise<void>((resolveGate) => {
			release = resolveGate;
		});

		const first = flight.run(async () => {
			started += 1;
			await gate;
			return 'done';
		});
		const second = flight.run(async () => {
			started += 1;
			return 'again';
		});

		expect(flight.pending).toBe(true);
		await expect(second).resolves.toBeUndefined();
		release?.();
		await expect(first).resolves.toBe('done');
		expect(started).toBe(1);
		expect(flight.pending).toBe(false);
	});

	it('adds a next step when the error does not already have one', () => {
		expect(withNextStep('Failed to approve work.', 'Tap Retry.')).toBe(
			'Failed to approve work. Tap Retry.'
		);
		expect(withNextStep('Tap Retry.', 'Tap Retry.')).toBe('Tap Retry.');
	});
});

describe('money display', () => {
	it('shows the bid amount and currency, never the task budget', () => {
		expect(
			bidAmountLabel({
				amount: 20,
				currency: 'USD',
				taskBudget: { amount: 2, currency: 'USD' }
			})
		).toBe('$20.00 USD');
		expect(bidAmountLabel({ amount: 1500, currency: 'SATS' })).toBe('1,500 sats');
		expect(formatMoneyAmount(100, 'USDT')).toBe('100.00 USDT');
	});

	it('shows the locked contract amount in USDT when that is the rail', () => {
		expect(
			contractDisplayAmount({
				lockedAmount: 20,
				lockedCurrency: 'USD',
				totalAmountUsd: 2,
				primaryAsset: 'usdt_rgb'
			})
		).toBe('20.00 USDT');
		expect(
			contractPayUnits({
				lockedAmount: 20,
				lockedCurrency: 'USD',
				totalAmountUsd: 2,
				primaryAsset: 'usdt_rgb'
			})
		).toBe(20_000_000);
	});

	it('keeps a sat contract in sats', () => {
		expect(
			contractDisplayAmount({
				lockedAmount: 3075,
				lockedCurrency: 'SATS',
				totalAmountUsd: 2,
				primaryAsset: 'btc_lightning'
			})
		).toBe('3,075 sats');
	});
});

describe('contract status hold', () => {
	it('does not let a stale relay read undo Approve', () => {
		expect(shouldKeepLocalStatus('approved', 'work_submitted')).toBe(true);
		expect(shouldKeepLocalStatus('approved', 'approved')).toBe(false);
		expect(shouldKeepLocalStatus('approved', 'cancelled')).toBe(false);
	});
});

describe('design token contrast', () => {
	const css = readFileSync(resolve('src/app.css'), 'utf8');

	it.each(['light', 'dark'] as const)('%s theme text pairs meet WCAG 2.2 AA', (theme) => {
		const colors = parseThemeColors(css, theme);
		for (const [background, foreground] of TEXT_PAIRS) {
			expect(colors[background], `${theme} ${background}`).toBeTruthy();
			expect(colors[foreground], `${theme} ${foreground}`).toBeTruthy();
			const ratio = contrastRatio(colors[foreground], colors[background]);
			expect(
				ratio,
				`${theme} ${foreground} on ${background} = ${ratio.toFixed(2)}`
			).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
		}
	});
});
