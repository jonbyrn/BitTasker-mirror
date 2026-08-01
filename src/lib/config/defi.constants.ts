// ---------------------------------------------------------------------------
// DeFi Configuration — Single Source of Truth
// ---------------------------------------------------------------------------
// All contract addresses, RPC endpoints, and protocol constants for DeFi operations.
// Every component/service that interacts with Aave, Uniswap, or Arbitrum DeFi
// MUST import from here instead of hardcoding addresses.

// ---------------------------------------------------------------------------
// RPC Endpoints
// ---------------------------------------------------------------------------

export const ARB_PUBLIC_RPC = 'https://arb1.arbitrum.io/rpc';

// ---------------------------------------------------------------------------
// Aave V3 (Arbitrum One)
// ---------------------------------------------------------------------------

export const AAVE_POOL = '0x794a61358D6845594F94dc1DB02A252b5b4814aD';
export const AAVE_POOL_DATA_PROVIDER = '0x243Aa95cAC2a25651eda86e80bEe66114413c43b';

// ---------------------------------------------------------------------------
// Token Addresses (Arbitrum One)
// ---------------------------------------------------------------------------

export const WBTC_ARBITRUM = '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f';
export const USDT0_ARBITRUM = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';

// ---------------------------------------------------------------------------
// Aave V3 ABIs (minimal — only the functions we need)
// ---------------------------------------------------------------------------

export const POOL_ABI = [
	'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external',
	'function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf) external',
	'function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) external returns (uint256)',
	'function withdraw(address asset, uint256 amount, address to) external returns (uint256)',
	'function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
	'function getReserveData(address asset) external view returns (tuple(uint256 data) configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt)'
];

export const DATA_PROVIDER_ABI = [
	'function getReserveConfigurationData(address asset) external view returns (uint256 decimals, uint256 ltv, uint256 liquidationThreshold, uint256 liquidationBonus, uint256 reserveFactor, bool usageAsCollateralEnabled, bool borrowingEnabled, bool stableBorrowRateEnabled, bool isActive, bool isFrozen)'
];

export const ERC20_APPROVE_ABI = [
	'function allowance(address owner, address spender) view returns (uint256)',
	'function approve(address spender, uint256 amount) returns (bool)'
];

// ---------------------------------------------------------------------------
// Protocol Constants
// ---------------------------------------------------------------------------

/** Aave V3 Arbitrum Chain ID */
export const ARBITRUM_CHAIN_ID = 42161;

/** Default LTV in basis points for wBTC on Aave V3 Arbitrum (fallback when on-chain data unavailable) */
export const DEFAULT_WBTC_LTV_BPS = 7300;

/** Default liquidation threshold in basis points for wBTC */
export const DEFAULT_LIQUIDATION_THRESHOLD_BPS = 7800;

// ---------------------------------------------------------------------------
// Gas Defaults (fallback when eth_estimateGas fails)
// ---------------------------------------------------------------------------

export const DEFAULT_GAS_SUPPLY = 250_000n;
export const DEFAULT_GAS_BORROW = 300_000n;
export const DEFAULT_GAS_REPAY = 250_000n;
export const DEFAULT_GAS_WITHDRAW = 200_000n;
export const DEFAULT_GAS_GENERIC = 300_000n;

// Gas buffer multiplier (20% safety margin)
export const GAS_BUFFER_PERCENT = 120n;
export const GAS_BUFFER_DIVISOR = 100n;

// ---------------------------------------------------------------------------
// Uniswap V3 (Arbitrum)
// ---------------------------------------------------------------------------

export const UNISWAP_WBTC_USDT0_POOL = '0x5969efdde3cf5c0d9a88ae51e47d721096a97203';
