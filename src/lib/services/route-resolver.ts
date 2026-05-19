/**
 * Cross-wallet Route Resolver
 *
 * Pure function that resolves viable swap routes between source wallets
 * and destinations. No side effects, no network calls, deterministic output.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SourceWallet = 'rbtc' | 'usdt-bsc';

export type Destination =
	| { type: 'address'; chainId: number; address: string }
	| { type: 'invoice'; network: 'lightning' | 'onchain'; invoice: string };

export interface RouteHop {
	service: 'direct' | 'changelly' | 'boltz' | 'lifi' | 'symbiosis';
	fromAsset: string;
	fromChain: string;
	toAsset: string;
	toChain: string;
	feePercent: number;
	estimatedTimeMin: number;
	estimatedTimeMax: number;
}

export interface Route {
	id: string;
	label: string;
	hops: RouteHop[];
	totalFeePercent: number;
	estimatedTime: string;
	recommended: boolean;
}

// ---------------------------------------------------------------------------
// Constants — chain identifiers
// ---------------------------------------------------------------------------

const CHAIN_RSK = 'rsk';
const CHAIN_BSC = 'bsc';
const CHAIN_BITCOIN = 'bitcoin';
const CHAIN_LIGHTNING = 'lightning';
const CHAIN_ARBITRUM = 'arbitrum';

const ASSET_RBTC = 'RBTC';
const ASSET_USDT = 'USDT';
const ASSET_BTC = 'BTC';

const RSK_CHAIN_IDS = new Set([30, 31]);
const BSC_CHAIN_IDS = new Set([56, 97]);

// ---------------------------------------------------------------------------
// Constants — fee percent
// ---------------------------------------------------------------------------

const FEE_DIRECT = 0;
const FEE_CHANGELLY_RBTC_USDT = 0.25;
const FEE_CHANGELLY_USDT_BTC = 0.25;
const FEE_CHANGELLY_USDT_RBTC_DIRECT = 4;
const FEE_CHANGELLY_USDT_ARB_USDT = 0.25;
const FEE_BOLTZ_SUBMARINE = 0.1;
const FEE_BOLTZ_CHAIN_SWAP = 0.1;
const FEE_BOLTZ_USDT_ARB_LIGHTNING = 0.88;
const FEE_LIFI_DEFAULT = 0.5;
const FEE_SYMBIOSIS_DEFAULT = 0.3;

// ---------------------------------------------------------------------------
// Constants — time in minutes
// ---------------------------------------------------------------------------

const TIME_DIRECT_MIN = 0;
const TIME_DIRECT_MAX = 1;
const TIME_CHANGELLY_MIN = 10;
const TIME_CHANGELLY_MAX = 30;
const TIME_BOLTZ_MIN = 5;
const TIME_BOLTZ_MAX = 15;
const TIME_LIFI_MIN = 5;
const TIME_LIFI_MAX = 15;
const TIME_SYMBIOSIS_MIN = 3;
const TIME_SYMBIOSIS_MAX = 10;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRSKChain(chainId: number): boolean {
	return RSK_CHAIN_IDS.has(chainId);
}

function isBSCChain(chainId: number): boolean {
	return BSC_CHAIN_IDS.has(chainId);
}

function formatEstimatedTime(min: number, max: number): string {
	if (min === 0 && max <= 1) {
		return '~1 min';
	}
	return `${min}-${max} min`;
}

/**
 * Calculate total fee percent for a multi-hop route.
 * Fees compound multiplicatively across hops:
 *   total = 1 - (1 - f1/100) * (1 - f2/100) * ...
 * Rounded to 2 decimal places.
 */
function calculateTotalFee(hops: RouteHop[]): number {
	if (hops.length === 0) return 0;

	let product = 1;
	for (const hop of hops) {
		product *= 1 - hop.feePercent / 100;
	}
	const total = (1 - product) * 100;
	// Round to 2 decimal places, avoiding floating-point artifacts
	return Math.round(total * 100) / 100;
}

// ---------------------------------------------------------------------------
// Route builder
// ---------------------------------------------------------------------------

function buildRoute(opts: {
	id: string;
	label: string;
	hops: RouteHop[];
	recommended: boolean;
}): Route {
	const totalFeePercent = calculateTotalFee(opts.hops);
	const overallMin = opts.hops[0].estimatedTimeMin;
	const overallMax = opts.hops[opts.hops.length - 1].estimatedTimeMax;

	return {
		id: opts.id,
		label: opts.label,
		hops: opts.hops,
		totalFeePercent,
		estimatedTime: formatEstimatedTime(overallMin, overallMax),
		recommended: opts.recommended
	};
}

// ---------------------------------------------------------------------------
// Route matrix — rBTC source
// ---------------------------------------------------------------------------

