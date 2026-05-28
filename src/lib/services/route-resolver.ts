/**
 * Cross-wallet Route Resolver
 *
 * Pure function that resolves viable swap routes between source wallets
 * and destinations. No side effects, no network calls, deterministic output.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SourceWallet = 'rbtc' | 'usdt-bsc' | 'usdt0-rsk' | 'doc-rsk';

export type Destination =
	| { type: 'address'; chainId: number; address: string }
	| { type: 'invoice'; network: 'lightning' | 'onchain'; invoice: string };

export interface RouteHop {
	service: 'direct' | 'changelly' | 'boltz' | 'lifi' | 'symbiosis' | 'openocean';
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
const CHAIN_TRON = 'tron';

/** Pseudo chain ID for TRON (non-EVM, used as placeholder in Destination). */
const TRON_PSEUDO_CHAIN_ID = 0;

const ASSET_RBTC = 'RBTC';
const ASSET_USDT = 'USDT';
const ASSET_USDT0 = 'USDT0';
const ASSET_DOC = 'DOC';
const ASSET_BTC = 'BTC';

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRSKChain(chainId: number): boolean {
	return RSK_CHAIN_IDS.has(chainId);
}

function isBSCChain(chainId: number): boolean {
	return BSC_CHAIN_IDS.has(chainId);
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
					recommended: true
				}),
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
					recommended: false
				})
			];
		}

		// Cross-chain EVM: rBTC → USDT on destination chain via bridge
		if (isCrossChainEVM(destination.chainId)) {
			return [
				buildRoute({
					id: `rbtc-to-usdt-chain-${destination.chainId}-via-lifi`,
					label: 'LI.FI',
					hops: [
						{
							service: 'lifi',
							fromAsset: ASSET_RBTC,
							fromChain: CHAIN_RSK,
							toAsset: ASSET_USDT,
							toChain: `chain-${destination.chainId}`,
							feePercent: FEE_LIFI_DEFAULT,
							estimatedTimeMin: TIME_LIFI_MIN,
							estimatedTimeMax: TIME_LIFI_MAX
						}
					],
					recommended: true
				}),
				buildRoute({
					id: `rbtc-to-usdt-chain-${destination.chainId}-via-symbiosis`,
					label: 'Symbiosis',
					hops: [
						{
							service: 'symbiosis',
							fromAsset: ASSET_RBTC,
							fromChain: CHAIN_RSK,
							toAsset: ASSET_USDT,
							toChain: `chain-${destination.chainId}`,
							feePercent: FEE_SYMBIOSIS_DEFAULT,
							estimatedTimeMin: TIME_SYMBIOSIS_MIN,
							estimatedTimeMax: TIME_SYMBIOSIS_MAX
						}
					],
					recommended: false
				})
			];
		}

		// TRON: rBTC → USDT on TRON via bridge (non-EVM)
		if (isTRONChain(destination.chainId)) {
			return [
				buildRoute({
					id: 'rbtc-to-usdt-tron-via-lifi',
					label: 'LI.FI',
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
					],
					recommended: true
				}),
				buildRoute({
					id: 'rbtc-to-usdt-tron-via-symbiosis',
					label: 'Symbiosis',
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
				id: 'rbtc-to-btc-via-lifi',
				label: 'LI.FI',
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
				],
				recommended: true
			}),
			buildRoute({
				id: 'rbtc-to-btc-via-symbiosis',
				label: 'Symbiosis',
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
				],
				recommended: false
			}),
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
							estimatedTimeMin: 0,
							estimatedTimeMax: 1
						}
					],
					recommended: true,
					timeUnit: 'sec'
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
				})
			];
		}

		// Cross-chain EVM: USDT on BSC → USDT on destination chain via bridge
		if (isCrossChainEVM(destination.chainId)) {
			return [
				buildRoute({
					id: `usdt-bsc-to-usdt-chain-${destination.chainId}-via-lifi`,
					label: 'LI.FI',
					hops: [
						{
							service: 'lifi',
							fromAsset: ASSET_USDT,
							fromChain: CHAIN_BSC,
							toAsset: ASSET_USDT,
							toChain: `chain-${destination.chainId}`,
							feePercent: FEE_LIFI_DEFAULT,
							estimatedTimeMin: TIME_LIFI_MIN,
							estimatedTimeMax: TIME_LIFI_MAX
						}
					],
					recommended: true
				}),
				buildRoute({
					id: `usdt-bsc-to-usdt-chain-${destination.chainId}-via-symbiosis`,
					label: 'Symbiosis',
					hops: [
						{
							service: 'symbiosis',
							fromAsset: ASSET_USDT,
							fromChain: CHAIN_BSC,
							toAsset: ASSET_USDT,
							toChain: `chain-${destination.chainId}`,
							feePercent: FEE_SYMBIOSIS_DEFAULT,
							estimatedTimeMin: TIME_SYMBIOSIS_MIN,
							estimatedTimeMax: TIME_SYMBIOSIS_MAX
						}
					],
					recommended: false
				})
			];
		}

		// TRON: USDT on BSC → USDT on TRON via bridge (non-EVM)
		if (isTRONChain(destination.chainId)) {
			return [
				buildRoute({
					id: 'usdt-bsc-to-usdt-tron-via-lifi',
					label: 'LI.FI',
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
					],
					recommended: true
				}),
				buildRoute({
					id: 'usdt-bsc-to-usdt-tron-via-symbiosis',
					label: 'Symbiosis',
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
				id: 'usdt-to-btc-via-lifi',
				label: 'LI.FI',
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
				],
				recommended: true
			}),
			buildRoute({
				id: 'usdt-to-btc-via-symbiosis',
				label: 'Symbiosis',
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
				],
				recommended: false
			}),
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
// Route matrix — USDT0 on Rootstock source
// ---------------------------------------------------------------------------

