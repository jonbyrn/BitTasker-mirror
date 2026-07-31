import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    resolveFromTicker,
    resolveToTicker,
    NETWORK_TO_CHANGELLY_FROM,
    ARBITRUM_USDT0_TO_TICKER,
    findTickerByNetwork,
    loadChangellyCurrencies,
    resetTickerCache
} from '$lib/services/changelly-ticker-map';

vi.mock('$lib/utils/debug', () => ({
    createDebug: () => ({
        log: vi.fn(),
        error: vi.fn(),
        warn: vi.fn()
    })
}));

vi.mock('$lib/services/changelly.service', () => ({
    changellyService: {
        getCurrencies: vi.fn().mockResolvedValue([
            { name: 'Tether', ticker: 'usdt', enabled: true, network: 'ethereum', precision: 6 },
            { name: 'Tether', ticker: 'usdtc', enabled: true, network: 'avalanche_c_chain', precision: 6 },
            { name: 'Tether', ticker: 'usdtbase', enabled: true, network: 'base', precision: 6 },
            { name: 'Tether', ticker: 'usdtop', enabled: true, network: 'optimism', precision: 6 },
            { name: 'Tether', ticker: 'usdtpolygon', enabled: true, network: 'polygon', precision: 6 },
            { name: 'Tether', ticker: 'usdttrc20', enabled: true, network: 'tron', precision: 6 },
            { name: 'Tether', ticker: 'usdtarb', enabled: true, network: 'arbitrum', precision: 6 }
        ])
    }
}));

vi.mock('$lib/services/kill-switch', () => ({
    isChangeallySwapsEnabled: () => true
}));

describe('Changelly ticker mapping', () => {
    beforeEach(() => {
        resetTickerCache();
    });

    describe('resolveFromTicker', () => {
        it('Ethereum → usdt', () => {
            expect(resolveFromTicker('usdt-ethereum')).toBe('usdt');
        });
        it('Avalanche → usdtc', () => {
            expect(resolveFromTicker('usdt-avalanche')).toBe('usdtc');
        });
        it('Base → usdtbase', () => {
            expect(resolveFromTicker('usdt-base')).toBe('usdtbase');
        });
        it('Optimism → usdtop', () => {
            expect(resolveFromTicker('usdt-optimism')).toBe('usdtop');
        });
        it('Polygon → usdtpolygon', () => {
            expect(resolveFromTicker('usdt-polygon')).toBe('usdtpolygon');
        });
        it('TRON → usdttrc20', () => {
            expect(resolveFromTicker('usdt-tron')).toBe('usdttrc20');
        });
        it('unknown usdt-* → usdt fallback', () => {
            expect(resolveFromTicker('usdt-unknown')).toBe('usdt');
        });
        it('unknown usdt0-* → usdt0 fallback', () => {
            expect(resolveFromTicker('usdt0-unknown')).toBe('usdt0');
        });
    });

    describe('resolveToTicker', () => {
        it('returns Arbitrum USDT0 ticker', () => {
            expect(resolveToTicker()).toBe(ARBITRUM_USDT0_TO_TICKER);
        });
    });

    describe('findTickerByNetwork', () => {
        it('finds usdtarb by arbitrum network', async () => {
            await loadChangellyCurrencies();
            expect(findTickerByNetwork('arbitrum', 'usdt')).toBe('usdtarb');
        });
        it('finds usdtc by avalanche', async () => {
            await loadChangellyCurrencies();
            expect(findTickerByNetwork('avalanche', 'usdt')).toBe('usdtc');
        });
        it('returns null for unknown network', async () => {
            await loadChangellyCurrencies();
            expect(findTickerByNetwork('unknown', 'usdt')).toBeNull();
        });
    });

    describe('loadChangellyCurrencies', () => {
        it('caches currencies after first load', async () => {
            const cache1 = await loadChangellyCurrencies();
            const cache2 = await loadChangellyCurrencies();
            expect(cache1).toBe(cache2);
        });
        it('contains all enabled currencies', async () => {
            const cache = await loadChangellyCurrencies();
            expect(cache.has('usdt')).toBe(true);
            expect(cache.has('usdtarb')).toBe(true);
        });
    });
});
