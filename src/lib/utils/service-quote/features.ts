import escrowV1Abi from '$lib/utils/escrow/v1/abi.json';
import escrowV2Abi from '$lib/utils/escrow/v2/abi.json';
import type { ServiceQuoteFeatureState } from '$lib/types/service-quote';

function getBooleanEnv(value: string | boolean | undefined): boolean {
	return value === true || value === 'true';
}

function abiSupportsPurchaseKey(abi: Array<Record<string, unknown>>): boolean {
	return abi.some((entry) => {
		if (entry.type !== 'function' || entry.name !== 'createEscrow') {
			return false;
		}

		const inputs = Array.isArray(entry.inputs) ? entry.inputs : [];
		return inputs.some((input) => input?.name === 'purchaseKey');
	});
}

export function supportsServicePurchaseKeyCapability(): boolean {
	if (getBooleanEnv(import.meta.env.VITE_SERVICE_QUOTES_PURCHASE_KEY_ENABLED)) {
		return true;
	}

	return abiSupportsPurchaseKey(escrowV1Abi as Array<Record<string, unknown>>) ||
		abiSupportsPurchaseKey(escrowV2Abi as Array<Record<string, unknown>>);
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
