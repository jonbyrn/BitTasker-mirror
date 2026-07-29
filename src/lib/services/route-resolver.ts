/**
 * Cross-wallet Route Resolver
 *
 * Pure function that resolves viable swap routes between source wallets
 * and destinations. No side effects, no network calls, deterministic output.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SourceWallet =
	| 'rbtc'
	| 'usdt-bsc'
	| 'usdt0-rsk'
	| 'usdt0-arb'
	| 'doc-rsk'
	| 'btc-onchain'
	| 'wbtc-arb'
	| 'tbtc-arb';

export type Destination =
	| { type: 'address'; chainId: number; address: string; asset?: string }
	| { type: 'invoice'; network: 'lightning' | 'onchain'; invoice: string };

export interface RouteHop {
	service: 'direct' | 'changelly' | 'boltz' | 'lifi' | 'symbiosis' | 'openocean' | 'uniswap-v3';
	fromAsset: string;
	fromChain: string;
	toAsset: string;
	toChain: string;
	feePercent: number;
	estimatedTimeMin: number;
	estimatedTimeMax: number;
	/** Gas cost in wei from live API quote (LI.FI/Symbiosis). Null = estimated. */
	gasCostWei?: string;
	/** Itemized fees from live API quote. */
	feeCosts?: Array<{ name: string; amount: string }>;
}

export interface Route {
	id: string;
	label: string;
	hops: RouteHop[];
	totalFeePercent: number;
	estimatedTime: string;
	recommended: boolean;
	/** Aggregate gas cost in wei from all hops with live quotes. */
	gasCostWei?: string;
	/** Aggregate itemized fees from all hops with live quotes. */
	feeCosts?: Array<{ name: string; amount: string }>;
	/** Output amount in BTC satoshis, computed by the provider from the live quote. */
	outputSats?: number;
	/** Raw output amount in the destination token's smallest unit (from provider API). */
	outputAmount?: string;
	/** Decimals of the destination token (for interpreting outputAmount). */
	outputDecimals?: number;
	/** Input value in USD (from provider API, for cross-currency cost comparison). */
	inputValueUsd?: number;
	/** Output value in USD (from provider API, for cross-currency cost comparison). */
	outputValueUsd?: number;
}

// ---------------------------------------------------------------------------
// Constants — chain identifiers
// ---------------------------------------------------------------------------

const CHAIN_RSK = 'rsk';
const CHAIN_BSC = 'bsc';
const CHAIN_BITCOIN = 'bitcoin';
const CHAIN_LIGHTNING = 'lightning';
const CHAIN_ARBITRUM = 'arbitrum';
const CHAIN_TRON = 'tron';

/** Pseudo chain ID for TRON (non-EVM, used as placeholder in Destination). */
const TRON_PSEUDO_CHAIN_ID = 0;

const ASSET_RBTC = 'RBTC';
const ASSET_USDT = 'USDT';
const ASSET_USDT0 = 'USDT0';
const ASSET_DOC = 'DOC';
const ASSET_BTC = 'BTC';
const ASSET_TBTC = 'TBTC';
const ASSET_WBTC = 'WBTC';

const RSK_CHAIN_IDS = new Set([30, 31, 33]);
const BSC_CHAIN_IDS = new Set([56, 97]);
const ETH_CHAIN_IDS = new Set([1, 11155111]);
const ARB_CHAIN_IDS = new Set([42161, 421614]);
const POLY_CHAIN_IDS = new Set([137, 80002]);
const OP_CHAIN_IDS = new Set([10, 11155420]);
const BASE_CHAIN_IDS = new Set([8453, 84532]);
const AVAX_CHAIN_IDS = new Set([43114, 43113]);

/** All non-BSC, non-RSK EVM chain ID sets (for cross-chain routing). */
const ALL_CROSS_CHAIN_IDS = [
	...ETH_CHAIN_IDS,
	...ARB_CHAIN_IDS,
	...POLY_CHAIN_IDS,
	...OP_CHAIN_IDS,
	...BASE_CHAIN_IDS,
	...AVAX_CHAIN_IDS
];

function isCrossChainEVM(chainId: number): boolean {
	return ALL_CROSS_CHAIN_IDS.includes(chainId);
}

// ---------------------------------------------------------------------------
// Constants — fee percent
// ---------------------------------------------------------------------------

const FEE_DIRECT = 0;
const FEE_CHANGELLY_USDT_BTC = 0.25;
const FEE_CHANGELLY_USDT_ARB_USDT = 0.25;
const FEE_BOLTZ_SUBMARINE = 0.1;
const FEE_BOLTZ_CHAIN_SWAP = 0.1;
const FEE_BOLTZ_USDT_ARB_LIGHTNING = 0.88;
const FEE_LIFI_DEFAULT = 0.5;
const FEE_SYMBIOSIS_DEFAULT = 0.3;
const FEE_SYMBIOSIS_ONCHAIN = 0.3;
const FEE_SYMBIOSIS_SWAP = 0.3;

// ---------------------------------------------------------------------------
// Constants — time in minutes
// ---------------------------------------------------------------------------

const TIME_DIRECT_MIN = 0;
const TIME_DIRECT_MAX = 1;
const TIME_CHANGELLY_MIN = 1;
const TIME_CHANGELLY_MAX = 5;
const TIME_BOLTZ_MIN = 1;
const TIME_BOLTZ_MAX = 5;
const TIME_LIFI_MIN = 1;
const TIME_LIFI_MAX = 5;
const TIME_SYMBIOSIS_MIN = 1;
const TIME_SYMBIOSIS_MAX = 5;
const TIME_SYMBIOSIS_SWAP_MIN = 1;
const TIME_SYMBIOSIS_SWAP_MAX = 2;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRSKChain(chainId: number): boolean {
	return RSK_CHAIN_IDS.has(chainId);
}

