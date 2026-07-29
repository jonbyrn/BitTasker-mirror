import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writable } from 'svelte/store';

const mockInitialize = vi.fn();
const mockInitContract = vi.fn();
const mockGetNostrKeyPair = vi.fn();
const mockExtractContractError = vi.fn((error: unknown) => ({
	userMessage: error instanceof Error ? error.message : 'unknown error'
}));

const walletStore = writable({
	isConnected: true,
	rsk: {
		address: '0x1111111111111111111111111111111111111111',
		wallet: {
			address: '0x1111111111111111111111111111111111111111'
		},
		provider: {}
	}
});

vi.mock('$lib/stores/wallet.store', () => ({
	walletStore,
	walletManager: {
		initialize: (...args: unknown[]) => mockInitialize(...args)
	}
}));

vi.mock('$lib/utils/contract/v2/contractAddress', () => ({
	getSecurePaymentContractAddress: () => '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
}));

vi.mock('$lib/utils/contract', () => ({
	initContract: (...args: unknown[]) => mockInitContract(...args)
}));

vi.mock('$lib/utils/wallet/contractErrorHandler', () => ({
	extractContractError: (...args: unknown[]) => mockExtractContractError(...(args as [unknown]))
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNostrKeyPair: (...args: unknown[]) => mockGetNostrKeyPair(...args)
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		subscribe: (run: (value: { pool: object; relays: string[] }) => void) => {
			run({
				pool: {
					querySync: vi.fn().mockResolvedValue([])
				},
				relays: ['wss://relay.example.com']
			});
			return () => {};
		}
	}
}));

