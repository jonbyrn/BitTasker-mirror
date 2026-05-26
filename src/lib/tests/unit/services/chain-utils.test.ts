/**
 * Unit tests for chain-utils.ts
 *
 * Tests three pure functions:
 *  - getChainIdForNetwork         maps network string to chainId, respects env config
 *  - encodeERC20Transfer          encodes ERC20 transfer(address,uint256) call data
 *  - getBSCUSDTContractAddress    returns BSC USDT contract address for current network
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	getChainIdForNetwork,
	encodeERC20Transfer,
	getBSCUSDTContractAddress
} from '$lib/services/external-wallet/chain-utils';

describe('chain-utils', () => {
	beforeEach(() => {
		// Default both to testnet so each test is explicit about its env
		vi.stubEnv('VITE_RSK_NETWORK', 'testnet');
		vi.stubEnv('VITE_BSC_NETWORK', 'testnet');
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// -----------------------------------------------------------------------
	// getChainIdForNetwork
	// -----------------------------------------------------------------------
	describe('getChainIdForNetwork', () => {
		describe('testnet environment', () => {
			it('returns 31 for rootstock-bitcoin', () => {
				expect(getChainIdForNetwork('rootstock-bitcoin')).toBe(31);
			});

			it('returns 97 for usdt-bsc', () => {
				expect(getChainIdForNetwork('usdt-bsc')).toBe(97);
			});

			it('returns 11155111 for usdt-ethereum', () => {
				expect(getChainIdForNetwork('usdt-ethereum')).toBe(11155111);
			});

			it('returns 421614 for usdt-arbitrum', () => {
				expect(getChainIdForNetwork('usdt-arbitrum')).toBe(421614);
			});

			it('returns 80002 for usdt-polygon', () => {
				expect(getChainIdForNetwork('usdt-polygon')).toBe(80002);
			});

			it('returns 31 for unknown network (defaults to RSK testnet)', () => {
				expect(getChainIdForNetwork('unknown-network')).toBe(31);
			});

			it('returns 31 for empty string', () => {
				expect(getChainIdForNetwork('')).toBe(31);
			});
		});

		describe('mainnet environment', () => {
			beforeEach(() => {
				vi.stubEnv('VITE_RSK_NETWORK', 'mainnet');
				vi.stubEnv('VITE_BSC_NETWORK', 'mainnet');
			});

			it('returns 30 for rootstock-bitcoin', () => {
				expect(getChainIdForNetwork('rootstock-bitcoin')).toBe(30);
			});

			it('returns 56 for usdt-bsc', () => {
				expect(getChainIdForNetwork('usdt-bsc')).toBe(56);
			});

			it('returns 1 for usdt-ethereum', () => {
				expect(getChainIdForNetwork('usdt-ethereum')).toBe(1);
			});

			it('returns 42161 for usdt-arbitrum', () => {
				expect(getChainIdForNetwork('usdt-arbitrum')).toBe(42161);
			});

			it('returns 137 for usdt-polygon', () => {
				expect(getChainIdForNetwork('usdt-polygon')).toBe(137);
			});

			it('returns 30 for unknown network (defaults to RSK mainnet)', () => {
				expect(getChainIdForNetwork('unknown-network')).toBe(30);
			});
		});

		describe('mixed environment (BSC mainnet, RSK testnet)', () => {
			beforeEach(() => {
				vi.stubEnv('VITE_RSK_NETWORK', 'testnet');
				vi.stubEnv('VITE_BSC_NETWORK', 'mainnet');
			});

			it('returns 56 for usdt-bsc (uses BSC env)', () => {
				expect(getChainIdForNetwork('usdt-bsc')).toBe(56);
			});

			it('returns 31 for rootstock-bitcoin (uses RSK env)', () => {
				expect(getChainIdForNetwork('rootstock-bitcoin')).toBe(31);
			});

			it('returns 11155111 for usdt-ethereum (uses RSK env)', () => {
				expect(getChainIdForNetwork('usdt-ethereum')).toBe(11155111);
			});
		});

		describe('determinism', () => {
			it('returns the same result for repeated calls with same inputs and env', () => {
				const a = getChainIdForNetwork('usdt-polygon');
				const b = getChainIdForNetwork('usdt-polygon');
				expect(a).toBe(b);
			});

			it('returns different results for different networks in the same env', () => {
				const bsc = getChainIdForNetwork('usdt-bsc');
				const eth = getChainIdForNetwork('usdt-ethereum');
				expect(bsc).not.toBe(eth);
			});
		});
	});

	// -----------------------------------------------------------------------
	// encodeERC20Transfer
	// -----------------------------------------------------------------------
	describe('encodeERC20Transfer', () => {
		it('encodes a standard transfer to a known address', () => {
			// ERC20 transfer(address,uint256) method ID = a9059cbb
			// to = 0x742d35cc6634c0532925a3b844bc9e7595f12bed
			// amount = 1 (1 wei)
			const result = encodeERC20Transfer('0x742d35cc6634c0532925a3b844bc9e7595f12bed', 1n);
			expect(result).toBe(
				'0xa9059cbb' +
					'000000000000000000000000742d35cc6634c0532925a3b844bc9e7595f12bed' +
					'0000000000000000000000000000000000000000000000000000000000000001'
			);
		});

		it('encodes a transfer of 1 USDT (10^18 wei)', () => {
			const result = encodeERC20Transfer(
				'0x55d398326f99059ff775485246999027b3197955',
				1_000_000_000_000_000_000n
			);
			// Amount hex: de0b6b3a7640000 padded to 64 chars
			expect(result).toContain('a9059cbb');
			expect(result).toContain('00000000000000000000000055d398326f99059ff775485246999027b3197955');
			expect(result).toContain('0000000000000000000000000000000000000000000000000de0b6b3a7640000');
		});

		it('encodes a transfer with zero amount', () => {
			const result = encodeERC20Transfer('0x742d35cc6634c0532925a3b844bc9e7595f12bed', 0n);
			// Zero amount should be 64 '0' characters
			expect(result).toMatch(/^0xa9059cbb[a-fA-F0-9]{128}$/);
			expect(result).toBe(
				'0xa9059cbb' +
					'000000000000000000000000742d35cc6634c0532925a3b844bc9e7595f12bed' +
					'0000000000000000000000000000000000000000000000000000000000000000'
			);
		});

		it('encodes a transfer with a large amount', () => {
			const result = encodeERC20Transfer(
				'0x742d35cc6634c0532925a3b844bc9e7595f12bed',
				1_000_000_000_000_000_000_000n // 1000 USDT
			);
			// Amount hex: 3635c9adc5dea00000 padded to 64 chars
			expect(result).toBe(
				'0xa9059cbb' +
					'000000000000000000000000742d35cc6634c0532925a3b844bc9e7595f12bed' +
					'00000000000000000000000000000000000000000000003635c9adc5dea00000'
			);
		});

		it('ensures the recipient address is always 64 hex characters (32 bytes) after padding', () => {
			// Zero address — all zeros
			const result = encodeERC20Transfer('0x0000000000000000000000000000000000000000', 1n);
			// The padded address portion should be all zeros, 64 chars
			const addressPortion = result.slice(10, 74); // after methodId (4 bytes = 8 hex chars)
			expect(addressPortion).toBe('0'.repeat(64));
		});

		it('ensures the amount is always 64 hex characters (32 bytes) after padding', () => {
			const result = encodeERC20Transfer('0x742d35cc6634c0532925a3b844bc9e7595f12bed', 1n);
			// The padded amount portion should be 63 zeros + 1
			const amountPortion = result.slice(74); // after address (32 bytes = 64 hex chars)
			expect(amountPortion).toBe('0'.repeat(63) + '1');
		});

		it('produces 138 characters total (0x + 4 + 32 + 32 = 68 bytes = 136 hex chars)', () => {
			const result = encodeERC20Transfer('0x742d35cc6634c0532925a3b844bc9e7595f12bed', 1n);
			// 0x (2) + methodId (8) + address (64) + amount (64) = 138
			expect(result.length).toBe(138);
			expect(result.startsWith('0x')).toBe(true);
		});

		it('encodes a transfer to an all-ones address', () => {
			const result = encodeERC20Transfer('0xffffffffffffffffffffffffffffffffffffffff', 255n);
			// Amount 255 = 0xff padded to 64 chars
			expect(result).toBe(
				'0xa9059cbb' +
					'000000000000000000000000ffffffffffffffffffffffffffffffffffffffff' +
					'00000000000000000000000000000000000000000000000000000000000000ff'
			);
		});

		it('preserves the original case of the input address in the output', () => {
			// to.slice(2) preserves the character case from the input
			const mixedCaseAddr = '0x742d35Cc6634C0532925a3b844Bc9e7595f12bEd';
			const result = encodeERC20Transfer(mixedCaseAddr, 1n);

			// The address portion (offset 10..74) should match the original input
			// after removing 0x prefix and left-padding to 64 chars
			const addressPortion = result.slice(10, 74);
			expect(addressPortion).toBe(
				'000000000000000000000000742d35Cc6634C0532925a3b844Bc9e7595f12bEd'
			);
		});

		it('preserves uppercase hex letters from input address', () => {
			const allUpperAddr = '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF';
			const result = encodeERC20Transfer(allUpperAddr, 1n);

			const addressPortion = result.slice(10, 74);
			expect(addressPortion).toBe(
				'000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'
			);
		});

		it('ensures deterministic output (same inputs => same output)', () => {
			const a = encodeERC20Transfer('0x742d35cc6634c0532925a3b844bc9e7595f12bed', 42n);
			const b = encodeERC20Transfer('0x742d35cc6634c0532925a3b844bc9e7595f12bed', 42n);
			expect(a).toBe(b);
		});
	});

	// -----------------------------------------------------------------------
	// getBSCUSDTContractAddress
	// -----------------------------------------------------------------------
	describe('getBSCUSDTContractAddress', () => {
		it('returns mainnet address when VITE_BSC_NETWORK is mainnet', () => {
			vi.stubEnv('VITE_BSC_NETWORK', 'mainnet');
			const address = getBSCUSDTContractAddress();
			expect(address).toBe('0x55d398326f99059ff775485246999027b3197955');
		});

		it('returns testnet address when VITE_BSC_NETWORK is testnet', () => {
			vi.stubEnv('VITE_BSC_NETWORK', 'testnet');
			const address = getBSCUSDTContractAddress();
			expect(address).toBe('0x337610d27c682E347C9cD60BD4b3b107C9d34dDd');
		});

		it('returns different addresses for mainnet vs testnet', () => {
			vi.stubEnv('VITE_BSC_NETWORK', 'mainnet');
			const mainnetAddr = getBSCUSDTContractAddress();

			vi.stubEnv('VITE_BSC_NETWORK', 'testnet');
			const testnetAddr = getBSCUSDTContractAddress();

			expect(mainnetAddr).not.toBe(testnetAddr);
		});

		it('returns a valid Ethereum address format (0x + 40 hex chars)', () => {
			const address = getBSCUSDTContractAddress();
			expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
		});

		it('ensures deterministic output for the same env setting', () => {
			vi.stubEnv('VITE_BSC_NETWORK', 'mainnet');
			const a = getBSCUSDTContractAddress();
			const b = getBSCUSDTContractAddress();
			expect(a).toBe(b);
		});
	});
});