function resolveFromUSDT0RSK(destination: Destination): Route[] {
	if (destination.type === 'address') {
		// USDT0 → rBTC on RSK via Symbiosis on-chain swap
		if (isRSKChain(destination.chainId)) {
			return [
				buildRoute({
					id: 'usdt0-rsk-to-rbtc-via-symbiosis',
					label: 'Symbiosis',
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
					],
					recommended: true
				})
			];
		}

		// USDT0 on RSK → USDT on BSC via Symbiosis cross-chain
		if (isBSCChain(destination.chainId)) {
			return [
				buildRoute({
					id: 'usdt0-rsk-to-bsc-via-symbiosis',
					label: 'Symbiosis',
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
					],
					recommended: true
				})
			];
		}

		// Cross-chain EVM: USDT0 on RSK → USDT on destination chain
		if (isCrossChainEVM(destination.chainId)) {
			return [
				buildRoute({
					id: `usdt0-rsk-to-usdt-chain-${destination.chainId}-via-symbiosis`,
					label: 'Symbiosis',
					hops: [
						{
							service: 'symbiosis',
							fromAsset: ASSET_USDT0,
							fromChain: CHAIN_RSK,
							toAsset: ASSET_USDT,
							toChain: `chain-${destination.chainId}`,
							feePercent: FEE_SYMBIOSIS_DEFAULT,
							estimatedTimeMin: TIME_SYMBIOSIS_MIN,
							estimatedTimeMax: TIME_SYMBIOSIS_MAX
						}
					],
					recommended: true
				})
			];
		}

		return [];
	}

	if (destination.network === 'lightning') {
		return [
			buildRoute({
				id: 'usdt0-rsk-to-lightning-via-symbiosis-boltz',
				label: 'Symbiosis + Boltz',
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
				],
				recommended: true
			})
		];
	}

	if (destination.network === 'onchain') {
		return [
			buildRoute({
				id: 'usdt0-rsk-to-btc-via-symbiosis-boltz',
				label: 'Symbiosis + Boltz',
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
				],
				recommended: true
			})
		];
	}

	return [];
}

// ---------------------------------------------------------------------------
// Route matrix — DOC on Rootstock source
// ---------------------------------------------------------------------------

function resolveFromDOCRSK(destination: Destination): Route[] {
	if (destination.type === 'address') {
		// DOC → rBTC on RSK via Symbiosis on-chain swap
		if (isRSKChain(destination.chainId)) {
			return [
				buildRoute({
					id: 'doc-rsk-to-rbtc-via-symbiosis',
					label: 'Symbiosis',
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
					],
					recommended: true
				})
			];
		}

		// DOC on RSK → USDT on BSC via Symbiosis (two-hop: DOC→USDT0 on RSK, then cross-chain)
		if (isBSCChain(destination.chainId)) {
			return [
				buildRoute({
					id: 'doc-rsk-to-bsc-via-symbiosis',
					label: 'Symbiosis',
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
					],
					recommended: true
				})
			];
		}

		// Cross-chain EVM: DOC on RSK → USDT on destination chain
		if (isCrossChainEVM(destination.chainId)) {
			return [
				buildRoute({
					id: `doc-rsk-to-usdt-chain-${destination.chainId}-via-symbiosis`,
					label: 'Symbiosis',
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
							toChain: `chain-${destination.chainId}`,
							feePercent: FEE_SYMBIOSIS_DEFAULT,
							estimatedTimeMin: TIME_SYMBIOSIS_MIN,
							estimatedTimeMax: TIME_SYMBIOSIS_MAX
						}
					],
					recommended: true
				})
			];
		}

		return [];
	}

	if (destination.network === 'lightning') {
		return [
			buildRoute({
				id: 'doc-rsk-to-lightning-via-symbiosis-boltz',
				label: 'Symbiosis + Boltz',
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
				],
				recommended: true
			})
		];
	}

	if (destination.network === 'onchain') {
		return [
			buildRoute({
				id: 'doc-rsk-to-btc-via-symbiosis-boltz',
				label: 'Symbiosis + Boltz',
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
		case 'usdt0-rsk':
			return resolveFromUSDT0RSK(destination);
		case 'doc-rsk':
			return resolveFromDOCRSK(destination);
		default:
			return [];
	}
}
