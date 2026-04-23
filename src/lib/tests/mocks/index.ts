import { vi } from 'vitest';

export const createWalletCoreMock = () => ({
	normalizeRskAddress: vi.fn((addr: string) => addr ?? ''),
	FEE_TIERS: { 1: { percentage: 250 }, 2: { percentage: 200 }, 3: { percentage: 150 } },
	RSK_NETWORKS: {},
	getRSKConfig: vi.fn(),
	getBSCConfig: vi.fn(),
	ERC20_ABI: [],
	getUSDTToken: vi.fn(),
	getSwapAddress: vi.fn(),
	weiToSatoshi: vi.fn((wei: bigint) => wei / BigInt(1e10)),
	EventBus: { on: vi.fn(), emit: vi.fn(), off: vi.fn() },
	WalletManager: vi.fn()
});

export const createNostrKeysMock = () => ({
	getNpub: vi.fn().mockResolvedValue('npub1test123456789'),
	getNostrKeyPair: vi.fn().mockResolvedValue({
		npub: 'npub1test123456789',
		nsec: 'nsec1test123456789'
	})
});

export const createNostrMessageMock = () => ({
	fetchComprehensiveProfile: vi.fn().mockResolvedValue(null),
	getSignedEvent: vi.fn(),
	publishToMultipleRelays: vi.fn(),
	queryNostrEvents: vi.fn()
});

export const createWalletStoreMock = () => ({
	getWallet: vi.fn(),
	getProvider: vi.fn(),
	walletManager: vi.fn()
});

export const createEthersMock = () => ({
	Contract: vi.fn(),
	JsonRpcProvider: vi.fn(),
	BrowserProvider: vi.fn(),
	formatEther: vi.fn((n: bigint) => (Number(n) / 1e18).toFixed(6)),
	formatUnits: vi.fn((n: bigint, u: number) => (Number(n) / 10 ** u).toFixed(6))
});
