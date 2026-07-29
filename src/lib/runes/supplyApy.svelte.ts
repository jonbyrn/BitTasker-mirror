import { ethers } from 'ethers';
import { tryCatch } from '$lib/utils/tryCatch';
import { AaveService, USDT0_ARBITRUM } from '$lib/services/defi/aave.service';
import { createDebug } from '$lib/utils/debug';

const d = createDebug('supplyApy');

const ARB_PUBLIC_RPC = 'https://arb1.arbitrum.io/rpc';
const REFRESH_INTERVAL_MS = 60 * 1000; // 60 seconds

class SupplyApy {
	/** Current supply APY (null until first fetch completes) */
	apy = $state<number | null>(null);
	/** Whether a live value has been fetched at least once */
	loaded = $state(false);

	private intervalId: ReturnType<typeof setInterval> | null = null;
	private fetching = false;

	constructor() {
		if (typeof window !== 'undefined') {
			d.log('initializing');
			void this.fetch();
			this.intervalId = setInterval(() => void this.fetch(), REFRESH_INTERVAL_MS);
		}
	}

	async fetch(): Promise<void> {
		if (this.fetching) return;
		this.fetching = true;
		d.log('fetching');

		const provider = new ethers.JsonRpcProvider(ARB_PUBLIC_RPC);
		const aave = new AaveService(provider);
		const { data: apy, error } = await tryCatch(aave.getSupplyAPY(USDT0_ARBITRUM));

		if (!error && apy !== undefined && isFinite(apy)) {
			this.apy = apy;
			this.loaded = true;
			d.log('fetched', { apy });
		} else {
			d.log('fetch failed, keeping current value', { current: this.apy });
		}

		this.fetching = false;
	}
}

export const supplyApy = new SupplyApy();
