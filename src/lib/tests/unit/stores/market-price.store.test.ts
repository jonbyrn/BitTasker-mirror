import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import cryptoPriceService from '$lib/api/services/crypto-price.service';
import {
  marketPrice,
  btcUsd,
  rbtcUsd,
  marketPriceMeta,
  MARKET_PRICE_FRESHNESS_TTL,
  MARKET_PRICE_CACHE_TTL,
  isMarketPriceFresh,
  isMarketPriceCacheValid,
  __resetMarketPriceStoreForTests
} from '$lib/stores/market-price.store';

vi.mock('$lib/api/services/crypto-price.service', () => ({
  default: {
    getCurrentPrice: vi.fn()
  }
}));

const MARKET_PRICE_STORAGE_KEY = 'bittasker-market-price-cache-v1';
const SAMPLE_BTC_PRICE = 65_000;
const SAMPLE_RBTC_PRICE = 64_500;
const FIXED_NOW = new Date('2026-03-19T00:00:00.000Z');

function createDeferred<T>() {
  let resolve!: (value: T) => void;

  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

describe('market-price store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(cryptoPriceService.getCurrentPrice).mockReset();
    localStorage.clear();
    __resetMarketPriceStoreForTests();
  });

  afterEach(() => {
    marketPrice.stopPolling();
    vi.restoreAllMocks();
    vi.useRealTimers();
    localStorage.clear();
  });

  it('refresh() updates BTC and RBTC quotes on success', async () => {
    vi.mocked(cryptoPriceService.getCurrentPrice)
      .mockResolvedValueOnce(SAMPLE_BTC_PRICE)
      .mockResolvedValueOnce(SAMPLE_RBTC_PRICE);

    await marketPrice.refresh();

    expect(get(btcUsd)).toBe(SAMPLE_BTC_PRICE);
    expect(get(rbtcUsd)).toBe(SAMPLE_RBTC_PRICE);
    expect(get(marketPriceMeta)).toEqual({
      lastFetched: FIXED_NOW.getTime(),
      isRefreshing: false,
      error: null
    });
  }, 10_000);

  it('refresh() keeps the cached side on partial success and persists the merged result', async () => {
    localStorage.setItem(
      MARKET_PRICE_STORAGE_KEY,
      JSON.stringify({
        btcUsd: SAMPLE_BTC_PRICE,
        rbtcUsd: SAMPLE_RBTC_PRICE,
        lastFetched: FIXED_NOW.getTime() - 60_000
      })
    );
    __resetMarketPriceStoreForTests();

    vi.mocked(cryptoPriceService.getCurrentPrice)
      .mockResolvedValueOnce(SAMPLE_BTC_PRICE + 1_000)
      .mockRejectedValueOnce(new Error('RBTC unavailable'));

    await marketPrice.refresh();

    expect(get(btcUsd)).toBe(SAMPLE_BTC_PRICE + 1_000);
    expect(get(rbtcUsd)).toBe(SAMPLE_RBTC_PRICE);
    expect(get(marketPriceMeta)).toEqual({
      lastFetched: FIXED_NOW.getTime(),
      isRefreshing: false,
      error: null
    });
    expect(JSON.parse(localStorage.getItem(MARKET_PRICE_STORAGE_KEY) ?? 'null')).toEqual({
      btcUsd: SAMPLE_BTC_PRICE + 1_000,
      rbtcUsd: SAMPLE_RBTC_PRICE,
      lastFetched: FIXED_NOW.getTime()
    });
  }, 10_000);

  it('refresh() preserves cached values and lastFetched when both requests fail', async () => {
    const cachedLastFetched = FIXED_NOW.getTime() - 120_000;

    localStorage.setItem(
      MARKET_PRICE_STORAGE_KEY,
      JSON.stringify({
        btcUsd: SAMPLE_BTC_PRICE,
        rbtcUsd: SAMPLE_RBTC_PRICE,
        lastFetched: cachedLastFetched
      })
    );
    __resetMarketPriceStoreForTests();

    vi.mocked(cryptoPriceService.getCurrentPrice)
      .mockRejectedValueOnce(new Error('BTC unavailable'))
      .mockRejectedValueOnce(new Error('RBTC unavailable'));

    await marketPrice.refresh();

    expect(get(btcUsd)).toBe(SAMPLE_BTC_PRICE);
    expect(get(rbtcUsd)).toBe(SAMPLE_RBTC_PRICE);
    expect(get(marketPriceMeta)).toEqual({
      lastFetched: cachedLastFetched,
      isRefreshing: false,
      error: 'Failed to refresh BTC and RBTC prices'
    });
    expect(JSON.parse(localStorage.getItem(MARKET_PRICE_STORAGE_KEY) ?? 'null')).toEqual({
      btcUsd: SAMPLE_BTC_PRICE,
      rbtcUsd: SAMPLE_RBTC_PRICE,
      lastFetched: cachedLastFetched
    });
  }, 10_000);

  it('treats stale prices as not fresh while still accepting a valid cache payload', () => {
    const staleButValidLastFetched = FIXED_NOW.getTime() - MARKET_PRICE_FRESHNESS_TTL - 1;

    expect(FIXED_NOW.getTime() - staleButValidLastFetched).toBeLessThan(MARKET_PRICE_CACHE_TTL);

    localStorage.setItem(
      MARKET_PRICE_STORAGE_KEY,
      JSON.stringify({
        btcUsd: SAMPLE_BTC_PRICE,
        rbtcUsd: SAMPLE_RBTC_PRICE,
        lastFetched: staleButValidLastFetched
      })
    );
    __resetMarketPriceStoreForTests();

    expect(isMarketPriceFresh(staleButValidLastFetched, FIXED_NOW.getTime())).toBe(false);
    expect(isMarketPriceCacheValid(staleButValidLastFetched, FIXED_NOW.getTime())).toBe(true);
    expect(get(btcUsd)).toBe(SAMPLE_BTC_PRICE);
    expect(get(rbtcUsd)).toBe(SAMPLE_RBTC_PRICE);
    expect(get(marketPriceMeta).lastFetched).toBe(staleButValidLastFetched);
  }, 10_000);

  it('dedupes concurrent refreshes and applies a single resolved result', async () => {
    const btcRequest = createDeferred<number>();
    const rbtcRequest = createDeferred<number>();

    vi.mocked(cryptoPriceService.getCurrentPrice)
      .mockImplementationOnce(() => btcRequest.promise)
      .mockImplementationOnce(() => rbtcRequest.promise);

    const firstRefresh = marketPrice.refresh();
    const secondRefresh = marketPrice.refresh();

    expect(firstRefresh).toBe(secondRefresh);
    expect(vi.mocked(cryptoPriceService.getCurrentPrice)).toHaveBeenCalledTimes(2);
    expect(get(marketPriceMeta)).toEqual({
      lastFetched: 0,
      isRefreshing: true,
      error: null
    });

    btcRequest.resolve(SAMPLE_BTC_PRICE);
    rbtcRequest.resolve(SAMPLE_RBTC_PRICE);

    await Promise.all([firstRefresh, secondRefresh]);

    expect(get(btcUsd)).toBe(SAMPLE_BTC_PRICE);
    expect(get(rbtcUsd)).toBe(SAMPLE_RBTC_PRICE);
    expect(get(marketPriceMeta)).toEqual({
      lastFetched: FIXED_NOW.getTime(),
      isRefreshing: false,
      error: null
    });
  }, 10_000);
});
