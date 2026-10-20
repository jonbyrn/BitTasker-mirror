/**
 * Error codes for service-contract preparation.
 *
 * The Rootstock preflight that used to live here is not part of the RGB
 * wallet. Callers still share these codes so quote acceptance and instant
 * buy can show the same recovery copy.
 */
export type ServiceContractPreflightErrorCode =
	| 'wallet_not_connected'
	| 'wallet_not_ready'
	| 'wrong_network'
	| 'invalid_provider_wallet'
	| 'invalid_provider_pubkey'
	| 'invalid_service_amount'
	| 'invalid_fee_tier'
	| 'price_unavailable'
	| 'insufficient_funds'
	| 'relay_unavailable'
	| 'nostr_not_ready'
	| 'invalid_schedule'
	| 'preflight_failed';
