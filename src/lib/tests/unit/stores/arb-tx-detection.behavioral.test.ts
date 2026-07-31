import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SRC = resolve(__dirname, '../../../');
const readSource = (relativePath: string) =>
    readFileSync(resolve(SRC, relativePath), 'utf8');

describe('Arbitrum transaction detection — production behavior audit', () => {

    describe('BUG: Arbitrum transactions excluded from history', () => {
        it('loadTransactions merges RSK, BSC, AND Arbitrum transactions into allTransactions', () => {
            const source = readSource('stores/wallet/wallet-transactions.ts');

            // The projectTransactions / applyChainSortHints call should include
            // processedArbTxs alongside processedRskTxs and processedBscTxs.
            // Currently _processedArbTxs is destructured at line 161 but excluded
            // from the merge at lines 233-234.
            const mergeBlock = source.substring(
                source.indexOf('const allTransactions = projectTransactions'),
                source.indexOf('walletStore.update')
            );

            // FIXED behavior: processedArbTxs (no underscore) appears in the merge
            expect(mergeBlock).toContain('processedArbTxs');
            // Should NOT use the discarded _processedArbTxs variable in the merge
            expect(mergeBlock).not.toMatch(/\b_processedArbTxs\b/);
        });

        it('the destructured variable name does not have an underscore prefix (signals intentional use)', () => {
            const source = readSource('stores/wallet/wallet-transactions.ts');

            // Line 161: const [processedRskTxs, processedBscTxs, _processedArbTxs]
            // The underscore prefix signals it's intentionally unused — a bug.
            // After fix, it should be `processedArbTxs` (no underscore).
            expect(source).not.toMatch(
                /const\s*\[[^\]]*_processedArbTxs/
            );
        });

        it('projectTransactions receives transactions from all 3 chains', () => {
            const source = readSource('stores/wallet/wallet-transactions.ts');

            // Find the projectTransactions call and verify it includes arb txs
            const projectCall = source.match(
                /projectTransactions\(\s*applyChainSortHints\(\[([^\]]+)\]/
            );
            expect(projectCall).not.toBeNull();
            // The array should include processedArbTxs
            expect(projectCall![1]).toContain('processedArbTxs');
        });
    });

    describe('BUG: Incoming USDT0 not detected (only RBTC sats tracked)', () => {
        it('totalSats in wallet-balances.ts is derived from totalUsd (includes ALL assets)', () => {
            const source = readSource('stores/wallet/wallet-balances.ts');

            // totalSats should be calculated from totalUsd / btcPrice so that
            // ALL assets (RBTC, WBTC, tBTC, USDT0, DOC, BNB, USDT) are included.
            const satsLine = source.match(/totalSats\s*=\s*[^;]+/)?.[0] ?? '';
            expect(satsLine).toMatch(/totalUsd/i);
            expect(satsLine).toMatch(/btcPrice/i);
        });

        it('totalBalances.sats includes Arbitrum assets converted to BTC-equivalent', () => {
            const source = readSource('stores/wallet/wallet-balances.ts');

            // totalSats is now calculated as totalUsd / btcPrice * 100_000_000,
            // which implicitly includes all Arbitrum assets since their USD values
            // are accumulated into totalUsd earlier in loadAssets().
            const satsLine = source.match(/totalSats\s*=\s*[^;]+/)?.[0] ?? '';

            // Should reference totalUsd (which includes all assets) for conversion
            expect(satsLine).toMatch(/totalUsd/i);
        });
    });

    describe('BUG: No Arbitrum block watcher', () => {
        it('ensureBlockWatch registers watchers for both RSK and Arbitrum', () => {
            const source = readSource('stores/wallet/wallet-init.ts');

            // Should have Arbitrum block watching alongside RSK
            const hasArbWatcher =
                source.includes('arbWallet.onBlock') ||
                source.includes('arbProvider.on') ||
                source.includes('ensureArbitrumBlockWatch') ||
                source.includes('arbWallet?.onBlock');
            expect(hasArbWatcher).toBe(true);
        });

        it('blockchainToastStore.onBlock is called for Arbitrum blocks', () => {
            const source = readSource('stores/wallet/wallet-init.ts');

            // Should call onBlock with 'arb' or 'arbitrum'
            // Currently only calls blockchainToastStore.onBlock('rsk', ...)
            expect(source).toMatch(/onBlock\(\s*['"]arb/i);
        });
    });

    describe('BUG: Token transfers not fetched for Arbitrum', () => {
        it('fetchArbitrumTransactions fetches token-transfers endpoint', () => {
            const source = readSource('utils/wallet/transactionHistory.ts');

            // The fetchArbitrumTransactions function should call token-transfers
            // Currently it only fetches native transactions (line 1069)
            const fetchArbStart = source.indexOf('fetchArbitrumTransactions');
            const fetchArbSection = source.substring(
                fetchArbStart,
                fetchArbStart + 2000
            );
            expect(fetchArbSection).toContain('token-transfers');
        });

        it('mapBlockscoutToTransaction preserves token_transfers data from API response', () => {
            const source = readSource('utils/wallet/transactionHistory.ts');

            // Should NOT have token_transfers: null (line 1031)
            // Should map token_transfers from the API item
            expect(source).not.toContain('token_transfers: null');
        });
    });
});