function resolveFromRBTC(destination: Destination): Route[] {
	if (destination.type === 'address') {
		if (isRSKChain(destination.chainId)) {
			return [
				buildRoute({
					id: 'rbtc-to-rbtc-direct',
					label: 'Direct',
					hops: [
						{
							service: 'direct',
							fromAsset: ASSET_RBTC,
							fromChain: CHAIN_RSK,
							toAsset: ASSET_RBTC,
							toChain: CHAIN_RSK,
							feePercent: FEE_DIRECT,
							estimatedTimeMin: TIME_DIRECT_MIN,
							estimatedTimeMax: TIME_DIRECT_MAX
						}
					],
					recommended: true
				})
			];
		}

		if (isBSCChain(destination.chainId)) {
			return [
				buildRoute({
					id: 'rbtc-to-bsc-via-lifi',
					label: 'LI.FI',
					hops: [
						{
							service: 'lifi',
							fromAsset: ASSET_RBTC,
							fromChain: CHAIN_RSK,
							toAsset: ASSET_USDT,
							toChain: CHAIN_BSC,
							feePercent: FEE_LIFI_DEFAULT,
							estimatedTimeMin: TIME_LIFI_MIN,
							estimatedTimeMax: TIME_LIFI_MAX
						}
					],
					recommended: true
				}),
				buildRoute({
					id: 'rbtc-to-bsc-via-symbiosis',
					label: 'Symbiosis',
					hops: [
						{
							service: 'symbiosis',
							fromAsset: ASSET_RBTC,
							fromChain: CHAIN_RSK,
							toAsset: ASSET_USDT,
							toChain: CHAIN_BSC,
							feePercent: FEE_SYMBIOSIS_DEFAULT,
							estimatedTimeMin: TIME_SYMBIOSIS_MIN,
							estimatedTimeMax: TIME_SYMBIOSIS_MAX
						}
					],
					recommended: false
				}),
				buildRoute({
					id: 'rbtc-to-bsc-via-changelly',
					label: 'Changelly',
					hops: [
						{
							service: 'changelly',
							fromAsset: ASSET_RBTC,
							fromChain: CHAIN_RSK,
							toAsset: ASSET_USDT,
							toChain: CHAIN_BSC,
							feePercent: FEE_CHANGELLY_RBTC_USDT,
							estimatedTimeMin: TIME_CHANGELLY_MIN,
							estimatedTimeMax: TIME_CHANGELLY_MAX
						}
					],
					recommended: false
				})
			];
		}

		return [];
	}

	if (destination.network === 'lightning') {
		return [
			buildRoute({
				id: 'rbtc-to-lightning-via-boltz',
				label: 'Boltz',
				hops: [
					{
						service: 'boltz',
						fromAsset: ASSET_RBTC,
						fromChain: CHAIN_RSK,
						toAsset: ASSET_BTC,
						toChain: CHAIN_LIGHTNING,
						feePercent: FEE_BOLTZ_SUBMARINE,
						estimatedTimeMin: TIME_BOLTZ_MIN,
						estimatedTimeMax: TIME_BOLTZ_MAX
					}
				],
				recommended: true
			})
		];
	}

	if (destination.network === 'onchain') {
		return [
			buildRoute({
				id: 'rbtc-to-btc-via-boltz',
				label: 'Boltz',
				hops: [
					{
						service: 'boltz',
						fromAsset: ASSET_RBTC,
						fromChain: CHAIN_RSK,
						toAsset: ASSET_BTC,
						toChain: CHAIN_BITCOIN,
						feePercent: FEE_BOLTZ_CHAIN_SWAP,
						estimatedTimeMin: TIME_BOLTZ_MIN,
						estimatedTimeMax: TIME_BOLTZ_MAX
					}
				],
				recommended: true
			})
		];
	}

	return [];
}

// ---------------------------------------------------------------------------
// Route matrix — USDT (BSC) source
// ---------------------------------------------------------------------------

