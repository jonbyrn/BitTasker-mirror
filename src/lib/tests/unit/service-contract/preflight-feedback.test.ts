import { describe, expect, it } from 'vitest';
import { describeServiceContractPreflightFailure } from '$lib/utils/service-contract/preflight-feedback';

describe('service contract preflight feedback', () => {
	it('preserves the original preflight message and adds a retry hint for wallet and balance issues', () => {
		expect(describeServiceContractPreflightFailure('wallet_not_connected')).toEqual({
			message: 'Connect your wallet before continuing.',
			hint: 'Connect your wallet, then retry the contract creation.'
		});

		expect(
			describeServiceContractPreflightFailure(
				'wallet_not_connected',
				'Connect your wallet before continuing.'
			)
		).toEqual({
			message: 'Connect your wallet before continuing.',
			hint: 'Connect your wallet, then retry the contract creation.'
		});

		expect(
			describeServiceContractPreflightFailure('insufficient_funds', 'Insufficient balance.')
		).toEqual({
			message: 'Insufficient balance.',
			hint: 'Add funds to your wallet, then retry.'
		});
	});

	it('falls back to deterministic defaults when the runtime only provides an error code', () => {
		expect(describeServiceContractPreflightFailure('wallet_not_ready')).toEqual({
			message: 'Your wallet is not ready yet. Retry after it finishes connecting.',
			hint: 'Keep your wallet open until it finishes connecting, then retry.'
		});

		expect(describeServiceContractPreflightFailure('wrong_network')).toEqual({
			message: 'Switch your wallet to the required RGB network before continuing.',
			hint: 'Switch to the required RGB network in your wallet, then retry.'
		});

		expect(describeServiceContractPreflightFailure('preflight_failed')).toEqual({
			message: 'Unable to prepare the escrow transaction right now.',
			hint: 'Retry after your wallet finishes estimating the transaction. If the problem persists, reopen the flow.'
		});
	});

	it('leaves non-preflight failures without an extra hint', () => {
		expect(describeServiceContractPreflightFailure('invalid_service_amount')).toEqual({
			message: 'Unable to determine the service price.',
			hint: null
		});

		expect(describeServiceContractPreflightFailure('price_unavailable')).toEqual({
			message: 'Unable to determine the current BTC price.',
			hint: null
		});

		expect(describeServiceContractPreflightFailure('invalid_provider_wallet')).toEqual({
			message: 'Provider wallet is unavailable for this service.',
			hint: null
		});

		expect(describeServiceContractPreflightFailure('insufficient_funds')).toEqual({
			message: 'Insufficient balance for the escrow amount and gas.',
			hint: 'Add funds to your wallet, then retry.'
		});

		expect(
			describeServiceContractPreflightFailure(undefined, 'Unable to create the service contract.')
		).toEqual({
			message: 'Unable to create the service contract.',
			hint: null
		});

		expect(describeServiceContractPreflightFailure(undefined, '   ')).toEqual({
			message: 'Unable to create the service contract right now.',
			hint: null
		});
	});
});
