import { describe, it, expect } from 'vitest';
import {
	toSourceWallet,
	toDestination,
	getChainOption,
	getAddressExplorerUrl,
	DESTINATION_CHAIN_OPTIONS
} from '$lib/utils/send-network-mapping';

// ─── toSourceWallet ────────────────────────────────────────────────

describe('toSourceWallet', () => {
	describe('explicit source wallet IDs', () => {
		it('maps rootstock-bitcoin to rbtc', () => {
			expect(toSourceWallet('rootstock-bitcoin')).toBe('rbtc');
		});

		it('maps usdt-bsc to usdt-bsc', () => {
			expect(toSourceWallet('usdt-bsc')).toBe('usdt-bsc');
		});

		it('maps usdt0-arbitrum to usdt0-arb', () => {
			expect(toSourceWallet('usdt0-arbitrum')).toBe('usdt0-arb');
		});

		it('maps usdt0-arb alias to usdt0-arb', () => {
			expect(toSourceWallet('usdt0-arb')).toBe('usdt0-arb');
		});

		it('maps wbtc-arbitrum to wbtc-arb', () => {
			expect(toSourceWallet('wbtc-arbitrum')).toBe('wbtc-arb');
		});

		it('maps wbtc-arb alias to wbtc-arb', () => {
			expect(toSourceWallet('wbtc-arb')).toBe('wbtc-arb');
		});

		it('maps tbtc-arbitrum to tbtc-arb', () => {
			expect(toSourceWallet('tbtc-arbitrum')).toBe('tbtc-arb');
		});

		it('maps tbtc-arb alias to tbtc-arb', () => {
			expect(toSourceWallet('tbtc-arb')).toBe('tbtc-arb');
		});
	});

	describe('connected wallet inference via detectedNetwork', () => {
		it('infers rbtc from detectedNetwork rootstock-bitcoin', () => {
			expect(toSourceWallet('connected-wallet-1', 'rootstock-bitcoin')).toBe('rbtc');
		});

		it('infers usdt-bsc from detectedNetwork usdt-bsc', () => {
			expect(toSourceWallet('connected-wallet-2', 'usdt-bsc')).toBe('usdt-bsc');
		});

		it('infers usdt0-arb from detectedNetwork usdt0-arbitrum', () => {
			expect(toSourceWallet('connected-wallet', 'usdt0-arbitrum')).toBe('usdt0-arb');
		});

		it('infers usdt0-arb from detectedNetwork usdt0-arb', () => {
			expect(toSourceWallet('connected-wallet', 'usdt0-arb')).toBe('usdt0-arb');
		});

		it('infers wbtc-arb from detectedNetwork wbtc-arbitrum', () => {
			expect(toSourceWallet('connected-wallet', 'wbtc-arbitrum')).toBe('wbtc-arb');
		});

		it('infers wbtc-arb from detectedNetwork wbtc-arb', () => {
			expect(toSourceWallet('connected-wallet', 'wbtc-arb')).toBe('wbtc-arb');
		});

		it('infers tbtc-arb from detectedNetwork tbtc-arbitrum', () => {
			expect(toSourceWallet('connected-wallet', 'tbtc-arbitrum')).toBe('tbtc-arb');
		});

		it('infers tbtc-arb from detectedNetwork tbtc-arb', () => {
			expect(toSourceWallet('connected-wallet', 'tbtc-arb')).toBe('tbtc-arb');
		});
	});

	describe('fallback behavior', () => {
		it('returns usdt-bsc for unknown source with no detected network', () => {
			expect(toSourceWallet('unknown-wallet')).toBe('usdt-bsc');
		});

		it('returns usdt-bsc for unknown source with unknown detectedNetwork', () => {
			expect(toSourceWallet('unknown-wallet', 'unknown-network')).toBe('usdt-bsc');
		});

		it('returns usdt-bsc for unknown source with null detectedNetwork', () => {
			expect(toSourceWallet('unknown-wallet', null)).toBe('usdt-bsc');
		});
	});
});

// ─── toDestination ─────────────────────────────────────────────────

