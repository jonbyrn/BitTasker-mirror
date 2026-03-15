import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('contractRegistry', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.unstubAllEnvs();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('uses the generic BSC escrow address for the selected mainnet rail', async () => {
		vi.stubEnv('VITE_BSC_NETWORK', 'mainnet');
		vi.stubEnv('VITE_BSC_ESCROW_CONTRACT_ADDRESS', '0xABcDEFabcdefABCDefabCDefabcdeFABcdefABCD');

		const { getEscrowContractAddress } = await import('$lib/utils/wallet/contractRegistry');

		expect(getEscrowContractAddress('bsc', 'mainnet')).toBe(
			'0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
		);
		expect(getEscrowContractAddress('bsc', 'testnet')).toBeNull();
	});

	it('uses the generic BSC escrow address for the selected testnet rail', async () => {
		vi.stubEnv('VITE_BSC_NETWORK', 'testnet');
		vi.stubEnv('VITE_BSC_ESCROW_CONTRACT_ADDRESS', '0x1234567890abcdef1234567890ABCDEF12345678');

		const { getEscrowContractAddress } = await import('$lib/utils/wallet/contractRegistry');

		expect(getEscrowContractAddress('bsc', 'testnet')).toBe(
			'0x1234567890abcdef1234567890abcdef12345678'
		);
		expect(getEscrowContractAddress('bsc', 'mainnet')).toBeNull();
	});

	it('prefers network-scoped BSC escrow env vars over the generic address', async () => {
		vi.stubEnv('VITE_BSC_NETWORK', 'mainnet');
		vi.stubEnv('VITE_BSC_ESCROW_CONTRACT_ADDRESS', '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
		vi.stubEnv('VITE_BSC_ESCROW_CONTRACT_ADDRESS_MAINNET', '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
		vi.stubEnv('VITE_BSC_ESCROW_CONTRACT_ADDRESS_TESTNET', '0xcccccccccccccccccccccccccccccccccccccccc');

		const { getEscrowContractAddress } = await import('$lib/utils/wallet/contractRegistry');

		expect(getEscrowContractAddress('bsc', 'mainnet')).toBe(
			'0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
		);
		expect(getEscrowContractAddress('bsc', 'testnet')).toBe(
			'0xcccccccccccccccccccccccccccccccccccccccc'
		);
	});

	it('falls back to the legacy BSC contract env var when the new escrow env var is absent', async () => {
		vi.stubEnv('VITE_BSC_NETWORK', 'mainnet');
		vi.stubEnv('VITE_BSC_CONTRACT_ADDRESS', '0x9999999999999999999999999999999999999999');

		const { getEscrowContractAddress } = await import('$lib/utils/wallet/contractRegistry');

		expect(getEscrowContractAddress('bsc', 'mainnet')).toBe(
			'0x9999999999999999999999999999999999999999'
		);
	});

	it('tracks BSC testnet legacy escrow contracts for backward compatibility', async () => {
		vi.stubEnv('VITE_BSC_NETWORK', 'testnet');
		vi.stubEnv('VITE_BSC_ESCROW_CONTRACT_ADDRESS', '0x1234567890abcdef1234567890ABCDEF12345678');

		const { addLegacyContract, isKnownContract } = await import(
			'$lib/utils/wallet/contractRegistry'
		);

		addLegacyContract('0xFfFfFfFfFfFfFfFfFfFfFfFfFfFfFfFfFfFfFfFf', 'bsc', 'testnet', 'escrow');

		expect(
			isKnownContract(
				'0xffffffffffffffffffffffffffffffffffffffff',
				'bsc',
				'testnet'
			)
		).toEqual({
			isKnown: true,
			contractType: 'escrow',
			isCurrent: false
		});
	});
});
