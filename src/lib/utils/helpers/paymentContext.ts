export type PaymentAsset = 'RBTC' | 'USDT';
export type PaymentNetwork = 'rsk-mainnet' | 'rsk-testnet' | 'bsc-mainnet' | 'bsc-testnet';

export const TASK_SCHEMA_VERSION = 'task.v2';
export const BID_SCHEMA_VERSION = 'bid.v2';
export const CONTRACT_SCHEMA_VERSION = 'contract.v2';
export const STATUS_SCHEMA_VERSION = 'status.v2';

function normalizeEnv(value?: string | null): 'mainnet' | 'testnet' {
	return value === 'mainnet' ? 'mainnet' : 'testnet';
}

export function getDefaultPaymentNetwork(asset: PaymentAsset = 'RBTC'): PaymentNetwork {
	const env = asset === 'USDT'
		? normalizeEnv(import.meta.env.VITE_BSC_NETWORK || import.meta.env.VITE_RSK_NETWORK)
		: normalizeEnv(import.meta.env.VITE_RSK_NETWORK);

	return `${asset === 'USDT' ? 'bsc' : 'rsk'}-${env}` as PaymentNetwork;
}

export function getCurrentEnvironment(): 'mainnet' | 'testnet' {
	return normalizeEnv(import.meta.env.VITE_BSC_NETWORK || import.meta.env.VITE_RSK_NETWORK);
}

export function normalizePaymentAsset(value?: string | null): PaymentAsset {
	return value === 'USDT' ? 'USDT' : 'RBTC';
}

export function normalizePaymentNetwork(
	value: string | null | undefined,
	asset: PaymentAsset = 'RBTC'
): PaymentNetwork {
	if (!value) {
		return getDefaultPaymentNetwork(asset);
	}

	const trimmed = value.trim().toLowerCase();
	if (
		trimmed === 'rsk-mainnet' ||
		trimmed === 'rsk-testnet' ||
		trimmed === 'bsc-mainnet' ||
		trimmed === 'bsc-testnet'
	) {
		return trimmed as PaymentNetwork;
	}

	if (trimmed === 'mainnet' || trimmed === 'testnet') {
		return `${asset === 'USDT' ? 'bsc' : 'rsk'}-${trimmed}` as PaymentNetwork;
	}

	if (trimmed === 'usdt-bsc' || trimmed === 'bsc') {
		return getDefaultPaymentNetwork('USDT');
	}

	if (trimmed === 'rootstock-bitcoin' || trimmed === 'rsk') {
		return getDefaultPaymentNetwork('RBTC');
	}

	return getDefaultPaymentNetwork(asset);
}

export function normalizePaymentContext<
	T extends {
		paymentAsset?: string | null;
		paymentNetwork?: string | null;
		schemaVersion?: string | null;
	}
>(value: T, schemaVersion: string, fallbackAsset: PaymentAsset = 'RBTC') {
	const paymentAsset = normalizePaymentAsset(value.paymentAsset ?? fallbackAsset);
	const paymentNetwork = normalizePaymentNetwork(value.paymentNetwork, paymentAsset);

	return {
		...value,
		schemaVersion: value.schemaVersion || schemaVersion,
		paymentAsset,
		paymentNetwork
	};
}

export function resolvePaymentContext(
	paymentAsset?: string | null,
	paymentNetwork?: string | null
): { paymentAsset: PaymentAsset; paymentNetwork: PaymentNetwork } {
	const hasExplicitPaymentAsset = Boolean(paymentAsset?.trim());
	const resolvedPaymentAsset =
		!hasExplicitPaymentAsset && paymentNetwork?.trim().toLowerCase().startsWith('bsc')
			? 'USDT'
			: normalizePaymentAsset(paymentAsset);

	return {
		paymentAsset: resolvedPaymentAsset,
		paymentNetwork: normalizePaymentNetwork(paymentNetwork, resolvedPaymentAsset)
	};
}

export function getContractQueryNetworks(
	env: 'mainnet' | 'testnet' = getCurrentEnvironment()
): string[] {
	return [env, `rsk-${env}`, `bsc-${env}`];
}

export function getTaskReference(taskId: string): string {
	return `task:${taskId}`;
}

export function getBidReference(bidId: string): string {
	return `bid:${bidId}`;
}

export function getContractReference(
	escrowId: string,
	paymentNetwork?: string | null,
	paymentAsset?: string | null
): string {
	const network = normalizePaymentNetwork(paymentNetwork, normalizePaymentAsset(paymentAsset));
	return `contract:${network}:${escrowId}`;
}

export function getPaymentRailLabel(
	paymentAsset?: string | null,
	paymentNetwork?: string | null
): string {
	const { paymentAsset: asset, paymentNetwork: network } = resolvePaymentContext(
		paymentAsset,
		paymentNetwork
	);

	if (network.startsWith('bsc')) {
		return asset === 'USDT' ? 'USDT on BSC' : 'RBTC on BSC';
	}

	return asset === 'USDT' ? 'USDT on Rootstock' : 'rBTC on Rootstock';
}

export function toAtomicAmountString(amount: number, paymentAsset?: string | null): string | undefined {
	if (!Number.isFinite(amount) || amount <= 0) {
		return undefined;
	}

	if (normalizePaymentAsset(paymentAsset) === 'USDT') {
		return Math.round(amount * 1_000_000).toString();
	}

	return undefined;
}
