import escrowV1Abi from '$lib/utils/contract/v1/abi.json';
import escrowV2Abi from '$lib/utils/contract/v2/abi.json';
import type { ServiceQuoteFeatureState } from '$lib/types/service-quote';

function getBooleanEnv(value: string | boolean | undefined): boolean {
	return value === true || value === 'true';
}

function abiSupportsPurchaseKey(abi: unknown): boolean {
	if (!Array.isArray(abi)) {
		return false;
	}

	return abi.some((entry) => {
		if (!entry || typeof entry !== 'object') {
			return false;
		}

		if (entry.type !== 'function' || entry.name !== 'createEscrow') {
			return false;
		}

		const inputs = 'inputs' in entry && Array.isArray(entry.inputs) ? entry.inputs : [];
		return inputs.some((input) => {
			return !!input && typeof input === 'object' && 'name' in input && input.name === 'purchaseKey';
		});
	});
}

export function supportsServicePurchaseKeyCapability(): boolean {
	if (getBooleanEnv(import.meta.env.VITE_SERVICE_QUOTES_PURCHASE_KEY_ENABLED)) {
		return true;
	}

	return (
		abiSupportsPurchaseKey(escrowV1Abi) ||
		abiSupportsPurchaseKey(escrowV2Abi)
	);
}

export function getServiceQuoteFeatures(): ServiceQuoteFeatureState {
	const accept = supportsServicePurchaseKeyCapability();

	return {
		read: true,
		write: true,
		contractsFilter: true,
		accept
	};
}
