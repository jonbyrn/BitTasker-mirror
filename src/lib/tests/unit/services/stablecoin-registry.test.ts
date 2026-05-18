import { describe, it, expect } from 'vitest';
import {
	getStablecoinConfig,
	getTokenConfig,
	getSupportedChainIds,
	getExplorerTxUrl,
	getExplorerAddressUrl,
	validateConfig,
	findChainForGasToken,
	type StablecoinConfig,
	type StablecoinToken
} from '$lib/services/stablecoin-registry';

describe('stablecoin-registry', () => {
	describe('getStablecoinConfig', () => {
		it('returns BSC mainnet config for chain ID 56', () => {
			const config = getStablecoinConfig(56);
			expect(config).toBeDefined();
			expect(config!.chainId).toBe(56);
			expect(config!.chainName).toBe('BNB Smart Chain');
			expect(config!.nativeCurrency.symbol).toBe('BNB');
			expect(config!.nativeCurrency.decimals).toBe(18);
		});

		it('returns BSC testnet config for chain ID 97', () => {
			const config = getStablecoinConfig(97);
			expect(config).toBeDefined();
			expect(config!.chainId).toBe(97);
			expect(config!.chainName).toContain('Testnet');
			expect(config!.nativeCurrency.symbol).toBe('tBNB');
		});

		it('returns undefined for unknown chain ID', () => {
			expect(getStablecoinConfig(999)).toBeUndefined();
		});

		it('returns undefined for chain ID 0', () => {
			expect(getStablecoinConfig(0)).toBeUndefined();
		});

		it('returns undefined for negative chain ID', () => {
			expect(getStablecoinConfig(-1)).toBeUndefined();
		});

		it('returns BSC mainnet with correct RPC URLs', () => {
			const config = getStablecoinConfig(56);
			expect(config!.rpcUrls).toHaveLength(3);
			expect(config!.rpcUrls[0]).toBe('https://bsc-rpc.publicnode.com');
		});

		it('returns BSC mainnet with correct explorer URL', () => {
			const config = getStablecoinConfig(56);
			expect(config!.explorerUrl).toBe('https://bscscan.com');
			expect(config!.explorerApiUrl).toBe('https://api.bscscan.com/api');
		});

		it('returns BSC mainnet with correct confirmations', () => {
			const config = getStablecoinConfig(56);
			expect(config!.confirmations).toBe(1);
		});
	});

	describe('getTokenConfig', () => {
		it('returns USDT config for BSC mainnet (chain 56)', () => {
			const token = getTokenConfig('USDT', 56);
			expect(token).toBeDefined();
			expect(token!.symbol).toBe('USDT');
			expect(token!.name).toBe('Tether USD');
			expect(token!.decimals).toBe(18);
			expect(token!.isGasToken).toBe(true);
		});

		it('returns USDT config with case-insensitive matching', () => {
			const upper = getTokenConfig('USDT', 56);
			const lower = getTokenConfig('usdt', 56);
			const mixed = getTokenConfig('Usdt', 56);
			expect(upper).toBeDefined();
			expect(lower).toBeDefined();
			expect(mixed).toBeDefined();
			expect(upper!.symbol).toBe('USDT');
			expect(lower!.symbol).toBe('USDT');
			expect(mixed!.symbol).toBe('USDT');
		});

		it('returns USDT config for BSC testnet (chain 97)', () => {
			const token = getTokenConfig('USDT', 97);
			expect(token).toBeDefined();
			expect(token!.symbol).toBe('USDT');
			expect(token!.name).toContain('Test');
		});

		it('returns undefined for unknown token symbol', () => {
			expect(getTokenConfig('USDC', 56)).toBeUndefined();
		});

		it('returns undefined for unknown chain ID', () => {
			expect(getTokenConfig('USDT', 999)).toBeUndefined();
		});

		it('returns undefined for empty symbol', () => {
			expect(getTokenConfig('', 56)).toBeUndefined();
		});
	});

	describe('getSupportedChainIds', () => {
		it('returns all registered chain IDs', () => {
			const chainIds = getSupportedChainIds();
			expect(chainIds).toContain(56);
			expect(chainIds).toContain(97);
			expect(chainIds).toHaveLength(2);
		});

		it('returns unique chain IDs (no duplicates)', () => {
			const chainIds = getSupportedChainIds();
			const unique = new Set(chainIds);
			expect(unique.size).toBe(chainIds.length);
		});
	});

	describe('findChainForGasToken', () => {
		it('finds BSC mainnet for USDT gas token', () => {
			const config = findChainForGasToken('USDT');
			expect(config).toBeDefined();
			expect(config!.chainId).toBe(56);
		});

		it('returns undefined for unknown gas token', () => {
			expect(findChainForGasToken('USDC')).toBeUndefined();
		});

		it('finds with case-insensitive matching', () => {
			const config = findChainForGasToken('usdt');
			expect(config).toBeDefined();
			expect(config!.chainId).toBe(56);
		});
	});

	describe('getExplorerTxUrl', () => {
		it('builds correct BSC mainnet transaction URL', () => {
			const url = getExplorerTxUrl(56, '0xabc123');
			expect(url).toBe('https://bscscan.com/tx/0xabc123');
		});

		it('builds correct BSC testnet transaction URL', () => {
			const url = getExplorerTxUrl(97, '0xabc123');
			expect(url).toBe('https://testnet.bscscan.com/tx/0xabc123');
		});

		it('returns null for unknown chain', () => {
			expect(getExplorerTxUrl(999, '0xabc123')).toBeNull();
		});

		it('handles empty tx hash', () => {
			const url = getExplorerTxUrl(56, '');
			expect(url).toBe('https://bscscan.com/tx/');
		});
	});

	describe('getExplorerAddressUrl', () => {
		it('builds correct BSC mainnet address URL', () => {
			const url = getExplorerAddressUrl(56, '0xdef456');
			expect(url).toBe('https://bscscan.com/address/0xdef456');
		});

		it('builds correct BSC testnet address URL', () => {
			const url = getExplorerAddressUrl(97, '0xdef456');
			expect(url).toBe('https://testnet.bscscan.com/address/0xdef456');
		});

		it('returns null for unknown chain', () => {
			expect(getExplorerAddressUrl(999, '0xdef456')).toBeNull();
		});
	});

	describe('validateConfig', () => {
		const validConfig: StablecoinConfig = {
			chainId: 56,
			chainName: 'BNB Smart Chain',
			rpcUrls: ['https://bsc-rpc.publicnode.com'],
			explorerUrl: 'https://bscscan.com',
			explorerApiUrl: 'https://api.bscscan.com/api',
			nativeCurrency: { symbol: 'BNB', name: 'BNB', decimals: 18 },
			tokens: [
				{
					symbol: 'USDT',
					name: 'Tether USD',
					address: '0x55d398326f99059ff775485246999027b3197955',
					decimals: 18,
					isGasToken: true,
					logoUrl: '/logos/usdt.svg',
					minGasReserve: '0.20'
				}
			],
			paymaster: {
				address: '0xPaymaster',
				delegationContract: '0xDelegation',
				usdtPriceOracle: '0xOracle',
				fallbackOracle: '0xFallback',
				minDeposit: 100_000_000_000_000_000n,
				version: 'eip7702-v1',
				maxGasCapPerTx: 500_000_000_000_000_000n
			},
			confirmations: 1
		};

		it('returns valid for a correct config', () => {
			const result = validateConfig(validConfig);
			expect(result.valid).toBe(true);
			expect(result.errors).toHaveLength(0);
		});

		it('rejects negative chainId', () => {
			const result = validateConfig({ ...validConfig, chainId: -1 });
			expect(result.valid).toBe(false);
			expect(result.errors).toContain('chainId must be a positive integer');
		});

		it('rejects zero chainId', () => {
			const result = validateConfig({ ...validConfig, chainId: 0 });
			expect(result.valid).toBe(false);
			expect(result.errors).toContain('chainId must be a positive integer');
		});

		it('rejects empty chainName', () => {
			const result = validateConfig({ ...validConfig, chainName: '' });
			expect(result.valid).toBe(false);
			expect(result.errors).toContain('chainName must not be empty');
		});

		it('rejects empty RPC URLs', () => {
			const result = validateConfig({ ...validConfig, rpcUrls: [] });
			expect(result.valid).toBe(false);
			expect(result.errors).toContain('at least one RPC URL is required');
		});

		it('rejects invalid RPC URLs', () => {
			const result = validateConfig({ ...validConfig, rpcUrls: ['not-a-url'] });
			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.includes('not a valid URL'))).toBe(true);
		});

		it('rejects RPC URLs with unsupported protocol', () => {
			const result = validateConfig({ ...validConfig, rpcUrls: ['ftp://rpc.example.com'] });
			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.includes('unsupported protocol'))).toBe(true);
		});

		it('rejects empty explorerUrl', () => {
			const result = validateConfig({ ...validConfig, explorerUrl: '' });
			expect(result.valid).toBe(false);
			expect(result.errors).toContain('explorerUrl must not be empty');
		});

		it('rejects empty tokens array', () => {
			const result = validateConfig({ ...validConfig, tokens: [] });
			expect(result.valid).toBe(false);
			expect(result.errors).toContain('at least one token configuration is required');
		});

		it('rejects token with empty symbol', () => {
			const tokens: StablecoinToken[] = [
				{
					...validConfig.tokens[0],
					symbol: ''
				}
			];
			const result = validateConfig({ ...validConfig, tokens });
			expect(result.valid).toBe(false);
			expect(result.errors).toContain('token symbol must not be empty');
		});

		it('rejects token with empty address', () => {
			const tokens: StablecoinToken[] = [
				{
					...validConfig.tokens[0],
					address: ''
				}
			];
			const result = validateConfig({ ...validConfig, tokens });
			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.includes('address must not be empty'))).toBe(true);
		});

		it('rejects token with negative decimals', () => {
			const tokens: StablecoinToken[] = [
				{
					...validConfig.tokens[0],
					decimals: -1
				}
			];
			const result = validateConfig({ ...validConfig, tokens });
			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.includes('decimals must not be negative'))).toBe(true);
		});

		it('rejects token with empty minGasReserve', () => {
			const tokens: StablecoinToken[] = [
				{
					...validConfig.tokens[0],
					minGasReserve: ''
				}
			];
			const result = validateConfig({ ...validConfig, tokens });
			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.includes('minGasReserve must not be empty'))).toBe(true);
		});

		it('rejects empty paymaster address', () => {
			const result = validateConfig({
				...validConfig,
				paymaster: { ...validConfig.paymaster, address: '' }
			});
			expect(result.valid).toBe(false);
			expect(result.errors).toContain('paymaster address must not be empty');
		});

		it('rejects negative paymaster minDeposit', () => {
			const result = validateConfig({
				...validConfig,
				paymaster: { ...validConfig.paymaster, minDeposit: -1n }
			});
			expect(result.valid).toBe(false);
			expect(result.errors).toContain('paymaster minDeposit must not be negative');
		});

		it('rejects negative paymaster maxGasCapPerTx', () => {
			const result = validateConfig({
				...validConfig,
				paymaster: { ...validConfig.paymaster, maxGasCapPerTx: -1n }
			});
			expect(result.valid).toBe(false);
			expect(result.errors).toContain('paymaster maxGasCapPerTx must not be negative');
		});

		it('accumulates multiple errors', () => {
			const result = validateConfig({
				...validConfig,
				chainId: 0,
				chainName: '',
				rpcUrls: [],
				tokens: []
			});
			expect(result.valid).toBe(false);
			expect(result.errors.length).toBeGreaterThanOrEqual(4);
		});
	});

	describe('BSC mainnet registry data integrity', () => {
		it('has valid USDT token address on BSC mainnet', () => {
			const token = getTokenConfig('USDT', 56);
			expect(token!.address).toMatch(/^0x[a-f0-9]{40}$/);
		});

		it('has correct paymaster config structure', () => {
			const config = getStablecoinConfig(56);
			expect(config!.paymaster.version).toBe('eip7702-v1');
			expect(config!.paymaster.minDeposit).toBeGreaterThan(0n);
			expect(config!.paymaster.maxGasCapPerTx).toBeGreaterThan(0n);
		});

		it('USDT is marked as gas token on BSC mainnet', () => {
			const token = getTokenConfig('USDT', 56);
			expect(token!.isGasToken).toBe(true);
			expect(token!.minGasReserve).toBe('0.20');
		});

		it('BSC mainnet paymaster config has all required fields', () => {
			const config = getStablecoinConfig(56);
			expect(config!.paymaster.address).toBeTruthy();
			expect(config!.paymaster.delegationContract).toBeTruthy();
			expect(config!.paymaster.usdtPriceOracle).toBeTruthy();
		});
	});
});
