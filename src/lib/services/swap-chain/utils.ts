/**
 * Shared swap-chain resolution utilities.
 *
 * Consolidates duplicated chain ID mapping, token address mapping,
 * and asset decimals that were previously defined inline in
 * executeLifiHop, executeSymbiosisHop, and executeBoltzHop.
 */

// ─── Chain ID constants ───────────────────────────────────────────

// RSK chain ID: 33 for regtest (local Boltz), 30 for mainnet
export const CHAIN_ID_RSK = import.meta.env.VITE_RSK_NETWORK === 'regtest' ? 33 : 30;
export const CHAIN_ID_BSC = 56;
export const CHAIN_ID_ARB = 42161;

// ─── Token address constants ──────────────────────────────────────

/** Native token sentinel (zero address) used by LI.FI and Symbiosis */
export const NATIVE_TOKEN = '0x0000000000000000000000000000000000000000';

/** USDT0 / USDT on Arbitrum */
export const USDT0_ARB_ADDR = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';

/** tBTC on Arbitrum */
export const TBTC_ARB = '0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40';

/** WBTC on Arbitrum */
export const WBTC_ARB = '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f';

/** EtherSwap contract on RSK — holds rBTC for Boltz chain swaps */
export const ETHERSWAP_ADDRESS = '0xe761e1354097757c019855637746e7dd1bef1654';

/** USDT on BSC */
export const USDT_BSC = '0x55d398326f99059fF775485246999027B3197955';

// ─── Gas limits ────────────────────────────────────────────────────

/** Gas limit for RSK transactions (lockup, refund, claim) */
export const GAS_LIMIT_RSK = 150_000;

/** Gas limit for Arbitrum tBTC ERC20Swap.claim() */
export const GAS_LIMIT_ARB_CLAIM = 300_000;

/** Gas limit for Arbitrum general swap transactions (LI.FI, Symbiosis) */
export const GAS_LIMIT_ARB_SWAP = 500_000;

/** Gas limit for RSK EtherSwap.claim() */
export const GAS_LIMIT_RSK_CLAIM = 150_000;

// ─── RPC URLs ──────────────────────────────────────────────────────

/** RSK mainnet RPC endpoint */
export const RSK_RPC_URL = 'https://mainnet.sovryn.app/rpc';

// ─── Blockscout ────────────────────────────────────────────────────

/** Rootstock Blockscout API base URL */
export const BLOCKSCOUT_API_BASE = 'https://rootstock.blockscout.com/api';

// ─── Polling timeouts ──────────────────────────────────────────────

/** Max wait time for Boltz chain swap completion (15 minutes) */
export const BOLTZ_MAX_WAIT_MS = 900_000;

/** Max wait time for Changelly swap completion (10 minutes) */
export const CHANGELLY_MAX_WAIT_MS = 600_000;

// ─── RSK blockchain ────────────────────────────────────────────────

/** Average RSK block time in seconds */
export const RSK_BLOCK_TIME_SECONDS = 30;

// ─── Event topics ──────────────────────────────────────────────────

/** EtherSwap Lockup event topic0 */
export const LOCKUP_TOPIC = '0x15b4b8206809535e547317cd5cedc86cff6e7d203551f93701786ddaf14fd9f9';

/** EtherSwap Claim event topic0 */
export const CLAIM_TOPIC = '0x5664142af3dcfc3dc3de45a43f75c746bd1d8c11170a5037fdf98bdb35775137';

// ─── Chain ID resolution ──────────────────────────────────────────

/**
 * Resolve a chain name to its EVM chain ID.
 *
 * Supports named chains (rsk, bsc, arbitrum) and the `chain-NNN`
 * format used for arbitrary cross-chain EVM targets.
 *
 * @returns chain ID, or 0 if unrecognised
 */
export function resolveChainId(chainName: string): number {
	if (chainName === 'rsk') return CHAIN_ID_RSK;
	if (chainName === 'bsc') return CHAIN_ID_BSC;
	if (chainName === 'arbitrum') return CHAIN_ID_ARB;
	// Fallback: parse from `chain-NNN` format used for cross-chain EVM
	if (chainName.startsWith('chain-')) return parseInt(chainName.slice(6), 10) || 0;
	return 0;
}

// ─── Token address resolution ─────────────────────────────────────

/**
 * Resolve an asset symbol to its on-chain token address for a given chain.
 *
 * Returns NATIVE_TOKEN (zero address) for native gas tokens (RBTC, BTC)
 * and for any unrecognised asset.
 */
export function resolveTokenAddress(asset: string, chainId: number): string {
	const upper = asset.toUpperCase();
	if (upper === 'RBTC' || upper === 'BTC') return NATIVE_TOKEN;
	if (upper === 'USDT0') return USDT0_ARB_ADDR;
	if (upper === 'TBTC') return TBTC_ARB;
	if (upper === 'WBTC') return WBTC_ARB;
	if (upper === 'USDT') {
		return chainId === CHAIN_ID_ARB ? USDT0_ARB_ADDR : USDT_BSC;
	}
	return NATIVE_TOKEN;
}

// ─── Asset decimals ───────────────────────────────────────────────
// NOTE: LI.FI and Symbiosis use different decimal conventions for the
// same assets.  LI.FI works with EVM-wrapped representations (BTC=18
// as an ERC-20, USDT/USDT0=6), while Symbiosis uses the actual token
// decimals on the source chain (BTC=8 native, USDT=18 on BSC,
// USDT0=6 on Arbitrum).  Each hop function must pick the correct map.

/** LI.FI decimals — EVM-wrapped token representations */
export const LIFI_ASSET_DECIMALS: Record<string, number> = {
	RBTC: 18,
	BTC: 18,
	TBTC: 18,
	WBTC: 8,
	USDT: 6,
	USDT0: 6,
	USDC: 6
};

/** Symbiosis decimals — native / source-chain token representations */
const _SYMBIOSIS_DECIMALS: Record<string, number> = {
	RBTC: 18,
	BTC: 8,
	TBTC: 18,
	WBTC: 8,
	USDT0: 6,
	USDT: 18
};

/**
 * Case-insensitive lookup for Symbiosis asset decimals.
 * Route hops from Symbiosis use token registry symbols (e.g. 'tBTC')
 * while the map keys are uppercase. This helper normalises before lookup.
 */
export function getSymbiosisDecimals(asset: string): number {
	return _SYMBIOSIS_DECIMALS[asset.toUpperCase()] ?? 18;
}
