import cryptoPriceService from '$lib/api/services/crypto-price.service';
import { createDebug } from '$lib/utils/debug';

const d = createDebug('btcPrice');

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

class BTCPrice {
	price = $state(0);
	private intervalId: ReturnType<typeof setInterval> | null = null;

	constructor(intervalMs = DEFAULT_INTERVAL_MS) {
		if (typeof window !== 'undefined') {
			d.log('initializing');
			this.fetch();
			this.intervalId = setInterval(() => this.fetch(), intervalMs);
			d.log('polling started', { intervalMs });
		}
	}

	async fetch(): Promise<void> {
		try {
			d.log('fetching');
			const price = await cryptoPriceService.getCurrentPrice('BTC');
			this.price = price;
			d.log('fetched', { price });
		} catch (error) {
			d.error('fetch failed', error);
			console.error('Failed to fetch BTC price:', error);
		}
	}
}

export const btcPrice = new BTCPrice();
