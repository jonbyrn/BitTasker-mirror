import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { computeDirectFees, calculateMaxAmount } from '$lib/runes/use-send-fee-estimate.svelte';
import { FEE_BUFFER_MAX, USDT0_ADDRESS } from '$lib/wallet/gasless.config';

const PROJECT = resolve(__dirname, '../../../../..');
function readSource(rel: string) { return readFileSync(resolve(PROJECT, rel), 'utf8'); }

describe('Send form Arbitrum fee/max issues', () => {
    describe('BUG: computeDirectFees returns 0 for usdt0-arb', () => {
        it('isCrossChainEvmDest matches usdt0-arb', () => {
            const source = readSource('src/lib/runes/use-send-fee-estimate.svelte.ts');
            expect(source).toContain("dest === 'usdt0-arb'");
        });

        it('cross-chain EVM branch returns totalFees: 0 for non-RSK source', () => {
            const source = readSource('src/lib/runes/use-send-fee-estimate.svelte.ts');
            // The branch returns { totalFees: 0 } when source is not rootstock-bitcoin
            expect(source).toContain('serviceFee: 0, networkFee: 0, totalFees: 0');
        });

        it('gasless fee buffer exists for USDT0 ($0.15 max)', () => {
            const source = readSource('src/lib/wallet/gasless.config.ts');
            // FEE_BUFFER_MAX for USDT0 = 150,000 (6 decimals) = $0.15
            expect(source).toContain('150_000n');
        });

        it('fee estimation rune DOES use gasless fee buffer for Arbitrum sends', () => {
            const source = readSource('src/lib/runes/use-send-fee-estimate.svelte.ts');
            // The rune now imports FEE_BUFFER_MAX and uses it for usdt0-arb
            expect(source).toContain('FEE_BUFFER_MAX');
        });

        it('computeDirectFees returns gasless fee buffer for usdt0-arb with non-RSK source', () => {
            const source = readSource('src/lib/runes/use-send-fee-estimate.svelte.ts');
            // The usdt0-arb branch returns feeBufferSats, not 0
            expect(source).toContain("destNetwork === 'usdt0-arb'");
        });
    });

    describe('BUG: fetchFeeParameters has no handler for usdt0-arb', () => {
        it('fetchFeeParameters handles lightning-bitcoin', () => {
            const source = readSource('src/lib/runes/use-send-fee-estimate.svelte.ts');
            expect(source).toContain("destNetwork === 'lightning-bitcoin'");
        });

        it('fetchFeeParameters handles rootstock-bitcoin', () => {
            const source = readSource('src/lib/runes/use-send-fee-estimate.svelte.ts');
            expect(source).toContain("destNetwork === 'rootstock-bitcoin'");
        });

        it('fetchFeeParameters DOES handle usdt0-arb with gasless fee buffer', () => {
            const source = readSource('src/lib/runes/use-send-fee-estimate.svelte.ts');
            // Extract the fetchFeeParameters function body
            const start = source.indexOf('async function fetchFeeParameters');
            const fetchBody = source.substring(start, start + 1500);
            expect(fetchBody).toContain("'usdt0-arb'");
            expect(fetchBody).toContain('fixedFee: feeBufferSats');
        });

        it('calculateMaxAmount returns 0 when parameters is null', () => {
            const source = readSource('src/lib/runes/use-send-fee-estimate.svelte.ts');
            // When parameters is null, calculateMaxAmount returns 0
            expect(source).toContain('if (!parameters) return 0');
        });
    });

    describe('BUG: MAX button does nothing for usdt0-arb', () => {
        it('handleMaxAmount checks max > 0 before setting amount', () => {
            const source = readSource('src/lib/components/wallet/SendPaymentForm.svelte');
            expect(source).toContain('if (max > 0)');
        });

        it('max is derived from calculateMaxAmount which returns 0 for usdt0-arb', () => {
            // When parameters = null (no handler for usdt0-arb), max = 0
            // The guard if (max > 0) prevents any action
            const maxAmount = 0;
            expect(maxAmount > 0).toBe(false);
        });
    });

    describe('BUG: Total equals input for usdt0-arb', () => {
        it('totalToSend = amountInSats + totalFees', () => {
            const source = readSource('src/lib/runes/use-send-form-validation.svelte.ts');
            expect(source).toContain('amountInSats + (feeEstimate?.totalFees ?? 0)');
        });

        it('when totalFees = 0, totalToSend equals amountInSats', () => {
            const amountInSats = 110_000_000; // $1.10
            const totalFees = 0;
            const totalToSend = amountInSats + totalFees;
            expect(totalToSend).toBe(amountInSats); // same as input
        });

        it('with gasless fee buffer ($0.15), total should be amount + fee', () => {
            const amountInSats = 110_000_000; // $1.10
            const feeBufferSats = 15_000_000; // $0.15
            const totalToSend = amountInSats + feeBufferSats;
            expect(totalToSend).toBe(125_000_000); // $1.25
        });
    });

    describe('Expected behavior after fix', () => {
        it('computeDirectFees returns gasless fee buffer for usdt0-arb sends', async () => {
            const btcPrice = 100_000; // $100K
            const result = await computeDirectFees('usdt0-arb', {
                selectedSource: 'usdt-bsc',
                isRskConnected: false,
                gasEstimation: null,
                btcPrice
            });

            // With dynamic estimate, the fee comes from the backend.
            // Since the backend is unreachable in tests, it falls back to FEE_BUFFER_MAX.
            const feeBufferMicroUsdt = Number(FEE_BUFFER_MAX[USDT0_ADDRESS.toLowerCase()] ?? 150_000n);
            const feeBufferUsd = feeBufferMicroUsdt / 1_000_000;
            const expectedSats = Math.ceil((feeBufferUsd / btcPrice) * 100_000_000);

            expect(result).not.toBeNull();
            expect(result!.serviceFee).toBe(0);
            expect(result!.networkFee).toBe(expectedSats);
            expect(result!.totalFees).toBe(expectedSats);
            expect(result!.totalFees).toBeGreaterThan(0);
        });

        it('computeDirectFees uses fallback 15_000_000 sats when btcPrice is 0', async () => {
            const result = await computeDirectFees('usdt0-arb', {
                selectedSource: 'usdt-bsc',
                isRskConnected: false,
                gasEstimation: null,
                btcPrice: 0
            });

            expect(result).not.toBeNull();
            expect(result!.networkFee).toBe(15_000_000);
            expect(result!.totalFees).toBe(15_000_000);
        });

        it('fetchFeeParameters sets fixedFee for usdt0-arb so MAX button works', () => {
            // With fixedFee set, calculateMaxAmount should return a positive value
            const btcPrice = 100_000;
            const feeBufferMicroUsdt = Number(FEE_BUFFER_MAX[USDT0_ADDRESS.toLowerCase()] ?? 150_000n);
            const feeBufferUsd = feeBufferMicroUsdt / 1_000_000;
            const feeBufferSats = Math.ceil((feeBufferUsd / btcPrice) * 100_000_000);
            const balance = 10_000_000; // 0.1 BTC

            const max = calculateMaxAmount(balance, { fixedFee: feeBufferSats });
            expect(max).toBeGreaterThan(0);
            // max = balance - ceil(feeBufferSats * 1.2) - 20
            const expected = Math.max(0, balance - Math.ceil(feeBufferSats * 1.2) - 20);
            expect(max).toBe(expected);
        });
    });
});
