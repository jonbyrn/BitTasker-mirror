import { describe, expect, it } from 'vitest';

import { buildDirectPaymentUri } from '$lib/utils/helpers/evmPaymentIntents';

describe('buildDirectPaymentUri', () => {
	it('builds a chain-qualified Rootstock request with value and memo', () => {
		const uri = buildDirectPaymentUri({
			address: '0x1234567890123456789012345678901234567890',
			network: 'rootstock-bitcoin',
			amount: 100000,
			memo: 'Task payment'
		});

		expect(uri).toBe(
			'rsk:0x1234567890123456789012345678901234567890?value=1000000000000000&message=Task+payment'
		);
	});

	it('builds a chain-qualified BSC request with token-native amount and memo', () => {
		const uri = buildDirectPaymentUri({
			address: '0x1234567890123456789012345678901234567890',
			network: 'usdt-bsc',
			amount: 12.3456,
			memo: 'USDT request'
		});

		expect(uri).toBe(
			'bsc:0x1234567890123456789012345678901234567890?amount=12.3456&memo=USDT+request'
		);
	});

	it('preserves an already-qualified request string', () => {
		const uri = buildDirectPaymentUri({
			address: 'bsc:0x1234567890123456789012345678901234567890?amount=5',
			network: 'usdt-bsc',
			amount: 10
		});

		expect(uri).toBe('bsc:0x1234567890123456789012345678901234567890?amount=5');
	});
});
