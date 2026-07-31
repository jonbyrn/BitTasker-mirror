import { changellyService, type ChangellyCurrency } from './changelly.service';
import { createDebug } from '$lib/utils/debug';

const d = createDebug('changelly-ticker');

export const NETWORK_TO_CHANGELLY_FROM: Record<string, string> = {
	'usdt-ethereum': 'usdt',
	'usdt-avalanche': 'usdtc',
	'usdt-base': 'usdtbase',
	'usdt-optimism': 'usdtop',
	'usdt-polygon': 'usdtpolygon',
	'usdt-tron': 'usdttrc20'
};

export const ARBITRUM_USDT0_TO_TICKER = 'usdtarb';

let currencyCache: Map<string, ChangellyCurrency> | null = null;

export function resolveFromTicker(payerNetwork: string): string {
	const staticTicker = NETWORK_TO_CHANGELLY_FROM[payerNetwork];
	if (staticTicker) return staticTicker;

	if (payerNetwork.startsWith('usdt-')) return 'usdt';
	if (payerNetwork.startsWith('usdt0-')) return 'usdt0';

	return 'usdt';
}

export function resolveToTicker(): string {
	return ARBITRUM_USDT0_TO_TICKER;
}

export async function loadChangellyCurrencies(): Promise<Map<string, ChangellyCurrency>> {
	if (currencyCache) return currencyCache;

	try {
		const currencies = await changellyService.getCurrencies();
		currencyCache = new Map();
		for (const c of currencies) {
			if (c.enabled) {
				currencyCache.set(c.ticker.toLowerCase(), c);
			}
		}
		d.log('Loaded %d Changelly currencies', currencyCache.size);
	} catch (err) {
		d.warn('Failed to load Changelly currencies:', err);
		currencyCache = new Map();
	}

	return currencyCache;
}

export function findTickerByNetwork(network: string, symbol: string): string | null {
	if (!currencyCache) return null;
	const lower = network.toLowerCase();
	const symLower = symbol.toLowerCase();

	for (const [ticker, currency] of currencyCache) {
		if (currency.network?.toLowerCase().includes(lower) && ticker.startsWith(symLower)) {
			return ticker;
		}
	}
	return null;
}

export function resetTickerCache(): void {
	currencyCache = null;
}
