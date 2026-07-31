import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { parsePaymentAddress } from '$lib/utils/helpers/paymentAddressParser';
import { parseSendAddress } from '$lib/utils/parseSendAddress';

const SRC = resolve(__dirname, '../../../');
const readSource = (relativePath: string) =>
    readFileSync(resolve(SRC, relativePath), 'utf8');

describe('Address detection — production behavior audit', () => {

    describe('BUG: Bare 0x address defaults to RSK', () => {
        it('bare 0x address without chain ID defaults to RSK even when source is Arbitrum', () => {
            // parsePaymentAddress sourceHint type only accepts
            // 'rootstock-bitcoin' | 'usdt-bsc' — Arbitrum is not an option.
            // A bare 0x address always resolves to RSK by default.
            const result = parsePaymentAddress(
                '0x9AEA6DDA21cc99ddA8c7345E1a9a834356EF8E1d'
            );
            // Current behavior: defaults to RSK (known limitation)
            // Future: should detect based on sourceHint or EIP-681 chain ID
            expect(result.network).toBe('rootstock-bitcoin');
        });

        it('0x address with arbitrum: prefix correctly detects Arbitrum', () => {
            const result = parsePaymentAddress(
                'arbitrum:0x9AEA6DDA21cc99ddA8c7345E1a9a834356EF8E1d'
            );
            expect(result.network).toBe('usdt0-arb');
        });

        it('0x address with chain ID @42161 correctly detects Arbitrum', () => {
            const result = parsePaymentAddress(
                'ethereum:0x9AEA6DDA21cc99ddA8c7345E1a9a834356EF8E1d@42161'
            );
            expect(result.network).toBe('usdt0-arb');
        });

        it('sourceHint type accepts usdt0-arb (current bug: not in type union)', () => {
            // The parsePaymentAddress sourceHint type is:
            //   'rootstock-bitcoin' | 'usdt-bsc' | null
            // It does NOT include any Arbitrum variant.
            // After fix, passing 'usdt0-arb' or 'usdt0-arb' should
            // make a bare 0x address resolve to Arbitrum.
            const source = readSource('utils/helpers/paymentAddressParser.ts');

            // Check the sourceHint parameter type includes an Arbitrum option
            const typeAnnotation = source.match(
                /sourceHint\??\s*:\s*'([^']+)'\s*\|\s*'([^']+)'\s*(\|\s*'([^']+))?/
            );
            const types = typeAnnotation
                ? [typeAnnotation[1], typeAnnotation[2], typeAnnotation[4]].filter(Boolean)
                : [];
            expect(types.some((t) => t?.includes('arb'))).toBe(true);
        });
    });

    describe('BUG: parseSendAddress source type excludes Arbitrum', () => {
        it('parseSendAddress source parameter type accepts Arbitrum', () => {
            // parseSendAddress source param is typed as:
            //   'rootstock-bitcoin' | 'usdt-bsc'
            // No Arbitrum option exists.
            const source = readSource('utils/parseSendAddress.ts');

            // Find the source parameter type annotation
            const sourceParam = source.match(
                /source\s*:\s*'([^']+)'\s*\|\s*'([^']+)/
            );
            const types = sourceParam
                ? [sourceParam[1], sourceParam[2]]
                : [];
            expect(types.some((t) => t.includes('arb'))).toBe(true);
        });
    });

    describe('Receive form generates addresses for Arbitrum', () => {
        it('handleDirectReceive uses rskAddress for Arbitrum (same EOA on all EVM chains)', () => {
            const source = readSource('utils/generate-receive-invoice.ts');

            // handleDirectReceive returns walletAddress directly without
            // EIP-681 formatting (e.g., ethereum:0x...@42161)
            expect(source).toContain('handleDirectReceive');

            // The RSK address IS the Arbitrum address (same EOA derivation)
            // This is correct behavior — same private key → same address on all EVM chains
            const arbSection = source.substring(
                source.indexOf("['usdt0-arb'"),
                source.indexOf('}', source.indexOf("['usdt0-arb'")) + 1
            );
            expect(arbSection).toMatch(/\brskAddress\b/);
        });
    });
});
