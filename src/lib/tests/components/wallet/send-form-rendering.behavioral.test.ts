import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const PROJECT = resolve(__dirname, '../../../../..');

function readSource(relativePath: string): string {
    return readFileSync(resolve(PROJECT, relativePath), 'utf8');
}

describe('Send form rendering — production behavior audit', () => {
    describe('FIXED: GaslessSendFlow no longer replaces normal form', () => {
        it('isArbitrumNetwork condition was removed (form swap eliminated)', () => {
            const source = readSource('src/lib/components/wallet/SendPaymentForm.svelte');
            expect(source).not.toContain('{:else if isArbitrumNetwork}');
        });

        it('GaslessSendFlow is NOT rendered in SendPaymentForm', () => {
            const source = readSource('src/lib/components/wallet/SendPaymentForm.svelte');
            expect(source).not.toContain('<GaslessSendFlow');
        });

        it('isArbitrumNetwork derived was removed', () => {
            const source = readSource('src/lib/components/wallet/SendPaymentForm.svelte');
            expect(source).not.toContain('isArbitrumNetwork');
        });
    });

    describe('BUG: Source ID mismatch in paymentAddressParser', () => {
        it('SendPaymentForm source asset ID is usdt0-arb', () => {
            const source = readSource('src/lib/components/wallet/SendPaymentForm.svelte');
            expect(source).toContain("id: 'usdt0-arb'");
        });

        it('paymentAddressParser accepts usdt0-arb as sourceHint', () => {
            const source = readSource('src/lib/utils/helpers/paymentAddressParser.ts');
            expect(source).toContain("sourceHint === 'usdt0-arb'");
        });

        it('paymentAddressParser accepts usdt0-arb as sourceHint', () => {
            const source = readSource('src/lib/utils/helpers/paymentAddressParser.ts');
            expect(source).toContain("sourceHint === 'usdt0-arb'");
        });
    });

    describe('FIXED: Destination selection no longer triggers disruptive form swap', () => {
        it('handleDestinationChange sets destinationChainId for selected network', () => {
            const source = readSource('src/lib/components/wallet/SendPaymentForm.svelte');
            expect(source).toContain('destinationChainId');
            expect(source).toContain('handleDestinationChange');
        });

        it('isArbitrumNetwork derived was removed (no form swap logic)', () => {
            const source = readSource('src/lib/components/wallet/SendPaymentForm.svelte');
            expect(source).not.toContain('isArbitrumNetwork');
        });
    });

    describe('Expected behavior after fix: form preserves user input', () => {
        it('normal form handles Arbitrum destination (no form swap)', () => {
            const source = readSource('src/lib/components/wallet/SendPaymentForm.svelte');
            expect(source).toContain('handleDestinationChange');
            expect(source).not.toContain('<GaslessSendFlow');
        });

        it('no isArbitrumNetwork condition exists in the template', () => {
            const source = readSource('src/lib/components/wallet/SendPaymentForm.svelte');
            expect(source).not.toContain('isArbitrumNetwork');
        });
    });
});

describe('Send flow e2e test gaps', () => {
    describe('FIXED: form swap eliminated — no exclusion assertions needed', () => {
        it('e2e test does not assert multiple forms visible (single form always shown)', () => {
            const e2eSource = readSource('tests/e2e/wallet/send-flow.spec.ts');
            const hasFormCountAssertion = e2eSource.includes('toHaveCount') ||
                e2eSource.includes('form.*count') ||
                e2eSource.includes('normal form.*not.*visible');
            expect(hasFormCountAssertion).toBe(false);
        });

        it('e2e test does not exclude normal form when gasless is active (no form swap)', () => {
            const e2eSource = readSource('tests/e2e/wallet/send-flow.spec.ts');
            const hasExclusionAssertion = e2eSource.includes('not.toBeVisible') ||
                e2eSource.includes('not.toBeAttached');
            expect(hasExclusionAssertion).toBe(false);
        });
    });

    describe('Missing: full address-parsing → source selection flow', () => {
        it('e2e test should verify address paste → source selection', () => {
            const e2eSource = readSource('tests/e2e/wallet/send-flow.spec.ts');
            const hasFullFlow = (e2eSource.includes('fillAddress') || e2eSource.includes('fillGaslessForm')) &&
                (e2eSource.includes('selectSource') || e2eSource.includes('selectOption'));
            expect(hasFullFlow).toBe(true);
        });
    });
});
