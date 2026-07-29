export interface AavePosition {
	id: string;
	walletId: string;
	address: string;
	chainId: number;
	collateral: { asset: string; amount: bigint; usdValue: number };
	debt: { asset: string; amount: bigint; usdValue: number };
	healthFactor: number;
	ltv: number;
	liquidationThreshold: number;
	availableBorrowsUsd: number;
	liquidationPriceBtc?: number;
	lastUpdated: Date;
}

export interface MaxSafeWithdrawResult {
	maxSafeCollateralUsd: number;
	maxSafeCollateralAssetAmount: bigint;
	postWithdrawHealthFactor: number;
	currentHealthFactor: number;
	buffer: number;
	isAtRisk: boolean;
}

export interface LiquidationPriceResult {
	liquidationBtcPrice: number;
	currentBtcPrice: number;
	distancePercent: number;
}

export type WizardStep = 'wallet' | 'positions' | 'supply' | 'borrow' | 'success';
export type PositionAction = 'repay' | 'addCollateral' | 'withdraw' | 'close';
export type BorrowAction = 'supply' | 'borrow' | 'repay' | 'addCollateral' | 'withdraw' | 'close';
export type EarnAction = 'supply' | 'withdraw' | 'close';
export type LPAction = 'provide' | 'remove' | 'collect' | 'close';
