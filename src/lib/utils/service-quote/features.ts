import type { ServiceQuoteFeatureState } from '$lib/types/service-quote';

function getBooleanEnv(value: string | boolean | undefined): boolean {
	return value === true || value === 'true';
}

export function supportsServicePurchaseKeyCapability(): boolean {
	return getBooleanEnv(import.meta.env.VITE_SERVICE_QUOTES_PURCHASE_KEY_ENABLED);
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