function isBSCChain(chainId: number): boolean {
	return BSC_CHAIN_IDS.has(chainId);
}

function isARBChain(chainId: number): boolean {
	return ARB_CHAIN_IDS.has(chainId);
}

function isTRONChain(chainId: number): boolean {
	return chainId === TRON_PSEUDO_CHAIN_ID;
}

function formatEstimatedTime(min: number, max: number, unit?: string): string {
	const u = unit ?? 'min';
	if (min === 0 && max <= 1) {
		return `~1 ${u}`;
	}
	return `${min}-${max} ${u}`;
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
	timeUnit?: string;
}): Route {
	const totalFeePercent = calculateTotalFee(opts.hops);
	const overallMin = opts.hops[0].estimatedTimeMin;
	const overallMax = opts.hops[opts.hops.length - 1].estimatedTimeMax;

	return {
		id: opts.id,
		label: opts.label,
		hops: opts.hops,
		totalFeePercent,
		estimatedTime: formatEstimatedTime(overallMin, overallMax, opts.timeUnit),
		recommended: opts.recommended
	};
}

// ---------------------------------------------------------------------------
// Data-driven route table
// ---------------------------------------------------------------------------

/** A field that is either a static value or computed from the destination. */
type Dyn<T> = T | ((dest: Destination) => T);

interface HopDef {
	service: RouteHop['service'];
	fromAsset: string;
	fromChain: string;
	toAsset: string;
	toChain: Dyn<string>;
	feePercent: number;
	estimatedTimeMin: number;
	estimatedTimeMax: number;
}

interface RouteDef {
	id: Dyn<string>;
	label: string;
	recommended: boolean;
	hops: HopDef[];
	timeUnit?: string;
}

interface RouteRule {
	source: SourceWallet;
	match: (dest: Destination) => boolean;
	routes: RouteDef[];
}

/** Resolve a possibly-dynamic field against a concrete destination. */
function dyn<T>(value: Dyn<T>, dest: Destination): T {
	return typeof value === 'function' ? (value as (d: Destination) => T)(dest) : value;
}

/** Convert a HopDef into a concrete RouteHop. */
function materializeHop(hop: HopDef, dest: Destination): RouteHop {
	return {
		service: hop.service,
		fromAsset: hop.fromAsset,
		fromChain: hop.fromChain,
		toAsset: hop.toAsset,
		toChain: dyn(hop.toChain, dest),
		feePercent: hop.feePercent,
		estimatedTimeMin: hop.estimatedTimeMin,
		estimatedTimeMax: hop.estimatedTimeMax
	};
}

// Shorthand: destination chainId as template literal part (safe because match
// already guarantees destination.type === 'address' before this is evaluated).
function chainIdStr(dest: Destination): string {
	return dest.type === 'address' ? String(dest.chainId) : '';
}

// ---------------------------------------------------------------------------
// Route definitions — rules evaluated top-to-bottom; first match wins.
// ---------------------------------------------------------------------------