describe('service contract preflight', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubEnv('VITE_RSK_NETWORK', 'testnet');
		walletStore.set({
			isConnected: true,
			rsk: {
				address: '0x1111111111111111111111111111111111111111',
				wallet: {
					address: '0x1111111111111111111111111111111111111111'
				},
				provider: {}
			}
		});
		mockInitContract.mockResolvedValue({
			contract: {
				createPaymentContract: {
					estimateGas: vi.fn().mockResolvedValue(1000n)
				}
			},
			wallet: {
				address: '0x1111111111111111111111111111111111111111'
			},
			provider: {
				getNetwork: vi.fn().mockResolvedValue({ chainId: 31n }),
				getFeeData: vi.fn().mockResolvedValue({ gasPrice: 100n }),
				getBalance: vi.fn().mockResolvedValue(10_000_000_000_000_000n)
			}
		});
		mockGetNostrKeyPair.mockResolvedValue({
			npub: 'a'.repeat(64),
			nsec: new Uint8Array([1, 2, 3])
		});
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('returns a deterministic success payload when wallet, network, and balance are ready', async () => {
		const { preflightServiceContractCreation } = await import(
			'$lib/utils/service-contract/preflight'
		);

		const result = await preflightServiceContractCreation(
			{
				freelancerAddress: '0x2222222222222222222222222222222222222222',
				freelancerPubkey: 'b'.repeat(64),
				amountUsdt: '125.00',
				estimatedStartTime: 1_800_000_000,
				estimatedCompletionTime: 1_800_086_400,
				freelancerFeeTier: 1
			},
			100000
		);

		expect(result).toMatchObject({
			ok: true,
			amount: '0.00125000',
			walletAddress: '0x1111111111111111111111111111111111111111'
		});
		if (!result.ok) {
			throw new Error('Expected preflight success.');
		}
		expect(Number(result.gasCost)).toBeGreaterThan(0);
		expect(Number(result.totalRequired)).toBeGreaterThan(Number(result.amount));
	});

	it('fails closed when the wallet cannot be initialized', async () => {
		const { preflightServiceContractCreation } = await import(
			'$lib/utils/service-contract/preflight'
		);
		walletStore.set({
			isConnected: false,
			rsk: {
				address: null as unknown as string,
				wallet: null as unknown as { address: string },
				provider: null as unknown as object
			}
		});
		mockInitialize.mockRejectedValueOnce(new Error('init failed'));

		await expect(
			preflightServiceContractCreation(
				{
					freelancerAddress: '0x2222222222222222222222222222222222222222',
					freelancerPubkey: 'b'.repeat(64),
					amountUsdt: '125.00',
					estimatedStartTime: 1_800_000_000,
					estimatedCompletionTime: 1_800_086_400
				},
				100000
			)
		).resolves.toEqual({
			ok: false,
			errorCode: 'wallet_not_connected',
			error: 'Connect your wallet before continuing.'
		});
	});

	it('fails closed when the wallet still is not ready after initialization', async () => {
		const { preflightServiceContractCreation } = await import(
			'$lib/utils/service-contract/preflight'
		);
		walletStore.set({
			isConnected: false,
			rsk: {
				address: null as unknown as string,
				wallet: null as unknown as { address: string },
				provider: null as unknown as object
			}
		});
		mockInitialize.mockResolvedValueOnce(undefined);

		await expect(
			preflightServiceContractCreation(
				{
					freelancerAddress: '0x2222222222222222222222222222222222222222',
					freelancerPubkey: 'b'.repeat(64),
					amountUsdt: '125.00',
					estimatedStartTime: 1_800_000_000,
					estimatedCompletionTime: 1_800_086_400
				},
				100000
			)
		).resolves.toEqual({
			ok: false,
			errorCode: 'wallet_not_ready',
			error: 'Your wallet is not ready yet. Retry after it finishes connecting.'
		});
	});

	it('fails when the provider wallet is invalid', async () => {
		const { preflightServiceContractCreation } = await import(
			'$lib/utils/service-contract/preflight'
		);

		await expect(
			preflightServiceContractCreation(
				{
					freelancerAddress: 'not-an-address',
					freelancerPubkey: 'b'.repeat(64),
					amountUsdt: '125.00',
					estimatedStartTime: 1_800_000_000,
					estimatedCompletionTime: 1_800_086_400
				},
				100000
			)
		).resolves.toEqual({
			ok: false,
			errorCode: 'invalid_provider_wallet',
			error: 'Provider wallet is unavailable for this service.'
		});
	});

	it('fails when the service amount is invalid before wallet preflight begins', async () => {
		const { preflightServiceContractCreation } = await import(
			'$lib/utils/service-contract/preflight'
		);

		await expect(
			preflightServiceContractCreation(
				{
					freelancerAddress: '0x2222222222222222222222222222222222222222',
					freelancerPubkey: 'b'.repeat(64),
					amountUsdt: '0',
					estimatedStartTime: 1_800_000_000,
					estimatedCompletionTime: 1_800_086_400
				},
				100000
			)
		).resolves.toEqual({
			ok: false,
			errorCode: 'invalid_service_amount',
			error: 'Invalid service amount. Expected a positive USD value.'
		});
	});

	it('fails when BTC price is unavailable before wallet preflight begins', async () => {
		const { preflightServiceContractCreation } = await import(
			'$lib/utils/service-contract/preflight'
		);

		await expect(
			preflightServiceContractCreation(
				{
					freelancerAddress: '0x2222222222222222222222222222222222222222',
					freelancerPubkey: 'b'.repeat(64),
					amountUsdt: '125.00',
					estimatedStartTime: 1_800_000_000,
					estimatedCompletionTime: 1_800_086_400
				},
				0
			)
		).resolves.toEqual({
			ok: false,
			errorCode: 'price_unavailable',
			error: 'Unable to determine the current BTC price.'
		});
	});

	it('fails closed on the wrong network', async () => {
		const { preflightServiceContractCreation } = await import(
			'$lib/utils/service-contract/preflight'
		);
		mockInitContract.mockResolvedValueOnce({
			contract: {
				createPaymentContract: {
					estimateGas: vi.fn()
				}
			},
			wallet: {
				address: '0x1111111111111111111111111111111111111111'
			},
			provider: {
				getNetwork: vi.fn().mockResolvedValue({ chainId: 30n }),
				getFeeData: vi.fn(),
				getBalance: vi.fn()
			}
		});

		await expect(
			preflightServiceContractCreation(
				{
					freelancerAddress: '0x2222222222222222222222222222222222222222',
					freelancerPubkey: 'b'.repeat(64),
					amountUsdt: '125.00',
					estimatedStartTime: 1_800_000_000,
					estimatedCompletionTime: 1_800_086_400
				},
				100000
			)
		).resolves.toEqual({
			ok: false,
			errorCode: 'wrong_network',
			error: 'Switch your wallet to RSK Testnet before continuing.'
		});
	});

	it('surfaces insufficient-funds errors before transaction submission', async () => {
		const { preflightServiceContractCreation } = await import(
			'$lib/utils/service-contract/preflight'
		);
		mockInitContract.mockResolvedValueOnce({
			contract: {
				createPaymentContract: {
					estimateGas: vi.fn().mockResolvedValue(21000n)
				}
			},
			wallet: {
				address: '0x1111111111111111111111111111111111111111'
			},
			provider: {
				getNetwork: vi.fn().mockResolvedValue({ chainId: 31n }),
				getFeeData: vi.fn().mockResolvedValue({ gasPrice: 1_000_000_000n }),
				getBalance: vi.fn().mockResolvedValue(1_000n)
			}
		});

		const result = await preflightServiceContractCreation(
			{
				freelancerAddress: '0x2222222222222222222222222222222222222222',
				freelancerPubkey: 'b'.repeat(64),
				amountUsdt: '125.00',
				estimatedStartTime: 1_800_000_000,
				estimatedCompletionTime: 1_800_086_400
			},
			100000
		);

		expect(result.ok).toBe(false);
		if (result.ok) {
			throw new Error('Expected insufficient-funds preflight failure.');
		}
		expect(result.errorCode).toBe('insufficient_funds');
		expect(result.error).toContain('Insufficient balance.');
	});

	it('maps unexpected preflight failures through the shared contract error handler', async () => {
		const { preflightServiceContractCreation } = await import(
			'$lib/utils/service-contract/preflight'
		);
		mockInitContract.mockRejectedValueOnce(new Error('provider unavailable'));

		await expect(
			preflightServiceContractCreation(
				{
					freelancerAddress: '0x2222222222222222222222222222222222222222',
					freelancerPubkey: 'b'.repeat(64),
					amountUsdt: '125.00',
					estimatedStartTime: 1_800_000_000,
					estimatedCompletionTime: 1_800_086_400
				},
				100000
			)
		).resolves.toEqual({
			ok: false,
			errorCode: 'preflight_failed',
			error: 'provider unavailable'
		});
		expect(mockExtractContractError).toHaveBeenCalled();
	});

	it('fails closed when the provider pubkey is invalid', async () => {
		const { preflightServiceContractCreation } = await import(
			'$lib/utils/service-contract/preflight'
		);

		await expect(
			preflightServiceContractCreation(
				{
					freelancerAddress: '0x2222222222222222222222222222222222222222',
					freelancerPubkey: 'not-a-pubkey',
					amountUsdt: '125.00',
					estimatedStartTime: 1_800_000_000,
					estimatedCompletionTime: 1_800_086_400
				},
				100000
			)
		).resolves.toEqual({
			ok: false,
			errorCode: 'invalid_provider_pubkey',
			error: 'Provider public key is unavailable for this service.'
		});
	});

	it('fails closed when Nostr signing is unavailable before funding', async () => {
		const { preflightServiceContractCreation } = await import(
			'$lib/utils/service-contract/preflight'
		);
		mockGetNostrKeyPair.mockRejectedValueOnce(new Error('No biometric data found'));

		await expect(
			preflightServiceContractCreation(
				{
					freelancerAddress: '0x2222222222222222222222222222222222222222',
					freelancerPubkey: 'b'.repeat(64),
					amountUsdt: '125.00',
					estimatedStartTime: 1_800_000_000,
					estimatedCompletionTime: 1_800_086_400
				},
				100000
			)
		).resolves.toEqual({
			ok: false,
			errorCode: 'nostr_not_ready',
			error: 'No biometric data found'
		});
		expect(mockInitContract).not.toHaveBeenCalled();
	});
});