describe('toDestination', () => {
	const mainnetConfig = { rskNetwork: 'mainnet', bscNetwork: 'mainnet' };
	const testnetConfig = { rskNetwork: 'testnet', bscNetwork: 'testnet' };

	describe('null/empty guard', () => {
		it('returns null when network is null', () => {
			expect(toDestination(null, '0x123')).toBeNull();
		});

		it('returns null when address is empty', () => {
			expect(toDestination('rootstock-bitcoin', '')).toBeNull();
		});

		it('returns null when both are empty', () => {
			expect(toDestination(null, '')).toBeNull();
		});
	});

	describe('explicit chain ID override', () => {
		it('returns override chainId for EVM network', () => {
			const result = toDestination('rootstock-bitcoin', '0x123', 42161, mainnetConfig);
			expect(result).toEqual({ type: 'address', chainId: 42161, address: '0x123' });
		});

		it('ignores override for lightning-bitcoin', () => {
			const result = toDestination('lightning-bitcoin', 'lnbc1...', 999, mainnetConfig);
			expect(result).toEqual({ type: 'invoice', network: 'lightning', invoice: 'lnbc1...' });
		});

		it('ignores override for bitcoin', () => {
			const result = toDestination('bitcoin', 'bc1q...', 999, mainnetConfig);
			expect(result).toEqual({ type: 'invoice', network: 'onchain', invoice: 'bc1q...' });
		});

		it('uses override when chainId is 0 (TRON placeholder)', () => {
			const result = toDestination('usdt-bsc', '0x123', 0, mainnetConfig);
			expect(result).toEqual({ type: 'address', chainId: 0, address: '0x123' });
		});
	});

	describe('rootstock-bitcoin', () => {
		it('maps to chainId 30 on mainnet', () => {
			const result = toDestination('rootstock-bitcoin', '0xabc', undefined, mainnetConfig);
			expect(result).toEqual({ type: 'address', chainId: 30, address: '0xabc' });
		});

		it('maps to chainId 31 on testnet', () => {
			const result = toDestination('rootstock-bitcoin', '0xabc', undefined, testnetConfig);
			expect(result).toEqual({ type: 'address', chainId: 31, address: '0xabc' });
		});
	});

	describe('usdt-bsc', () => {
		it('maps to chainId 56 on mainnet', () => {
			const result = toDestination('usdt-bsc', '0xabc', undefined, mainnetConfig);
			expect(result).toEqual({ type: 'address', chainId: 56, address: '0xabc' });
		});

		it('maps to chainId 97 on testnet', () => {
			const result = toDestination('usdt-bsc', '0xabc', undefined, testnetConfig);
			expect(result).toEqual({ type: 'address', chainId: 97, address: '0xabc' });
		});
	});

	describe('usdt-ethereum', () => {
		it('maps to chainId 1 on mainnet', () => {
			const result = toDestination('usdt-ethereum', '0xabc', undefined, mainnetConfig);
			expect(result).toEqual({ type: 'address', chainId: 1, address: '0xabc' });
		});

		it('maps to chainId 11155111 on testnet', () => {
			const result = toDestination('usdt-ethereum', '0xabc', undefined, testnetConfig);
			expect(result).toEqual({ type: 'address', chainId: 11155111, address: '0xabc' });
		});
	});

	describe('usdt-arbitrum', () => {
		it('maps to chainId 42161 on mainnet', () => {
			const result = toDestination('usdt-arbitrum', '0xabc', undefined, mainnetConfig);
			expect(result).toEqual({ type: 'address', chainId: 42161, address: '0xabc' });
		});

		it('maps to chainId 421614 on testnet', () => {
			const result = toDestination('usdt-arbitrum', '0xabc', undefined, testnetConfig);
			expect(result).toEqual({ type: 'address', chainId: 421614, address: '0xabc' });
		});
	});

	describe('usdt-polygon', () => {
		it('maps to chainId 137 on mainnet', () => {
			const result = toDestination('usdt-polygon', '0xabc', undefined, mainnetConfig);
			expect(result).toEqual({ type: 'address', chainId: 137, address: '0xabc' });
		});

		it('maps to chainId 80002 on testnet', () => {
			const result = toDestination('usdt-polygon', '0xabc', undefined, testnetConfig);
			expect(result).toEqual({ type: 'address', chainId: 80002, address: '0xabc' });
		});
	});

	describe('usdt-optimism', () => {
		it('maps to chainId 10 on mainnet', () => {
			const result = toDestination('usdt-optimism', '0xabc', undefined, mainnetConfig);
			expect(result).toEqual({ type: 'address', chainId: 10, address: '0xabc' });
		});

		it('maps to chainId 11155420 on testnet', () => {
			const result = toDestination('usdt-optimism', '0xabc', undefined, testnetConfig);
			expect(result).toEqual({ type: 'address', chainId: 11155420, address: '0xabc' });
		});
	});

	describe('usdt-base', () => {
		it('maps to chainId 8453 on mainnet', () => {
			const result = toDestination('usdt-base', '0xabc', undefined, mainnetConfig);
			expect(result).toEqual({ type: 'address', chainId: 8453, address: '0xabc' });
		});

		it('maps to chainId 84532 on testnet', () => {
			const result = toDestination('usdt-base', '0xabc', undefined, testnetConfig);
			expect(result).toEqual({ type: 'address', chainId: 84532, address: '0xabc' });
		});
	});

	describe('usdt-avalanche', () => {
		it('maps to chainId 43114 on mainnet', () => {
			const result = toDestination('usdt-avalanche', '0xabc', undefined, mainnetConfig);
			expect(result).toEqual({ type: 'address', chainId: 43114, address: '0xabc' });
		});

		it('maps to chainId 43113 on testnet', () => {
			const result = toDestination('usdt-avalanche', '0xabc', undefined, testnetConfig);
			expect(result).toEqual({ type: 'address', chainId: 43113, address: '0xabc' });
		});
	});

	describe('usdt-tron', () => {
		it('maps to chainId 0 (placeholder)', () => {
			const result = toDestination('usdt-tron', 'TRXaddr', undefined, mainnetConfig);
			expect(result).toEqual({ type: 'address', chainId: 0, address: 'TRXaddr' });
		});
	});

	describe('lightning-bitcoin', () => {
		it('returns invoice destination with lightning network', () => {
			const result = toDestination('lightning-bitcoin', 'lnbc1...', undefined, mainnetConfig);
			expect(result).toEqual({ type: 'invoice', network: 'lightning', invoice: 'lnbc1...' });
		});
	});

	describe('bitcoin', () => {
		it('returns invoice destination with onchain network', () => {
			const result = toDestination('bitcoin', 'bc1q...', undefined, mainnetConfig);
			expect(result).toEqual({ type: 'invoice', network: 'onchain', invoice: 'bc1q...' });
		});
	});

	describe('unknown network', () => {
		it('returns null for unrecognized network', () => {
			expect(toDestination('unknown-network', '0xabc')).toBeNull();
		});
	});
});

