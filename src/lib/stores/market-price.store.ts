import { writable, derived, get } from 'svelte/store';
import { pageVisibilityManager } from '$lib/utils/helpers/pageVisibility';
import cryptoPriceService from '$lib/api/services/crypto-price.service';

type MarketPriceState = {
  btcUsd: number;
  rbtcUsd: number;
  lastFetched: number;
  isRefreshing: boolean;
  error: string | null;
};

type MarketPriceCachePayload = Pick<MarketPriceState, 'btcUsd' | 'rbtcUsd' | 'lastFetched'>;

const MARKET_PRICE_STORAGE_KEY = 'bittasker-market-price-cache-v1';
const MARKET_PRICE_POLL_INTERVAL = 5 * 60 * 1000;
const MARKET_PRICE_FRESHNESS_TTL = MARKET_PRICE_POLL_INTERVAL;
const MARKET_PRICE_CACHE_TTL = 60 * 60 * 1000;
const MARKET_PRICE_REFRESH_ERROR = 'Failed to refresh BTC and RBTC prices';

const cachedPrices = readCachedPrices();

const initialState: MarketPriceState = {
  btcUsd: cachedPrices?.btcUsd ?? 0,
  rbtcUsd: cachedPrices?.rbtcUsd ?? 0,
  lastFetched: cachedPrices?.lastFetched ?? 0,
  isRefreshing: false,
  error: null
};

