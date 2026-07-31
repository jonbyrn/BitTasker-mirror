import { describe, it, expect } from 'vitest';
import {
	toSourceWallet,
	toDestination,
	getChainOption,
	getAddressExplorerUrl,
	DESTINATION_CHAIN_OPTIONS,
	getNetworkDisplay,
	getResolvedChainId,
	toDestinations,
	getAllNetworkDisplays,
	NETWORK_TO_CHAIN_ID,
	CHAIN_ID_TO_NETWORK
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

		it('maps usdt0-arb to usdt0-arb', () => {
			expect(toSourceWallet('usdt0-arb')).toBe('usdt0-arb');
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

		it('infers usdt0-arb from detectedNetwork usdt0-arb', () => {
			expect(toSourceWallet('connected-wallet', 'usdt0-arb')).toBe('usdt0-arb');
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

		it('uses override when chainId is 0 (generic EVM placeholder)', () => {
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

	describe('usdt0-arb', () => {
		it('maps to chainId 42161 on mainnet', () => {
			const result = toDestination('usdt0-arb', '0xabc', undefined, mainnetConfig);
			expect(result).toEqual({ type: 'address', chainId: 42161, address: '0xabc' });
		});

		it('maps to chainId 421614 on testnet', () => {
			const result = toDestination('usdt0-arb', '0xabc', undefined, testnetConfig);
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
		it('maps to chainId -3 (TRON placeholder ID)', () => {
			const result = toDestination('usdt-tron', 'TRXaddr', undefined, mainnetConfig);
			expect(result).toEqual({ type: 'address', chainId: -3, address: 'TRXaddr' });
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

		it('handles rsk alias (falls back to exact network name)', () => {
			// 'rsk' is not a valid network key — returns null; consumers must use 'rootstock-bitcoin'
			const url = getAddressExplorerUrl('0xabc', 'rsk', mainnetConfig);
			expect(url).toBeNull();
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

		it('handles bsc alias (falls back to exact network name)', () => {
			// 'bsc' is not a valid network key — returns null; consumers must use 'usdt-bsc'
			const url = getAddressExplorerUrl('0xabc', 'bsc', mainnetConfig);
			expect(url).toBeNull();
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

	describe('supported EVM networks', () => {
		it('returns etherscan for ethereum', () => {
			expect(getAddressExplorerUrl('0xabc', 'usdt-ethereum', mainnetConfig)).toBe(
				'https://etherscan.io/address/0xabc'
			);
		});

		it('returns arbiscan for arbitrum', () => {
			expect(getAddressExplorerUrl('0xabc', 'usdt0-arb', mainnetConfig)).toBe(
				'https://arbiscan.io/address/0xabc'
			);
		});

		it('returns mempool.space URL for lightning-bitcoin', () => {
			expect(getAddressExplorerUrl('lnbc1...', 'lightning-bitcoin', mainnetConfig)).toBe(
				'https://mempool.space/lightning/node/lnbc1...'
			);
		});

		it('returns tronscan for tron', () => {
			expect(getAddressExplorerUrl('TRXaddr', 'usdt-tron', mainnetConfig)).toBe(
				'https://tronscan.org/#/address/TRXaddr'
			);
		});
	});
});

// ─── getNetworkDisplay ──────────────────────────────────────────────

describe('getNetworkDisplay', () => {
	const mainnetConfig = { rskNetwork: 'mainnet', bscNetwork: 'mainnet' };
	const testnetConfig = { rskNetwork: 'testnet', bscNetwork: 'testnet' };

	it('returns icon, name, confirmationTime, explorerUrl for a valid mainnet network', () => {
		const result = getNetworkDisplay('rootstock-bitcoin', mainnetConfig);
		expect(result).toEqual({
			icon: '/images/chains/Bitcoin-Rootstock-logo.webp',
			name: 'Rootstock Bitcoin',
			confirmationTime: 30,
			explorerUrl: 'https://rootstock.blockscout.com/address/'
		});
	});

	it('returns testnet explorerUrl for testnet config', () => {
		const result = getNetworkDisplay('rootstock-bitcoin', testnetConfig);
		expect(result).not.toBeNull();
		expect(result!.explorerUrl).toBe('https://rootstock-testnet.blockscout.com/address/');
	});

	it('returns null for an unknown network', () => {
		expect(getNetworkDisplay('unknown-network', mainnetConfig)).toBeNull();
	});

	it('returns lightning explorer URL for lightning-bitcoin', () => {
		const result = getNetworkDisplay('lightning-bitcoin', mainnetConfig);
		expect(result).not.toBeNull();
		expect(result!.explorerUrl).toBe('https://mempool.space/lightning/node/');
		expect(result!.name).toBe('Lightning');
		expect(result!.confirmationTime).toBe(0);
	});

	it('returns tronscan URL for usdt-tron', () => {
		const result = getNetworkDisplay('usdt-tron', mainnetConfig);
		expect(result).not.toBeNull();
		expect(result!.explorerUrl).toBe('https://tronscan.org/#/address/');
		expect(result!.name).toBe('TRON');
	});

	it('uses default env vars when no config is provided', () => {
		const result = getNetworkDisplay('rootstock-bitcoin');
		expect(result).not.toBeNull();
		expect(result!.name).toBe('Rootstock Bitcoin');
		expect(result!.icon).toBe('/images/chains/Bitcoin-Rootstock-logo.webp');
		// Verify explorer URL is set and matches one of the known RSK explorers
		expect(result!.explorerUrl).toBeTruthy();
		expect(result!.explorerUrl).toMatch(
			/^https:\/\/rootstock(-testnet)?\.blockscout\.com\/address\/$/
		);
	});

	it('returns correct data for usdt-bsc mainnet', () => {
		const result = getNetworkDisplay('usdt-bsc', mainnetConfig);
		expect(result).toEqual({
			icon: '/images/chains/Binance-logo.svg',
			name: 'Binance',
			confirmationTime: 1,
			explorerUrl: 'https://bscscan.com/address/'
		});
	});

	it('returns correct data for usdt-bsc testnet', () => {
		const result = getNetworkDisplay('usdt-bsc', testnetConfig);
		expect(result).not.toBeNull();
		expect(result!.explorerUrl).toBe('https://testnet.bscscan.com/address/');
	});

	it('returns correct data for bitcoin', () => {
		const result = getNetworkDisplay('bitcoin', mainnetConfig);
		expect(result).toEqual({
			icon: '/images/chains/Bitcoin.svg',
			name: 'Bitcoin',
			confirmationTime: 600,
			explorerUrl: 'https://blockstream.info/address/'
		});
	});

	it('returns correct data for liquid-bitcoin', () => {
		const result = getNetworkDisplay('liquid-bitcoin', mainnetConfig);
		expect(result).toEqual({
			icon: '/images/chains/Liquid-Bitcoin.svg',
			name: 'Liquid',
			confirmationTime: 60,
			explorerUrl: 'https://blockstream.info/liquid/address/'
		});
	});
});

// ─── getResolvedChainId ─────────────────────────────────────────────

describe('getResolvedChainId', () => {
	const mainnetConfig = { rskNetwork: 'mainnet', bscNetwork: 'mainnet' };
	const testnetConfig = { rskNetwork: 'testnet', bscNetwork: 'testnet' };

	it('returns mainnet chain ID for rootstock-bitcoin on mainnet', () => {
		expect(getResolvedChainId('rootstock-bitcoin', mainnetConfig)).toBe(30);
	});

	it('returns testnet chain ID for rootstock-bitcoin on testnet', () => {
		expect(getResolvedChainId('rootstock-bitcoin', testnetConfig)).toBe(31);
	});

	it('returns 0 for an unknown network', () => {
		expect(getResolvedChainId('unknown-network', mainnetConfig)).toBe(0);
	});

	it('returns 56 for BSC with mainnet config', () => {
		expect(getResolvedChainId('usdt-bsc', mainnetConfig)).toBe(56);
	});

	it('returns 97 for BSC with testnet config', () => {
		expect(getResolvedChainId('usdt-bsc', testnetConfig)).toBe(97);
	});

	it('returns mainnet ID for usdt-ethereum on mainnet', () => {
		expect(getResolvedChainId('usdt-ethereum', mainnetConfig)).toBe(1);
	});

	it('returns testnet ID for usdt-ethereum on testnet', () => {
		expect(getResolvedChainId('usdt-ethereum', testnetConfig)).toBe(11155111);
	});

	it('returns mainnet ID for usdt0-arb on mainnet', () => {
		expect(getResolvedChainId('usdt0-arb', mainnetConfig)).toBe(42161);
	});

	it('returns testnet ID for usdt0-arb on testnet', () => {
		expect(getResolvedChainId('usdt0-arb', testnetConfig)).toBe(421614);
	});

	it('returns mainnet ID for usdt-polygon on mainnet', () => {
		expect(getResolvedChainId('usdt-polygon', mainnetConfig)).toBe(137);
	});

	it('returns testnet ID for usdt-polygon on testnet', () => {
		expect(getResolvedChainId('usdt-polygon', testnetConfig)).toBe(80002);
	});

	it('returns mainnet ID for usdt-optimism on mainnet', () => {
		expect(getResolvedChainId('usdt-optimism', mainnetConfig)).toBe(10);
	});

	it('returns testnet ID for usdt-optimism on testnet', () => {
		expect(getResolvedChainId('usdt-optimism', testnetConfig)).toBe(11155420);
	});

	it('returns mainnet ID for usdt-base on mainnet', () => {
		expect(getResolvedChainId('usdt-base', mainnetConfig)).toBe(8453);
	});

	it('returns testnet ID for usdt-base on testnet', () => {
		expect(getResolvedChainId('usdt-base', testnetConfig)).toBe(84532);
	});

	it('returns mainnet ID for usdt-avalanche on mainnet', () => {
		expect(getResolvedChainId('usdt-avalanche', mainnetConfig)).toBe(43114);
	});

	it('returns testnet ID for usdt-avalanche on testnet', () => {
		expect(getResolvedChainId('usdt-avalanche', testnetConfig)).toBe(43113);
	});

	it('returns lightning-bitcoin id (-1) which has no testnetId', () => {
		expect(getResolvedChainId('lightning-bitcoin', mainnetConfig)).toBe(-1);
	});

	it('returns bitcoin id (-2) which has no testnetId', () => {
		expect(getResolvedChainId('bitcoin', mainnetConfig)).toBe(-2);
	});

	it('returns usdt-tron id (-3) which has no testnetId', () => {
		expect(getResolvedChainId('usdt-tron', mainnetConfig)).toBe(-3);
	});

	it('returns liquid-bitcoin id (-4) which has no testnetId', () => {
		expect(getResolvedChainId('liquid-bitcoin', mainnetConfig)).toBe(-4);
	});

	it('defaults RSK to env-configured network when no config provided', () => {
		// Without config, resolveConfig uses VITE_RSK_NETWORK env var (or 'testnet')
		const chainId = getResolvedChainId('rootstock-bitcoin');
		// Should be either mainnet (30) or testnet (31) depending on env
		expect([30, 31]).toContain(chainId);
	});

	it('defaults BSC to env-configured network when no config provided', () => {
		const chainId = getResolvedChainId('usdt-bsc');
		// Should be either mainnet (56) or testnet (97) depending on env
		expect([56, 97]).toContain(chainId);
	});
});

// ─── toDestinations ─────────────────────────────────────────────────

describe('toDestinations', () => {
	it('returns an array with both btc and usdt groups', () => {
		const result = toDestinations();
		const groups = new Set(result.map((d) => d.group));
		expect(groups.has('btc')).toBe(true);
		expect(groups.has('usdt')).toBe(true);
	});

	it('each entry has id, asset, label, icon, group', () => {
		const result = toDestinations();
		for (const entry of result) {
			expect(typeof entry.id).toBe('string');
			expect(typeof entry.asset).toBe('string');
			expect(typeof entry.label).toBe('string');
			expect(typeof entry.icon).toBe('string');
			expect(['btc', 'usdt']).toContain(entry.group);
		}
	});

	it('bitcoin networks are in btc group', () => {
		const result = toDestinations();
		const btcNetworks = result.filter((d) => d.group === 'btc');
		const btcIds = btcNetworks.map((d) => d.id);
		expect(btcIds).toContain('rootstock-bitcoin');
		expect(btcIds).toContain('lightning-bitcoin');
		expect(btcIds).toContain('bitcoin');
		expect(btcIds).toContain('liquid-bitcoin');
	});

	it('USDT networks are in usdt group', () => {
		const result = toDestinations();
		const usdtNetworks = result.filter((d) => d.group === 'usdt');
		const usdtIds = usdtNetworks.map((d) => d.id);
		expect(usdtIds).toContain('usdt-bsc');
		expect(usdtIds).toContain('usdt-ethereum');
		expect(usdtIds).toContain('usdt0-arb');
		expect(usdtIds).toContain('usdt-polygon');
		expect(usdtIds).toContain('usdt-optimism');
		expect(usdtIds).toContain('usdt-base');
		expect(usdtIds).toContain('usdt-avalanche');
		expect(usdtIds).toContain('usdt-tron');
	});

	it('recommended entries have recommended flag', () => {
		const result = toDestinations();
		const recommended = result.filter((d) => d.recommended === true);
		const recommendedIds = recommended.map((d) => d.id);
		// rootstock-bitcoin and usdt0-arb are marked recommended in DESTINATION_CHAIN_OPTIONS
		expect(recommendedIds).toContain('rootstock-bitcoin');
		expect(recommendedIds).toContain('usdt0-arb');
		expect(recommended.length).toBe(2);
	});

	it('non-recommended entries have undefined recommended', () => {
		const result = toDestinations();
		const nonRecommended = result.filter((d) => d.recommended === undefined);
		expect(nonRecommended.length).toBe(DESTINATION_CHAIN_OPTIONS.length - 2);
	});

	it('returns one entry per DESTINATION_CHAIN_OPTIONS', () => {
		const result = toDestinations();
		expect(result.length).toBe(DESTINATION_CHAIN_OPTIONS.length);
	});

	it('id field matches the network string from DESTINATION_CHAIN_OPTIONS', () => {
		const result = toDestinations();
		for (let i = 0; i < result.length; i++) {
			expect(result[i].id).toBe(DESTINATION_CHAIN_OPTIONS[i].network);
		}
	});
});

// ─── getAllNetworkDisplays ──────────────────────────────────────────

describe('getAllNetworkDisplays', () => {
	const mainnetConfig = { rskNetwork: 'mainnet', bscNetwork: 'mainnet' };

	it('returns a Record keyed by network string', () => {
		const result = getAllNetworkDisplays(mainnetConfig);
		expect(typeof result).toBe('object');
		expect(result).not.toBeNull();
		expect(Array.isArray(result)).toBe(false);
	});

	it('each entry has icon, name, confirmationTime', () => {
		const result = getAllNetworkDisplays(mainnetConfig);
		for (const [key, value] of Object.entries(result)) {
			expect(typeof key).toBe('string');
			expect(typeof value.icon).toBe('string');
			expect(typeof value.name).toBe('string');
			expect(typeof value.confirmationTime).toBe('number');
		}
	});

	it('all DESTINATION_CHAIN_OPTIONS networks are present', () => {
		const result = getAllNetworkDisplays(mainnetConfig);
		for (const opt of DESTINATION_CHAIN_OPTIONS) {
			expect(result[opt.network]).toBeDefined();
			expect(result[opt.network].name).toBe(opt.label);
			expect(result[opt.network].icon).toBe(opt.icon);
		}
	});

	it('contains at least 10 networks', () => {
		const result = getAllNetworkDisplays(mainnetConfig);
		expect(Object.keys(result).length).toBeGreaterThanOrEqual(10);
	});

	it('uses default config when none provided', () => {
		const result = getAllNetworkDisplays();
		// Should still return all networks (defaults to testnet)
		expect(Object.keys(result).length).toBe(DESTINATION_CHAIN_OPTIONS.length);
		expect(result['rootstock-bitcoin']).toBeDefined();
	});

	it('rootstock-bitcoin uses correct mainnet confirmationTime', () => {
		const result = getAllNetworkDisplays(mainnetConfig);
		expect(result['rootstock-bitcoin'].confirmationTime).toBe(30);
	});

	it('bitcoin uses correct confirmationTime', () => {
		const result = getAllNetworkDisplays(mainnetConfig);
		expect(result['bitcoin'].confirmationTime).toBe(600);
	});

	it('lightning-bitcoin uses zero confirmationTime', () => {
		const result = getAllNetworkDisplays(mainnetConfig);
		expect(result['lightning-bitcoin'].confirmationTime).toBe(0);
	});
});

// ─── lookup maps ────────────────────────────────────────────────────

describe('lookup maps', () => {
	describe('NETWORK_TO_CHAIN_ID', () => {
		it('maps rootstock-bitcoin to 30', () => {
			expect(NETWORK_TO_CHAIN_ID['rootstock-bitcoin']).toBe(30);
		});

		it('maps usdt-bsc to 56', () => {
			expect(NETWORK_TO_CHAIN_ID['usdt-bsc']).toBe(56);
		});

		it('maps usdt-ethereum to 1', () => {
			expect(NETWORK_TO_CHAIN_ID['usdt-ethereum']).toBe(1);
		});

		it('maps usdt0-arb to 42161', () => {
			expect(NETWORK_TO_CHAIN_ID['usdt0-arb']).toBe(42161);
		});

		it('maps lightning-bitcoin to -1', () => {
			expect(NETWORK_TO_CHAIN_ID['lightning-bitcoin']).toBe(-1);
		});

		it('maps bitcoin to -2', () => {
			expect(NETWORK_TO_CHAIN_ID['bitcoin']).toBe(-2);
		});

		it('maps usdt-tron to -3', () => {
			expect(NETWORK_TO_CHAIN_ID['usdt-tron']).toBe(-3);
		});

		it('maps liquid-bitcoin to -4', () => {
			expect(NETWORK_TO_CHAIN_ID['liquid-bitcoin']).toBe(-4);
		});
	});

	describe('CHAIN_ID_TO_NETWORK', () => {
		it('maps 30 to rootstock-bitcoin', () => {
			expect(CHAIN_ID_TO_NETWORK[30]).toBe('rootstock-bitcoin');
		});

		it('maps 56 to usdt-bsc', () => {
			expect(CHAIN_ID_TO_NETWORK[56]).toBe('usdt-bsc');
		});

		it('maps 1 to usdt-ethereum', () => {
			expect(CHAIN_ID_TO_NETWORK[1]).toBe('usdt-ethereum');
		});

		it('maps 42161 to usdt0-arb', () => {
			expect(CHAIN_ID_TO_NETWORK[42161]).toBe('usdt0-arb');
		});

		it('maps -1 to lightning-bitcoin', () => {
			expect(CHAIN_ID_TO_NETWORK[-1]).toBe('lightning-bitcoin');
		});

		it('maps -2 to bitcoin', () => {
			expect(CHAIN_ID_TO_NETWORK[-2]).toBe('bitcoin');
		});

		it('maps -3 to usdt-tron', () => {
			expect(CHAIN_ID_TO_NETWORK[-3]).toBe('usdt-tron');
		});

		it('maps -4 to liquid-bitcoin', () => {
			expect(CHAIN_ID_TO_NETWORK[-4]).toBe('liquid-bitcoin');
		});
	});

	describe('consistency', () => {
		it('all entries in NETWORK_TO_CHAIN_ID have a reverse mapping in CHAIN_ID_TO_NETWORK', () => {
			for (const [network, chainId] of Object.entries(NETWORK_TO_CHAIN_ID)) {
				expect(CHAIN_ID_TO_NETWORK[chainId]).toBe(network);
			}
		});

		it('all entries in CHAIN_ID_TO_NETWORK have a reverse mapping in NETWORK_TO_CHAIN_ID', () => {
			for (const [chainId, network] of Object.entries(CHAIN_ID_TO_NETWORK)) {
				expect(NETWORK_TO_CHAIN_ID[network]).toBe(Number(chainId));
			}
		});

		it('both maps have the same number of entries as DESTINATION_CHAIN_OPTIONS', () => {
			expect(Object.keys(NETWORK_TO_CHAIN_ID).length).toBe(DESTINATION_CHAIN_OPTIONS.length);
			expect(Object.keys(CHAIN_ID_TO_NETWORK).length).toBe(DESTINATION_CHAIN_OPTIONS.length);
		});
	});
});