// ─── getChainOption ────────────────────────────────────────────────

describe('getChainOption', () => {
	it('returns null when chainId is null', () => {
		expect(getChainOption(null)).toBeNull();
	});

	it('finds option by mainnet chainId', () => {
		const result = getChainOption(30);
		expect(result).toBeDefined();
		expect(result?.network).toBe('rootstock-bitcoin');
	});

	it('finds option by testnet chainId', () => {
		const result = getChainOption(31);
		expect(result).toBeDefined();
		expect(result?.network).toBe('rootstock-bitcoin');
	});

	it('finds BSC mainnet by chainId', () => {
		const result = getChainOption(56);
		expect(result).toBeDefined();
		expect(result?.network).toBe('usdt-bsc');
	});

	it('finds BSC testnet by chainId', () => {
		const result = getChainOption(97);
		expect(result).toBeDefined();
		expect(result?.network).toBe('usdt-bsc');
	});

	it('finds lightning by chainId -1', () => {
		const result = getChainOption(-1);
		expect(result).toBeDefined();
		expect(result?.network).toBe('lightning-bitcoin');
	});

	it('finds bitcoin by chainId -2', () => {
		const result = getChainOption(-2);
		expect(result).toBeDefined();
		expect(result?.network).toBe('bitcoin');
	});

	it('finds TRON by chainId -3', () => {
		const result = getChainOption(-3);
		expect(result).toBeDefined();
		expect(result?.network).toBe('usdt-tron');
	});

	it('finds Liquid by chainId -4', () => {
		const result = getChainOption(-4);
		expect(result).toBeDefined();
		expect(result?.network).toBe('liquid-bitcoin');
	});

	it('falls back to detectedNetwork when chainId not found', () => {
		// Use a chainId not in the list but with a matching detectedNetwork
		const result = getChainOption(999, 'rootstock-bitcoin');
		expect(result).toBeDefined();
		expect(result?.network).toBe('rootstock-bitcoin');
	});

	it('returns null for unknown chainId and no detectedNetwork', () => {
		expect(getChainOption(999999)).toBeNull();
	});

	it('returns null for unknown chainId with non-matching detectedNetwork', () => {
		// If detectedNetwork doesn't match any chain option either, returns null
		const result = getChainOption(999999, 'no-such-network');
		expect(result).toBeNull();
	});

	it('finds all DESTINATION_CHAIN_OPTIONS entries by chainId', () => {
		for (const option of DESTINATION_CHAIN_OPTIONS) {
			const result = getChainOption(option.id);
			expect(result?.network).toBe(option.network);
		}
	});
});