const store = writable<MarketPriceState>(initialState);
let pollingRegistered = false;
let refreshPromise: Promise<void> | null = null;
let nextRefreshRequestId = 0;
let latestCommittedRequestId = 0;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPositivePrice(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function getMarketPriceAge(lastFetched: number, now = Date.now()): number {
  if (!isFiniteNumber(lastFetched) || lastFetched <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(0, now - lastFetched);
}

function isMarketPriceFresh(lastFetched: number, now = Date.now()): boolean {
  return getMarketPriceAge(lastFetched, now) <= MARKET_PRICE_FRESHNESS_TTL;
}

function isMarketPriceCacheValid(lastFetched: number, now = Date.now()): boolean {
  return getMarketPriceAge(lastFetched, now) <= MARKET_PRICE_CACHE_TTL;
}

function normalizeFreshPrice(result: PromiseSettledResult<number>): number | null {
  if (result.status !== 'fulfilled') return null;
  return isPositivePrice(result.value) ? result.value : null;
}

function readCachedPrices(): MarketPriceCachePayload | null {
  if (typeof localStorage === 'undefined') return null;

  try {
    const raw = localStorage.getItem(MARKET_PRICE_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);

    if (
      parsed &&
      isPositivePrice(parsed.btcUsd) &&
      isPositivePrice(parsed.rbtcUsd) &&
      isFiniteNumber(parsed.lastFetched) &&
      isMarketPriceCacheValid(parsed.lastFetched)
    ) {
      return {
        btcUsd: parsed.btcUsd,
        rbtcUsd: parsed.rbtcUsd,
        lastFetched: parsed.lastFetched
      };
    }
  } catch (error) {
    console.error('[market-price] readCachedPrices()', error);
  }

  return null;
}

function persistCachedPrices(payload: MarketPriceCachePayload): void {
  if (typeof localStorage === 'undefined') return;

  try {
    localStorage.setItem(MARKET_PRICE_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.error('[market-price] persistCachedPrices()', error);
  }
}

function buildResolvedPrices(
  previousState: MarketPriceState,
  btcResult: PromiseSettledResult<number>,
  rbtcResult: PromiseSettledResult<number>
): {
  btcUsd: number | null;
  rbtcUsd: number | null;
  hasFreshSuccess: boolean;
} {
  const freshBtcUsd = normalizeFreshPrice(btcResult);
  const freshRbtcUsd = normalizeFreshPrice(rbtcResult);
  const hasFreshSuccess = freshBtcUsd !== null || freshRbtcUsd !== null;

  let btcUsd = freshBtcUsd ?? (isPositivePrice(previousState.btcUsd) ? previousState.btcUsd : null);
  let rbtcUsd = freshRbtcUsd ?? (isPositivePrice(previousState.rbtcUsd) ? previousState.rbtcUsd : null);

  if (btcUsd === null) {
    btcUsd = freshRbtcUsd ?? rbtcUsd;
  }

  if (rbtcUsd === null) {
    rbtcUsd = freshBtcUsd ?? btcUsd;
  }

  return {
    btcUsd,
    rbtcUsd,
    hasFreshSuccess
  };
}

async function runRefresh(requestId: number): Promise<void> {
  store.update((state) => ({ ...state, isRefreshing: true, error: null }));

  try {
    const [btcResult, rbtcResult] = await Promise.allSettled([
      cryptoPriceService.getCurrentPrice('BTC'),
      cryptoPriceService.getCurrentPrice('RBTC')
    ]);

    const previousState = get(store);
    const { btcUsd, rbtcUsd, hasFreshSuccess } = buildResolvedPrices(
      previousState,
      btcResult,
      rbtcResult
    );

    if (!hasFreshSuccess || !btcUsd || !rbtcUsd) {
      throw new Error(MARKET_PRICE_REFRESH_ERROR);
    }

    if (requestId < latestCommittedRequestId) {
      return;
    }

    latestCommittedRequestId = requestId;
    const lastFetched = Date.now();

    const nextState: MarketPriceState = {
      btcUsd,
      rbtcUsd,
      lastFetched,
      isRefreshing: false,
      error: null
    };

    store.set(nextState);
    persistCachedPrices({ btcUsd, rbtcUsd, lastFetched });
  } catch (error) {
    if (requestId < latestCommittedRequestId) {
      return;
    }

    store.update((state) => ({
      ...state,
      isRefreshing: false,
      error: error instanceof Error ? error.message : MARKET_PRICE_REFRESH_ERROR
    }));
    console.error('[market-price] refreshPrices()', error);
  }
}

function refreshPrices(): Promise<void> {
  if (refreshPromise) {
    return refreshPromise;
  }

  const requestId = ++nextRefreshRequestId;
  const inFlightRefresh = runRefresh(requestId).finally(() => {
    if (refreshPromise === inFlightRefresh) {
      refreshPromise = null;
    }
  });

  refreshPromise = inFlightRefresh;
  return inFlightRefresh;
}

function ensurePollingRegistered(): void {
  if (pollingRegistered) return;
  pollingRegistered = true;
  pageVisibilityManager.registerPolling('market-price', {
    interval: MARKET_PRICE_POLL_INTERVAL,
    callback: refreshPrices,
    runImmediately: true
  });
}

function stopPolling(): void {
  if (!pollingRegistered) return;
  pollingRegistered = false;
  pageVisibilityManager.unregisterPolling('market-price');
}

export function hydrateFromCache(): void {
  const cached = readCachedPrices();
  if (!cached) return;

  store.update((state) => ({
    ...state,
    btcUsd: cached.btcUsd,
    rbtcUsd: cached.rbtcUsd,
    lastFetched: cached.lastFetched
  }));
}

export function __resetMarketPriceStoreForTests(): void {
  refreshPromise = null;
  nextRefreshRequestId = 0;
  latestCommittedRequestId = 0;
  stopPolling();

  const cached = readCachedPrices();

  store.set({
    btcUsd: cached?.btcUsd ?? 0,
    rbtcUsd: cached?.rbtcUsd ?? 0,
    lastFetched: cached?.lastFetched ?? 0,
    isRefreshing: false,
    error: null
  });
}

const marketPrice = {
  subscribe: store.subscribe,
  refresh: refreshPrices,
  startPolling: ensurePollingRegistered,
  stopPolling,
  hydrateFromCache
};

const btcUsd = derived(store, ($store) => $store.btcUsd);
const rbtcUsd = derived(store, ($store) => $store.rbtcUsd);
const marketPriceMeta = derived(store, ($store) => ({
  lastFetched: $store.lastFetched,
  isRefreshing: $store.isRefreshing,
  error: $store.error
}));

export {
  marketPrice,
  MARKET_PRICE_POLL_INTERVAL,
  MARKET_PRICE_FRESHNESS_TTL,
  MARKET_PRICE_CACHE_TTL,
  btcUsd,
  rbtcUsd,
  marketPriceMeta,
  MARKET_PRICE_STORAGE_KEY,
  getMarketPriceAge,
  isMarketPriceFresh,
  isMarketPriceCacheValid
};
