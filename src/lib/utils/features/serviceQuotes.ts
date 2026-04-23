import { getServiceQuoteFeatures, supportsServicePurchaseKeyCapability } from '$lib/utils/service-quote/features';

export function getServiceQuoteFeatureFlags() {
	return getServiceQuoteFeatures();
}

export { supportsServicePurchaseKeyCapability };