// ─── getAddressExplorerUrl ─────────────────────────────────────────

describe('getAddressExplorerUrl', () => {
	const mainnetConfig = { rskNetwork: 'mainnet', bscNetwork: 'mainnet' };
	const testnetConfig = { rskNetwork: 'testnet', bscNetwork: 'testnet' };

	describe('null/empty guard', () => {
		it('returns null when address is empty', () => {
			expect(getAddressExplorerUrl('', 'rootstock-bitcoin', mainnetConfig)).toBeNull();
		});

		it('returns null when network is null', () => {
			expect(getAddressExplorerUrl('0x123', null, mainnetConfig)).toBeNull();
		});
	});

	describe('rootstock-bitcoin', () => {
		it('returns mainnet blockscout URL', () => {
			const url = getAddressExplorerUrl('0xabc', 'rootstock-bitcoin', mainnetConfig);
			expect(url).toBe('https://rootstock.blockscout.com/address/0xabc');
		});

		it('returns testnet blockscout URL', () => {
			const url = getAddressExplorerUrl('0xabc', 'rootstock-bitcoin', testnetConfig);
			expect(url).toBe('https://rootstock-testnet.blockscout.com/address/0xabc');
		});

		it('handles rsk alias', () => {
			const url = getAddressExplorerUrl('0xabc', 'rsk', mainnetConfig);
			expect(url).toBe('https://rootstock.blockscout.com/address/0xabc');
		});
	});

	describe('usdt-bsc', () => {
		it('returns mainnet bscscan URL', () => {
			const url = getAddressExplorerUrl('0xabc', 'usdt-bsc', mainnetConfig);
			expect(url).toBe('https://bscscan.com/address/0xabc');
		});

		it('returns testnet bscscan URL', () => {
			const url = getAddressExplorerUrl('0xabc', 'usdt-bsc', testnetConfig);
			expect(url).toBe('https://testnet.bscscan.com/address/0xabc');
		});

		it('handles bsc alias', () => {
			const url = getAddressExplorerUrl('0xabc', 'bsc', mainnetConfig);
			expect(url).toBe('https://bscscan.com/address/0xabc');
		});
	});

	describe('bitcoin', () => {
		it('returns mainnet blockstream URL', () => {
			const url = getAddressExplorerUrl('bc1qtest', 'bitcoin', mainnetConfig);
			expect(url).toBe('https://blockstream.info/address/bc1qtest');
		});

		it('returns testnet blockstream URL', () => {
			const url = getAddressExplorerUrl('bc1qtest', 'bitcoin', testnetConfig);
			expect(url).toBe('https://blockstream.info/testnet/address/bc1qtest');
		});
	});

	describe('liquid-bitcoin', () => {
		it('returns mainnet liquid blockstream URL', () => {
			const url = getAddressExplorerUrl('lq1test', 'liquid-bitcoin', mainnetConfig);
			expect(url).toBe('https://blockstream.info/liquid/address/lq1test');
		});

		it('returns testnet liquid blockstream URL', () => {
			const url = getAddressExplorerUrl('lq1test', 'liquid-bitcoin', testnetConfig);
			expect(url).toBe('https://blockstream.info/liquidtestnet/address/lq1test');
		});
	});

	describe('unsupported networks', () => {
		it('returns null for ethereum', () => {
			expect(getAddressExplorerUrl('0xabc', 'usdt-ethereum', mainnetConfig)).toBeNull();
		});

		it('returns null for arbitrum', () => {
			expect(getAddressExplorerUrl('0xabc', 'usdt-arbitrum', mainnetConfig)).toBeNull();
		});

		it('returns null for lightning-bitcoin', () => {
			expect(getAddressExplorerUrl('lnbc1...', 'lightning-bitcoin', mainnetConfig)).toBeNull();
		});

		it('returns null for tron', () => {
			expect(getAddressExplorerUrl('TRXaddr', 'usdt-tron', mainnetConfig)).toBeNull();
		});
	});
});