const ROUTE_TABLE: RouteRule[] = [
	// ── rBTC ─────────────────────────────────────────────────────────────
	{
		source: 'rbtc',
		match: (d) => d.type === 'address' && isRSKChain(d.chainId),
		routes: [
			{
				id: 'rbtc-to-rbtc-direct',
				label: 'Direct',
				recommended: true,
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
				]
			}
		]
	},
	{
		source: 'rbtc',
		match: (d) => d.type === 'address' && isBSCChain(d.chainId),
		routes: [
			{
				id: 'rbtc-to-bsc-via-symbiosis',
				label: 'Symbiosis',
				recommended: true,
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
				]
			},
			{
				id: 'rbtc-to-bsc-via-lifi',
				label: 'LI.FI',
				recommended: false,
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
				]
			}
		]
	},
	{
		source: 'rbtc',
		match: (d) => d.type === 'address' && isARBChain(d.chainId) && d.asset === 'WBTC',
		routes: [
			{
				id: 'rbtc-to-wbtc-arb-via-boltz-symbiosis',
				label: 'Boltz \u2192 Symbiosis',
				recommended: true,
				hops: [
					{
						service: 'boltz',
						fromAsset: ASSET_RBTC,
						fromChain: CHAIN_RSK,
						toAsset: ASSET_TBTC,
						toChain: CHAIN_ARBITRUM,
						feePercent: FEE_BOLTZ_CHAIN_SWAP,
						estimatedTimeMin: TIME_BOLTZ_MIN,
						estimatedTimeMax: TIME_BOLTZ_MAX
					},
					{
						service: 'symbiosis',
						fromAsset: ASSET_TBTC,
						fromChain: CHAIN_ARBITRUM,
						toAsset: ASSET_WBTC,
						toChain: CHAIN_ARBITRUM,
						feePercent: FEE_SYMBIOSIS_SWAP,
						estimatedTimeMin: TIME_SYMBIOSIS_SWAP_MIN,
						estimatedTimeMax: TIME_SYMBIOSIS_SWAP_MAX
					}
				]
			},
			{
				id: 'rbtc-to-wbtc-arb-via-boltz-lifi',
				label: 'Boltz \u2192 LI.FI',
				recommended: false,
				hops: [
					{
						service: 'boltz',
						fromAsset: ASSET_RBTC,
						fromChain: CHAIN_RSK,
						toAsset: ASSET_TBTC,
						toChain: CHAIN_ARBITRUM,
						feePercent: FEE_BOLTZ_CHAIN_SWAP,
						estimatedTimeMin: TIME_BOLTZ_MIN,
						estimatedTimeMax: TIME_BOLTZ_MAX
					},
					{
						service: 'lifi',
						fromAsset: ASSET_TBTC,
						fromChain: CHAIN_ARBITRUM,
						toAsset: ASSET_WBTC,
						toChain: CHAIN_ARBITRUM,
						feePercent: FEE_LIFI_DEFAULT,
						estimatedTimeMin: TIME_LIFI_MIN,
						estimatedTimeMax: TIME_LIFI_MAX
					}
				]
			}
		]
	},
	{
		source: 'rbtc',
		match: (d) => d.type === 'address' && isARBChain(d.chainId) && d.asset === 'USDT0',
		routes: [
			{
				id: 'rbtc-to-usdt0-arb-via-boltz-symbiosis',
				label: 'Boltz \u2192 Symbiosis',
				recommended: true,
				hops: [
					{
						service: 'boltz',
						fromAsset: ASSET_RBTC,
						fromChain: CHAIN_RSK,
						toAsset: ASSET_TBTC,
						toChain: CHAIN_ARBITRUM,
						feePercent: FEE_BOLTZ_CHAIN_SWAP,
						estimatedTimeMin: TIME_BOLTZ_MIN,
						estimatedTimeMax: TIME_BOLTZ_MAX
					},
					{
						service: 'symbiosis',
						fromAsset: ASSET_TBTC,
						fromChain: CHAIN_ARBITRUM,
						toAsset: ASSET_USDT0,
						toChain: CHAIN_ARBITRUM,
						feePercent: FEE_SYMBIOSIS_SWAP,
						estimatedTimeMin: TIME_SYMBIOSIS_SWAP_MIN,
						estimatedTimeMax: TIME_SYMBIOSIS_SWAP_MAX
					}
				]
			}
		]
	},
	{
		source: 'rbtc',
		match: (d) => d.type === 'address' && isCrossChainEVM(d.chainId),
		routes: [
			{
				id: (d) => `rbtc-to-usdt-chain-${chainIdStr(d)}-via-lifi`,
				label: 'LI.FI',
				recommended: true,
				hops: [
					{
						service: 'lifi',
						fromAsset: ASSET_RBTC,
						fromChain: CHAIN_RSK,
						toAsset: ASSET_USDT,
						toChain: (d) => `chain-${chainIdStr(d)}`,
						feePercent: FEE_LIFI_DEFAULT,
						estimatedTimeMin: TIME_LIFI_MIN,
						estimatedTimeMax: TIME_LIFI_MAX
					}
				]
			},
			{
				id: (d) => `rbtc-to-usdt-chain-${chainIdStr(d)}-via-symbiosis`,
				label: 'Symbiosis',
				recommended: false,
				hops: [
					{
						service: 'symbiosis',
						fromAsset: ASSET_RBTC,
						fromChain: CHAIN_RSK,
						toAsset: ASSET_USDT,
						toChain: (d) => `chain-${chainIdStr(d)}`,
						feePercent: FEE_SYMBIOSIS_DEFAULT,
						estimatedTimeMin: TIME_SYMBIOSIS_MIN,
						estimatedTimeMax: TIME_SYMBIOSIS_MAX
					}
				]
			}
		]
	},
	{
		source: 'rbtc',
		match: (d) => d.type === 'address' && isTRONChain(d.chainId),
		routes: [
			{
				id: 'rbtc-to-usdt-tron-via-lifi',
				label: 'LI.FI',
				recommended: true,
				hops: [
					{
						service: 'lifi',
						fromAsset: ASSET_RBTC,
						fromChain: CHAIN_RSK,
						toAsset: ASSET_USDT,
						toChain: CHAIN_TRON,
						feePercent: FEE_LIFI_DEFAULT,
						estimatedTimeMin: TIME_LIFI_MIN,
						estimatedTimeMax: TIME_LIFI_MAX
					}
				]
			},
			{
				id: 'rbtc-to-usdt-tron-via-symbiosis',
				label: 'Symbiosis',
				recommended: false,
				hops: [
					{
						service: 'symbiosis',
						fromAsset: ASSET_RBTC,
						fromChain: CHAIN_RSK,
						toAsset: ASSET_USDT,
						toChain: CHAIN_TRON,
						feePercent: FEE_SYMBIOSIS_DEFAULT,
						estimatedTimeMin: TIME_SYMBIOSIS_MIN,
						estimatedTimeMax: TIME_SYMBIOSIS_MAX
					}
				]
			}
		]
	},
	{
		source: 'rbtc',
		match: (d) => d.type === 'invoice' && d.network === 'lightning',
		routes: [
			{
				id: 'rbtc-to-lightning-via-boltz',
				label: 'Boltz',
				recommended: true,
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
				]
			}
		]
	},
	{
		source: 'rbtc',
		match: (d) => d.type === 'invoice' && d.network === 'onchain',
		routes: [
			{
				id: 'rbtc-to-btc-via-lifi',
				label: 'LI.FI',
				recommended: true,
				hops: [
					{
						service: 'lifi',
						fromAsset: ASSET_RBTC,
						fromChain: CHAIN_RSK,
						toAsset: ASSET_BTC,
						toChain: CHAIN_BITCOIN,
						feePercent: FEE_LIFI_DEFAULT,
						estimatedTimeMin: TIME_LIFI_MIN,
						estimatedTimeMax: TIME_LIFI_MAX
					}
				]
			},
			{
				id: 'rbtc-to-btc-via-symbiosis',
				label: 'Symbiosis',
				recommended: false,
				hops: [
					{
						service: 'symbiosis',
						fromAsset: ASSET_RBTC,
						fromChain: CHAIN_RSK,
						toAsset: ASSET_BTC,
						toChain: CHAIN_BITCOIN,
						feePercent: FEE_SYMBIOSIS_DEFAULT,
						estimatedTimeMin: TIME_SYMBIOSIS_MIN,
						estimatedTimeMax: TIME_SYMBIOSIS_MAX
					}
				]
			},
			{
				id: 'rbtc-to-btc-via-boltz',
				label: 'Boltz',
				recommended: true,
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
				]
			}
		]
	},
	// ── USDT (BSC) ───────────────────────────────────────────────────────
	{
		source: 'usdt-bsc',
		match: (d) => d.type === 'address' && isBSCChain(d.chainId),
		routes: [
			{
				id: 'usdt-to-bsc-direct',
				label: 'Direct',
				recommended: true,
				timeUnit: 'sec',
				hops: [
					{
						service: 'direct',
						fromAsset: ASSET_USDT,
						fromChain: CHAIN_BSC,
						toAsset: ASSET_USDT,
						toChain: CHAIN_BSC,
						feePercent: FEE_DIRECT,
						estimatedTimeMin: 0,
						estimatedTimeMax: 1
					}
				]
			}
		]
	},
	{
		source: 'usdt-bsc',
		match: (d) => d.type === 'address' && isRSKChain(d.chainId),
		routes: [
			{
				id: 'usdt-to-rbtc-via-lifi',
				label: 'LI.FI',
				recommended: true,
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
				]
			},
			{
				id: 'usdt-to-rbtc-via-symbiosis',
				label: 'Symbiosis',
				recommended: false,
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
				]
			}
		]
	},
	{
		source: 'usdt-bsc',
		match: (d) => d.type === 'address' && isCrossChainEVM(d.chainId),
		routes: [
			{
				id: (d) => `usdt-bsc-to-usdt-chain-${chainIdStr(d)}-via-lifi`,
				label: 'LI.FI',
				recommended: true,
				hops: [
					{
						service: 'lifi',
						fromAsset: ASSET_USDT,
						fromChain: CHAIN_BSC,
						toAsset: ASSET_USDT,
						toChain: (d) => `chain-${chainIdStr(d)}`,
						feePercent: FEE_LIFI_DEFAULT,
						estimatedTimeMin: TIME_LIFI_MIN,
						estimatedTimeMax: TIME_LIFI_MAX
					}
				]
			},
			{
				id: (d) => `usdt-bsc-to-usdt-chain-${chainIdStr(d)}-via-symbiosis`,
				label: 'Symbiosis',
				recommended: false,
				hops: [
					{
						service: 'symbiosis',
						fromAsset: ASSET_USDT,
						fromChain: CHAIN_BSC,
						toAsset: ASSET_USDT,
						toChain: (d) => `chain-${chainIdStr(d)}`,
						feePercent: FEE_SYMBIOSIS_DEFAULT,
						estimatedTimeMin: TIME_SYMBIOSIS_MIN,
						estimatedTimeMax: TIME_SYMBIOSIS_MAX
					}
				]
			}
		]
	},
	{
		source: 'usdt-bsc',
		match: (d) => d.type === 'address' && isTRONChain(d.chainId),
		routes: [
			{
				id: 'usdt-bsc-to-usdt-tron-via-lifi',
				label: 'LI.FI',
				recommended: true,
				hops: [
					{
						service: 'lifi',
						fromAsset: ASSET_USDT,
						fromChain: CHAIN_BSC,
						toAsset: ASSET_USDT,
						toChain: CHAIN_TRON,
						feePercent: FEE_LIFI_DEFAULT,
						estimatedTimeMin: TIME_LIFI_MIN,
						estimatedTimeMax: TIME_LIFI_MAX
					}
				]
			},
			{
				id: 'usdt-bsc-to-usdt-tron-via-symbiosis',
				label: 'Symbiosis',
				recommended: false,
				hops: [
					{
						service: 'symbiosis',
						fromAsset: ASSET_USDT,
						fromChain: CHAIN_BSC,
						toAsset: ASSET_USDT,
						toChain: CHAIN_TRON,
						feePercent: FEE_SYMBIOSIS_DEFAULT,
						estimatedTimeMin: TIME_SYMBIOSIS_MIN,
						estimatedTimeMax: TIME_SYMBIOSIS_MAX
					}
				]
			}
		]
	},
	{
		source: 'usdt-bsc',
		match: (d) => d.type === 'invoice' && d.network === 'lightning',
		routes: [
			{
				id: 'usdt-to-lightning-via-changelly-boltz',
				label: 'Changelly + Boltz',
				recommended: true,
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
				]
			}
		]
	},
	{
		source: 'usdt-bsc',
		match: (d) => d.type === 'invoice' && d.network === 'onchain',
		routes: [
			{
				id: 'usdt-to-btc-via-lifi',
				label: 'LI.FI',
				recommended: true,
				hops: [
					{
						service: 'lifi',
						fromAsset: ASSET_USDT,
						fromChain: CHAIN_BSC,
						toAsset: ASSET_BTC,
						toChain: CHAIN_BITCOIN,
						feePercent: FEE_LIFI_DEFAULT,
						estimatedTimeMin: TIME_LIFI_MIN,
						estimatedTimeMax: TIME_LIFI_MAX
					}
				]
			},
			{
				id: 'usdt-to-btc-via-symbiosis',
				label: 'Symbiosis',
				recommended: false,
				hops: [
					{
						service: 'symbiosis',
						fromAsset: ASSET_USDT,
						fromChain: CHAIN_BSC,
						toAsset: ASSET_BTC,
						toChain: CHAIN_BITCOIN,
						feePercent: FEE_SYMBIOSIS_DEFAULT,
						estimatedTimeMin: TIME_SYMBIOSIS_MIN,
						estimatedTimeMax: TIME_SYMBIOSIS_MAX
					}
				]
			},
			{
				id: 'usdt-to-btc-via-changelly',
				label: 'Changelly',
				recommended: true,
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
				]
			}
		]
	},
	// ── USDT0 (RSK) ──────────────────────────────────────────────────────
	{
		source: 'usdt0-rsk',
		match: (d) => d.type === 'address' && isRSKChain(d.chainId),
		routes: [
			{
				id: 'usdt0-rsk-to-rbtc-via-symbiosis',
				label: 'Symbiosis',
				recommended: true,
				hops: [
					{
						service: 'symbiosis',
						fromAsset: ASSET_USDT0,
						fromChain: CHAIN_RSK,
						toAsset: ASSET_RBTC,
						toChain: CHAIN_RSK,
						feePercent: FEE_SYMBIOSIS_ONCHAIN,
						estimatedTimeMin: TIME_SYMBIOSIS_MIN,
						estimatedTimeMax: TIME_SYMBIOSIS_MAX
					}
				]
			}
		]
	},
	{
		source: 'usdt0-rsk',
		match: (d) => d.type === 'address' && isBSCChain(d.chainId),
		routes: [
			{
				id: 'usdt0-rsk-to-bsc-via-symbiosis',
				label: 'Symbiosis',
				recommended: true,
				hops: [
					{
						service: 'symbiosis',
						fromAsset: ASSET_USDT0,
						fromChain: CHAIN_RSK,
						toAsset: ASSET_USDT,
						toChain: CHAIN_BSC,
						feePercent: FEE_SYMBIOSIS_DEFAULT,
						estimatedTimeMin: TIME_SYMBIOSIS_MIN,
						estimatedTimeMax: TIME_SYMBIOSIS_MAX
					}
				]
			}
		]
	},
	{
		source: 'usdt0-rsk',
		match: (d) => d.type === 'address' && isCrossChainEVM(d.chainId),
		routes: [
			{
				id: (d) => `usdt0-rsk-to-usdt-chain-${chainIdStr(d)}-via-symbiosis`,
				label: 'Symbiosis',
				recommended: true,
				hops: [
					{
						service: 'symbiosis',
						fromAsset: ASSET_USDT0,
						fromChain: CHAIN_RSK,
						toAsset: ASSET_USDT,
						toChain: (d) => `chain-${chainIdStr(d)}`,
						feePercent: FEE_SYMBIOSIS_DEFAULT,
						estimatedTimeMin: TIME_SYMBIOSIS_MIN,
						estimatedTimeMax: TIME_SYMBIOSIS_MAX
					}
				]
			}
		]
	},
	{
		source: 'usdt0-rsk',
		match: (d) => d.type === 'invoice' && d.network === 'lightning',
		routes: [
			{
				id: 'usdt0-rsk-to-lightning-via-symbiosis-boltz',
				label: 'Symbiosis + Boltz',
				recommended: true,
				hops: [
					{
						service: 'symbiosis',
						fromAsset: ASSET_USDT0,
						fromChain: CHAIN_RSK,
						toAsset: ASSET_RBTC,
						toChain: CHAIN_RSK,
						feePercent: FEE_SYMBIOSIS_ONCHAIN,
						estimatedTimeMin: TIME_SYMBIOSIS_MIN,
						estimatedTimeMax: TIME_SYMBIOSIS_MAX
					},
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
				]
			}
		]
	},
	{
		source: 'usdt0-rsk',
		match: (d) => d.type === 'invoice' && d.network === 'onchain',
		routes: [
			{
				id: 'usdt0-rsk-to-btc-via-symbiosis-boltz',
				label: 'Symbiosis + Boltz',
				recommended: true,
				hops: [
					{
						service: 'symbiosis',
						fromAsset: ASSET_USDT0,
						fromChain: CHAIN_RSK,
						toAsset: ASSET_RBTC,
						toChain: CHAIN_RSK,
						feePercent: FEE_SYMBIOSIS_ONCHAIN,
						estimatedTimeMin: TIME_SYMBIOSIS_MIN,
						estimatedTimeMax: TIME_SYMBIOSIS_MAX
					},
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
				]
			}
		]
	},
	// ── USDT0 (Arbitrum) ─────────────────────────────────────────────────
	{
		source: 'usdt0-arb',
		match: (d) => d.type === 'address' && isARBChain(d.chainId),
		routes: [
			{
				id: 'usdt0-arb-to-usdt0-arb-direct',
				label: 'Direct',
				recommended: true,
				hops: [
					{
						service: 'direct',
						fromAsset: ASSET_USDT0,
						fromChain: CHAIN_ARBITRUM,
						toAsset: ASSET_USDT0,
						toChain: CHAIN_ARBITRUM,
						feePercent: FEE_DIRECT,
						estimatedTimeMin: TIME_DIRECT_MIN,
						estimatedTimeMax: TIME_DIRECT_MAX
					}
				]
			}
		]
	},
	{
		source: 'usdt0-arb',
		match: (d) => d.type === 'address' && isRSKChain(d.chainId),
		routes: [
			{
				id: 'usdt0-arb-to-rbtc-via-symbiosis-boltz',
				label: 'Symbiosis \u2192 Boltz',
				recommended: true,
				hops: [
					{
						service: 'symbiosis',
						fromAsset: ASSET_USDT0,
						fromChain: CHAIN_ARBITRUM,
						toAsset: ASSET_TBTC,
						toChain: CHAIN_ARBITRUM,
						feePercent: FEE_SYMBIOSIS_SWAP,
						estimatedTimeMin: TIME_SYMBIOSIS_SWAP_MIN,
						estimatedTimeMax: TIME_SYMBIOSIS_SWAP_MAX
					},
					{
						service: 'boltz',
						fromAsset: ASSET_TBTC,
						fromChain: CHAIN_ARBITRUM,
						toAsset: ASSET_RBTC,
						toChain: CHAIN_RSK,
						feePercent: FEE_BOLTZ_CHAIN_SWAP,
						estimatedTimeMin: TIME_BOLTZ_MIN,
						estimatedTimeMax: TIME_BOLTZ_MAX
					}
				]
			},
			{
				id: 'usdt0-arb-to-rbtc-via-lifi',
				label: 'LI.FI',
				recommended: false,
				hops: [
					{
						service: 'lifi',
						fromAsset: ASSET_USDT0,
						fromChain: CHAIN_ARBITRUM,
						toAsset: ASSET_RBTC,
						toChain: CHAIN_RSK,
						feePercent: FEE_LIFI_DEFAULT,
						estimatedTimeMin: TIME_LIFI_MIN,
						estimatedTimeMax: TIME_LIFI_MAX
					}
				]
			},
			{
				id: 'usdt0-arb-to-rbtc-via-symbiosis',
				label: 'Symbiosis',
				recommended: false,
				hops: [
					{
						service: 'symbiosis',
						fromAsset: ASSET_USDT0,
						fromChain: CHAIN_ARBITRUM,
						toAsset: ASSET_RBTC,
						toChain: CHAIN_RSK,
						feePercent: FEE_SYMBIOSIS_DEFAULT,
						estimatedTimeMin: TIME_SYMBIOSIS_MIN,
						estimatedTimeMax: TIME_SYMBIOSIS_MAX
					}
				]
			}
		]
	},
	{
		source: 'usdt0-arb',
		match: (d) => d.type === 'address' && isCrossChainEVM(d.chainId),
		routes: [
			{
				id: (d) => `usdt0-arb-to-usdt-chain-${chainIdStr(d)}-via-lifi`,
				label: 'LI.FI',
				recommended: true,
				hops: [
					{
						service: 'lifi',
						fromAsset: ASSET_USDT0,
						fromChain: CHAIN_ARBITRUM,
						toAsset: ASSET_USDT,
						toChain: (d) => `chain-${chainIdStr(d)}`,
						feePercent: FEE_LIFI_DEFAULT,
						estimatedTimeMin: TIME_LIFI_MIN,
						estimatedTimeMax: TIME_LIFI_MAX
					}
				]
			},
			{
				id: (d) => `usdt0-arb-to-usdt-chain-${chainIdStr(d)}-via-symbiosis`,
				label: 'Symbiosis',
				recommended: false,
				hops: [
					{
						service: 'symbiosis',
						fromAsset: ASSET_USDT0,
						fromChain: CHAIN_ARBITRUM,
						toAsset: ASSET_USDT,
						toChain: (d) => `chain-${chainIdStr(d)}`,
						feePercent: FEE_SYMBIOSIS_DEFAULT,
						estimatedTimeMin: TIME_SYMBIOSIS_MIN,
						estimatedTimeMax: TIME_SYMBIOSIS_MAX
					}
				]
			}
		]
	},
	{
		source: 'usdt0-arb',
		match: (d) => d.type === 'invoice' && d.network === 'onchain',
		routes: [
			{
				id: 'usdt0-arb-to-btc-via-symbiosis-boltz',
				label: 'Symbiosis \u2192 Boltz',
				recommended: true,
				hops: [
					{
						service: 'symbiosis',
						fromAsset: ASSET_USDT0,
						fromChain: CHAIN_ARBITRUM,
						toAsset: ASSET_RBTC,
						toChain: CHAIN_RSK,
						feePercent: FEE_SYMBIOSIS_DEFAULT,
						estimatedTimeMin: TIME_SYMBIOSIS_MIN,
						estimatedTimeMax: TIME_SYMBIOSIS_MAX
					},
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
				]
			}
		]
	},
	// ── DOC (RSK) ────────────────────────────────────────────────────────
	{
		source: 'doc-rsk',
		match: (d) => d.type === 'address' && isRSKChain(d.chainId),
		routes: [
			{
				id: 'doc-rsk-to-rbtc-via-symbiosis',
				label: 'Symbiosis',
				recommended: true,
				hops: [
					{
						service: 'symbiosis',
						fromAsset: ASSET_DOC,
						fromChain: CHAIN_RSK,
						toAsset: ASSET_RBTC,
						toChain: CHAIN_RSK,
						feePercent: FEE_SYMBIOSIS_ONCHAIN,
						estimatedTimeMin: TIME_SYMBIOSIS_MIN,
						estimatedTimeMax: TIME_SYMBIOSIS_MAX
					}
				]
			}
		]
	},
	{
		source: 'doc-rsk',
		match: (d) => d.type === 'address' && isBSCChain(d.chainId),
		routes: [
			{
				id: 'doc-rsk-to-bsc-via-symbiosis',
				label: 'Symbiosis',
				recommended: true,
				hops: [
					{
						service: 'symbiosis',
						fromAsset: ASSET_DOC,
						fromChain: CHAIN_RSK,
						toAsset: ASSET_USDT0,
						toChain: CHAIN_RSK,
						feePercent: FEE_SYMBIOSIS_ONCHAIN,
						estimatedTimeMin: TIME_SYMBIOSIS_MIN,
						estimatedTimeMax: TIME_SYMBIOSIS_MAX
					},
					{
						service: 'symbiosis',
						fromAsset: ASSET_USDT0,
						fromChain: CHAIN_RSK,
						toAsset: ASSET_USDT,
						toChain: CHAIN_BSC,
						feePercent: FEE_SYMBIOSIS_DEFAULT,
						estimatedTimeMin: TIME_SYMBIOSIS_MIN,
						estimatedTimeMax: TIME_SYMBIOSIS_MAX
					}
				]
			}
		]
	},
	{
		source: 'doc-rsk',
		match: (d) => d.type === 'address' && isCrossChainEVM(d.chainId),
		routes: [
			{
				id: (d) => `doc-rsk-to-usdt-chain-${chainIdStr(d)}-via-symbiosis`,
				label: 'Symbiosis',
				recommended: true,
				hops: [
					{
						service: 'symbiosis',
						fromAsset: ASSET_DOC,
						fromChain: CHAIN_RSK,
						toAsset: ASSET_USDT0,
						toChain: CHAIN_RSK,
						feePercent: FEE_SYMBIOSIS_ONCHAIN,
						estimatedTimeMin: TIME_SYMBIOSIS_MIN,
						estimatedTimeMax: TIME_SYMBIOSIS_MAX
					},
					{
						service: 'symbiosis',
						fromAsset: ASSET_USDT0,
						fromChain: CHAIN_RSK,
						toAsset: ASSET_USDT,
						toChain: (d) => `chain-${chainIdStr(d)}`,
						feePercent: FEE_SYMBIOSIS_DEFAULT,
						estimatedTimeMin: TIME_SYMBIOSIS_MIN,
						estimatedTimeMax: TIME_SYMBIOSIS_MAX
					}
				]
			}
		]
	},
	{
		source: 'doc-rsk',
		match: (d) => d.type === 'invoice' && d.network === 'lightning',
		routes: [
			{
				id: 'doc-rsk-to-lightning-via-symbiosis-boltz',
				label: 'Symbiosis + Boltz',
				recommended: true,
				hops: [
					{
						service: 'symbiosis',
						fromAsset: ASSET_DOC,
						fromChain: CHAIN_RSK,
						toAsset: ASSET_RBTC,
						toChain: CHAIN_RSK,
						feePercent: FEE_SYMBIOSIS_ONCHAIN,
						estimatedTimeMin: TIME_SYMBIOSIS_MIN,
						estimatedTimeMax: TIME_SYMBIOSIS_MAX
					},
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
				]
			}
		]
	},
	{
		source: 'doc-rsk',
		match: (d) => d.type === 'invoice' && d.network === 'onchain',
		routes: [
			{
				id: 'doc-rsk-to-btc-via-symbiosis-boltz',
				label: 'Symbiosis + Boltz',
				recommended: true,
				hops: [
					{
						service: 'symbiosis',
						fromAsset: ASSET_DOC,
						fromChain: CHAIN_RSK,
						toAsset: ASSET_RBTC,
						toChain: CHAIN_RSK,
						feePercent: FEE_SYMBIOSIS_ONCHAIN,
						estimatedTimeMin: TIME_SYMBIOSIS_MIN,
						estimatedTimeMax: TIME_SYMBIOSIS_MAX
					},
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
				]
			}
		]
	},
	// ── BTC on-chain ─────────────────────────────────────────────────────
	{
		source: 'btc-onchain',
		match: (d) => d.type === 'address' && (d.chainId === 1 || d.chainId === 0),
		routes: [
			{
				id: 'btc-onchain-direct',
				label: 'Direct',
				recommended: true,
				hops: [
					{
						service: 'direct',
						fromAsset: 'BTC',
						fromChain: 'bitcoin',
						toAsset: 'BTC',
						toChain: 'bitcoin',
						feePercent: 0,
						estimatedTimeMin: 10,
						estimatedTimeMax: 30
					}
				]
			}
		]
	},
	{
		source: 'btc-onchain',
		match: (d) => d.type === 'address' && (d.chainId === 30 || d.chainId === 31),
		routes: [
			{
				id: 'btc-to-rbtc-via-boltz',
				label: 'Boltz',
				recommended: true,
				hops: [
					{
						service: 'boltz',
						fromAsset: 'BTC',
						fromChain: 'bitcoin',
						toAsset: 'RBTC',
						toChain: 'rsk',
						feePercent: 0.5,
						estimatedTimeMin: 10,
						estimatedTimeMax: 30
					}
				]
			}
		]
	},
	{
		source: 'btc-onchain',
		match: (d) => d.type === 'address' && d.chainId === 42161,
		routes: [
			{
				id: 'btc-to-usdt0-arb-via-boltz',
				label: 'Boltz + LI.FI',
				recommended: true,
				hops: [
					{
						service: 'boltz',
						fromAsset: 'BTC',
						fromChain: 'bitcoin',
						toAsset: 'RBTC',
						toChain: 'rsk',
						feePercent: 0.5,
						estimatedTimeMin: 10,
						estimatedTimeMax: 30
					},
					{
						service: 'lifi',
						fromAsset: 'RBTC',
						fromChain: 'rsk',
						toAsset: 'USDT0',
						toChain: 'arbitrum',
						feePercent: 0.3,
						estimatedTimeMin: 5,
						estimatedTimeMax: 15
					}
				]
			}
		]
	},
	// ── WBTC (Arbitrum) ──────────────────────────────────────────────────
	{
		source: 'wbtc-arb',
		match: (d) => d.type === 'address' && isARBChain(d.chainId) && d.asset === 'USDT0',
		routes: [
			{
				id: 'wbtc-to-usdt0-arb-via-symbiosis',
				label: 'Symbiosis',
				recommended: true,
				hops: [
					{
						service: 'symbiosis',
						fromAsset: ASSET_WBTC,
						fromChain: CHAIN_ARBITRUM,
						toAsset: ASSET_USDT0,
						toChain: CHAIN_ARBITRUM,
						feePercent: FEE_SYMBIOSIS_SWAP,
						estimatedTimeMin: TIME_SYMBIOSIS_SWAP_MIN,
						estimatedTimeMax: TIME_SYMBIOSIS_SWAP_MAX
					}
				]
			}
		]
	},
	{
		source: 'wbtc-arb',
		match: (d) => d.type === 'address' && isARBChain(d.chainId) && d.asset === 'TBTC',
		routes: [
			{
				id: 'wbtc-to-tbtc-arb-via-symbiosis',
				label: 'Symbiosis',
				recommended: true,
				hops: [
					{
						service: 'symbiosis',
						fromAsset: ASSET_WBTC,
						fromChain: CHAIN_ARBITRUM,
						toAsset: ASSET_TBTC,
						toChain: CHAIN_ARBITRUM,
						feePercent: FEE_SYMBIOSIS_SWAP,
						estimatedTimeMin: TIME_SYMBIOSIS_SWAP_MIN,
						estimatedTimeMax: TIME_SYMBIOSIS_SWAP_MAX
					}
				]
			}
		]
	},
	// ── TBTC (Arbitrum) ──────────────────────────────────────────────────
	{
		source: 'tbtc-arb',
		match: (d) => d.type === 'address' && isARBChain(d.chainId) && d.asset === 'WBTC',
		routes: [
			{
				id: 'tbtc-to-wbtc-arb-via-symbiosis',
				label: 'Symbiosis',
				recommended: true,
				hops: [
					{
						service: 'symbiosis',
						fromAsset: ASSET_TBTC,
						fromChain: CHAIN_ARBITRUM,
						toAsset: ASSET_WBTC,
						toChain: CHAIN_ARBITRUM,
						feePercent: FEE_SYMBIOSIS_SWAP,
						estimatedTimeMin: TIME_SYMBIOSIS_SWAP_MIN,
						estimatedTimeMax: TIME_SYMBIOSIS_SWAP_MAX
					}
				]
			}
		]
	},
	{
		source: 'tbtc-arb',
		match: (d) => d.type === 'address' && isARBChain(d.chainId) && d.asset === 'USDT0',
		routes: [
			{
				id: 'tbtc-to-usdt0-arb-via-symbiosis',
				label: 'Symbiosis',
				recommended: true,
				hops: [
					{
						service: 'symbiosis',
						fromAsset: ASSET_TBTC,
						fromChain: CHAIN_ARBITRUM,
						toAsset: ASSET_USDT0,
						toChain: CHAIN_ARBITRUM,
						feePercent: FEE_SYMBIOSIS_SWAP,
						estimatedTimeMin: TIME_SYMBIOSIS_SWAP_MIN,
						estimatedTimeMax: TIME_SYMBIOSIS_SWAP_MAX
					}
				]
			}
		]
	},
	{
		source: 'tbtc-arb',
		match: (d) => d.type === 'address' && isRSKChain(d.chainId),
		routes: [
			{
				id: 'tbtc-to-rbtc-via-boltz',
				label: 'Boltz',
				recommended: true,
				hops: [
					{
						service: 'boltz',
						fromAsset: ASSET_TBTC,
						fromChain: CHAIN_ARBITRUM,
						toAsset: ASSET_RBTC,
						toChain: CHAIN_RSK,
						feePercent: FEE_BOLTZ_CHAIN_SWAP,
						estimatedTimeMin: TIME_BOLTZ_MIN,
						estimatedTimeMax: TIME_BOLTZ_MAX
					}
				]
			}
		]
	}
];

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
	for (const rule of ROUTE_TABLE) {
		if (rule.source !== source) continue;
		if (!rule.match(destination)) continue;

		return rule.routes.map((r) =>
			buildRoute({
				id: dyn(r.id, destination),
				label: r.label,
				hops: r.hops.map((h) => materializeHop(h, destination)),
				recommended: r.recommended,
				timeUnit: r.timeUnit
			})
		);
	}
	return [];
}
