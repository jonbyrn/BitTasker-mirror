import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { gasModeStore, type PaymasterHealth } from '$lib/stores/gas-mode.store';

describe('gas-mode.store', () => {
	beforeEach(() => {
		gasModeStore.reset();
	});

	describe('initial state', () => {
		it('has default gas mode USDT_GAS', () => {
			const state = get(gasModeStore);
			expect(state.gasMode).toBe('USDT_GAS');
		});

		it('has default paymaster health with unfunded status', () => {
			const state = get(gasModeStore);
			expect(state.paymasterHealth.funded).toBe(false);
			expect(state.paymasterHealth.paused).toBe(false);
			expect(state.paymasterHealth.oracleStaleness).toBe(0);
			expect(state.paymasterHealth.estimatedRemainingTx).toBe(0);
		});

		it('has depegDetected set to false', () => {
			const state = get(gasModeStore);
			expect(state.depegDetected).toBe(false);
		});
	});

	describe('setGasMode', () => {
		it('sets gas mode to USDT_GAS', () => {
			gasModeStore.setGasMode('USDT_GAS');
			const state = get(gasModeStore);
			expect(state.gasMode).toBe('USDT_GAS');
		});

		it('sets gas mode to BNB_FALLBACK', () => {
			gasModeStore.setGasMode('BNB_FALLBACK');
			const state = get(gasModeStore);
			expect(state.gasMode).toBe('BNB_FALLBACK');
		});

		it('transitions between modes without side effects', () => {
			gasModeStore.setGasMode('BNB_FALLBACK');
			expect(get(gasModeStore).gasMode).toBe('BNB_FALLBACK');
			expect(get(gasModeStore).depegDetected).toBe(false);

			gasModeStore.setGasMode('USDT_GAS');
			expect(get(gasModeStore).gasMode).toBe('USDT_GAS');
		});

		it('preserves paymaster health when changing gas mode', () => {
			gasModeStore.updatePaymasterHealth({ funded: true, estimatedRemainingTx: 50 });
			gasModeStore.setGasMode('BNB_FALLBACK');

			const state = get(gasModeStore);
			expect(state.paymasterHealth.funded).toBe(true);
			expect(state.paymasterHealth.estimatedRemainingTx).toBe(50);
		});
	});

	describe('updatePaymasterHealth', () => {
		it('updates funded status', () => {
			gasModeStore.updatePaymasterHealth({ funded: true });
			expect(get(gasModeStore).paymasterHealth.funded).toBe(true);
		});

		it('updates oracle staleness', () => {
			gasModeStore.updatePaymasterHealth({ oracleStaleness: 120 });
			expect(get(gasModeStore).paymasterHealth.oracleStaleness).toBe(120);
		});

		it('updates paused status', () => {
			gasModeStore.updatePaymasterHealth({ paused: true });
			expect(get(gasModeStore).paymasterHealth.paused).toBe(true);
		});

		it('updates estimated remaining transactions', () => {
			gasModeStore.updatePaymasterHealth({ estimatedRemainingTx: 100 });
			expect(get(gasModeStore).paymasterHealth.estimatedRemainingTx).toBe(100);
		});

		it('merges partial updates without affecting other fields', () => {
			gasModeStore.updatePaymasterHealth({ funded: true });
			gasModeStore.updatePaymasterHealth({ oracleStaleness: 300 });

			const health = get(gasModeStore).paymasterHealth;
			expect(health.funded).toBe(true);
			expect(health.oracleStaleness).toBe(300);
			expect(health.paused).toBe(false); // unchanged default
			expect(health.estimatedRemainingTx).toBe(0); // unchanged default
		});

		it('accepts full PaymasterHealth update', () => {
			const fullHealth: PaymasterHealth = {
				funded: true,
				oracleStaleness: 60,
				paused: false,
				estimatedRemainingTx: 42
			};
			gasModeStore.updatePaymasterHealth(fullHealth);
			expect(get(gasModeStore).paymasterHealth).toEqual(fullHealth);
		});

		it('overwrites previous values with new ones', () => {
			gasModeStore.updatePaymasterHealth({ funded: true, estimatedRemainingTx: 10 });
			gasModeStore.updatePaymasterHealth({ funded: false });

			const health = get(gasModeStore).paymasterHealth;
			expect(health.funded).toBe(false);
			expect(health.estimatedRemainingTx).toBe(10); // preserved from first update
		});
	});

	describe('setDepegDetected', () => {
		it('sets depeg detected to true', () => {
			gasModeStore.setDepegDetected(true);
			expect(get(gasModeStore).depegDetected).toBe(true);
		});

		it('sets depeg detected to false', () => {
			gasModeStore.setDepegDetected(true);
			gasModeStore.setDepegDetected(false);
			expect(get(gasModeStore).depegDetected).toBe(false);
		});

		it('does not affect other state when setting depeg', () => {
			gasModeStore.setGasMode('BNB_FALLBACK');
			gasModeStore.updatePaymasterHealth({ funded: true });
			gasModeStore.setDepegDetected(true);

			const state = get(gasModeStore);
			expect(state.gasMode).toBe('BNB_FALLBACK');
			expect(state.paymasterHealth.funded).toBe(true);
			expect(state.depegDetected).toBe(true);
		});
	});

	describe('reset', () => {
		it('restores initial state after modifications', () => {
			gasModeStore.setGasMode('BNB_FALLBACK');
			gasModeStore.updatePaymasterHealth({ funded: true, estimatedRemainingTx: 99 });
			gasModeStore.setDepegDetected(true);

			gasModeStore.reset();

			const state = get(gasModeStore);
			expect(state.gasMode).toBe('USDT_GAS');
			expect(state.paymasterHealth.funded).toBe(false);
			expect(state.depegDetected).toBe(false);
		});

		it('can be called multiple times safely', () => {
			gasModeStore.reset();
			gasModeStore.reset();
			const state = get(gasModeStore);
			expect(state.gasMode).toBe('USDT_GAS');
		});
	});

	describe('store subscription', () => {
		it('notifies subscribers on state change', () => {
			const values: string[] = [];
			const unsubscribe = gasModeStore.subscribe((state) => {
				values.push(state.gasMode);
			});

			gasModeStore.setGasMode('BNB_FALLBACK');
			gasModeStore.setGasMode('USDT_GAS');

			expect(values).toContain('BNB_FALLBACK');
			expect(values).toContain('USDT_GAS');
			unsubscribe();
		});

		it('unsubscribe stops notifications', () => {
			const values: string[] = [];
			const unsubscribe = gasModeStore.subscribe((state) => {
				values.push(state.gasMode);
			});

			gasModeStore.setGasMode('BNB_FALLBACK');
			unsubscribe();
			gasModeStore.setGasMode('USDT_GAS');

			// initial value + BNB_FALLBACK = 2, should NOT include USDT_GAS
			expect(values).toHaveLength(2);
		});
	});
});