function resolveFromUSDTBSC(destination: Destination): Route[] {
	if (destination.type === 'address') {
		if (isBSCChain(destination.chainId)) {
			return [
				buildRoute({
					id: 'usdt-to-bsc-direct',
					label: 'Direct',
					hops: [
						{
							service: 'direct',
							fromAsset: ASSET_USDT,
							fromChain: CHAIN_BSC,
							toAsset: ASSET_USDT,
							toChain: CHAIN_BSC,
							feePercent: FEE_DIRECT,
							estimatedTimeMin: TIME_DIRECT_MIN,
							estimatedTimeMax: TIME_DIRECT_MAX
						}
					],
					recommended: true
				})
			];
		}

		if (isRSKChain(destination.chainId)) {
			return [
				buildRoute({
					id: 'usdt-to-rbtc-via-lifi',
					label: 'LI.FI',
					hops: [
						{
							service: 'lifi',
							fromAsset: ASSET_USDT,
							fromChain: CHAIN_BSC,
							toAsset: ASSET_RBTC,
							toChain: CHAIN_RSK,
							feePercent: FEE_LIFI_DEFAULT,
							estimatedTimeMin: TIME_LIFI_MIN,
							estimatedTimeMax: TIME_LIFI_MAX
						}
					],
					recommended: true
				}),
				buildRoute({
					id: 'usdt-to-rbtc-via-symbiosis',
					label: 'Symbiosis',
					hops: [
						{
							service: 'symbiosis',
							fromAsset: ASSET_USDT,
							fromChain: CHAIN_BSC,
							toAsset: ASSET_RBTC,
							toChain: CHAIN_RSK,
							feePercent: FEE_SYMBIOSIS_DEFAULT,
							estimatedTimeMin: TIME_SYMBIOSIS_MIN,
							estimatedTimeMax: TIME_SYMBIOSIS_MAX
						}
					],
					recommended: false
				}),
				buildRoute({
					id: 'usdt-to-rbtc-via-changelly-boltz',
					label: 'Changelly + Boltz',
					hops: [
						{
							service: 'changelly',
							fromAsset: ASSET_USDT,
							fromChain: CHAIN_BSC,
							toAsset: ASSET_BTC,
							toChain: CHAIN_BITCOIN,
							feePercent: FEE_CHANGELLY_USDT_BTC,
							estimatedTimeMin: TIME_CHANGELLY_MIN,
							estimatedTimeMax: TIME_CHANGELLY_MAX
						},
						{
							service: 'boltz',
							fromAsset: ASSET_BTC,
							fromChain: CHAIN_BITCOIN,
							toAsset: ASSET_RBTC,
							toChain: CHAIN_RSK,
							feePercent: FEE_BOLTZ_CHAIN_SWAP,
							estimatedTimeMin: TIME_BOLTZ_MIN,
							estimatedTimeMax: TIME_BOLTZ_MAX
						}
					],
					recommended: true
				}),
				buildRoute({
					id: 'usdt-to-rbtc-via-changelly-direct',
					label: 'Changelly Direct',
					hops: [
						{
							service: 'changelly',
							fromAsset: ASSET_USDT,
							fromChain: CHAIN_BSC,
							toAsset: ASSET_RBTC,
							toChain: CHAIN_RSK,
							feePercent: FEE_CHANGELLY_USDT_RBTC_DIRECT,
							estimatedTimeMin: TIME_CHANGELLY_MIN,
							estimatedTimeMax: TIME_CHANGELLY_MAX
						}
					],
					recommended: false
				})
			];
		}

		return [];
	}

	if (destination.network === 'lightning') {
		return [
			buildRoute({
				id: 'usdt-to-lightning-via-changelly-boltz',
				label: 'Changelly + Boltz',
				hops: [
					{
						service: 'changelly',
						fromAsset: ASSET_USDT,
						fromChain: CHAIN_BSC,
						toAsset: ASSET_USDT,
						toChain: CHAIN_ARBITRUM,
						feePercent: FEE_CHANGELLY_USDT_ARB_USDT,
						estimatedTimeMin: TIME_CHANGELLY_MIN,
						estimatedTimeMax: TIME_CHANGELLY_MAX
					},
					{
						service: 'boltz',
						fromAsset: ASSET_USDT,
						fromChain: CHAIN_ARBITRUM,
						toAsset: ASSET_BTC,
						toChain: CHAIN_LIGHTNING,
						feePercent: FEE_BOLTZ_USDT_ARB_LIGHTNING,
						estimatedTimeMin: TIME_BOLTZ_MIN,
						estimatedTimeMax: TIME_BOLTZ_MAX
					}
				],
				recommended: true
			})
		];
	}

	if (destination.network === 'onchain') {
		return [
			buildRoute({
				id: 'usdt-to-btc-via-changelly',
				label: 'Changelly',
				hops: [
					{
						service: 'changelly',
						fromAsset: ASSET_USDT,
						fromChain: CHAIN_BSC,
						toAsset: ASSET_BTC,
						toChain: CHAIN_BITCOIN,
						feePercent: FEE_CHANGELLY_USDT_BTC,
						estimatedTimeMin: TIME_CHANGELLY_MIN,
						estimatedTimeMax: TIME_CHANGELLY_MAX
					}
				],
				recommended: true
			})
		];
	}

	return [];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve viable swap routes from a source wallet to a destination.
 *
 * Pure function -- deterministic, no side effects, no network calls.
 *
 * @param source - The source wallet identifier
 * @param destination - The destination to send funds to
 * @returns A sorted array of viable routes (best first), or empty array if no
 *          route exists
 *
 * @example
 * ```ts
 * const routes = resolveRoute('rbtc', {
 *   type: 'address',
 *   chainId: 56,
 *   address: '0x...'
 * });
 * // => [{ id: 'rbtc-to-bsc-via-changelly', ... }]
 * ```
 */
export function resolveRoute(source: SourceWallet, destination: Destination): Route[] {
	switch (source) {
		case 'rbtc':
			return resolveFromRBTC(destination);
		case 'usdt-bsc':
			return resolveFromUSDTBSC(destination);
		default:
			return [];
	}
}
