import { describe, it, expect, vi } from 'vitest';
import { RestrictedSigner, RestrictedSignerError } from '$lib/services/restricted-signer';
import type { TypedDataDomain, TypedDataField } from 'ethers';

// ---------------------------------------------------------------------------
// Mock ethers Wallet and AbstractSigner
// ---------------------------------------------------------------------------

interface MockWallet {
	getAddress: ReturnType<typeof vi.fn>;
	connect: ReturnType<typeof vi.fn>;
	signTypedData: ReturnType<typeof vi.fn>;
}

function createMockWallet(): MockWallet {
	const wallet: MockWallet = {
		getAddress: vi.fn().mockResolvedValue('0x1234567890abcdef1234567890abcdef12345678'),
		connect: vi.fn().mockImplementation((_provider: unknown) => createMockWallet()),
		signTypedData: vi
			.fn()
			.mockResolvedValue(
				'0xMockSignature000000000000000000000000000000000000000000000000000000000000'
			)
	};
	return wallet;
}

describe('RestrictedSigner', () => {
	const DELEGATION_CONTRACT = '0xDelegationContractAddress00000000000000000000';
	const CHAIN_ID = 56n;
	const USER_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678';

	describe('constructor', () => {
		it('creates instance with valid parameters', () => {
			const wallet = createMockWallet();
			const signer = new RestrictedSigner(
				wallet as unknown as never,
				CHAIN_ID,
				DELEGATION_CONTRACT
			);
			expect(signer).toBeInstanceOf(RestrictedSigner);
		});

		it('throws when expectedChainId is negative', () => {
			const wallet = createMockWallet();
			expect(
				() => new RestrictedSigner(wallet as unknown as never, -1n, DELEGATION_CONTRACT)
			).toThrow(RestrictedSignerError);
		});

		it('throws with correct error code for negative chain ID', () => {
			const wallet = createMockWallet();
			try {
				new RestrictedSigner(wallet as unknown as never, -1n, DELEGATION_CONTRACT);
				expect.unreachable('Should have thrown');
			} catch (e) {
				expect(e).toBeInstanceOf(RestrictedSignerError);
				expect((e as RestrictedSignerError).code).toBe('RESTRICTED_SIGNER_REJECTED');
			}
		});

		it('throws when delegationContractAddress is empty', () => {
			const wallet = createMockWallet();
			expect(() => new RestrictedSigner(wallet as unknown as never, CHAIN_ID, '')).toThrow(
				RestrictedSignerError
			);
		});

		it('normalizes delegation contract address to lowercase', () => {
			const wallet = createMockWallet();
			const mixedCase = '0xDelegationContractAddress00000000000000000000';
			const signer = new RestrictedSigner(wallet as unknown as never, CHAIN_ID, mixedCase);
			expect(signer.getDelegationContractAddress()).toBe(mixedCase.toLowerCase());
		});
	});

	describe('getAddress', () => {
		it('returns the wallet address', async () => {
			const wallet = createMockWallet();
			const signer = new RestrictedSigner(
				wallet as unknown as never,
				CHAIN_ID,
				DELEGATION_CONTRACT
			);
			const address = await signer.getAddress();
			expect(address).toBe(USER_ADDRESS);
			expect(wallet.getAddress).toHaveBeenCalledOnce();
		});
	});

	describe('getExpectedChainId', () => {
		it('returns the chain ID passed to constructor', () => {
			const wallet = createMockWallet();
			const signer = new RestrictedSigner(
				wallet as unknown as never,
				CHAIN_ID,
				DELEGATION_CONTRACT
			);
			expect(signer.getExpectedChainId()).toBe(CHAIN_ID);
		});
	});

	describe('getDelegationContractAddress', () => {
		it('returns the delegation contract address', () => {
			const wallet = createMockWallet();
			const signer = new RestrictedSigner(
				wallet as unknown as never,
				CHAIN_ID,
				DELEGATION_CONTRACT
			);
			expect(signer.getDelegationContractAddress()).toBe(DELEGATION_CONTRACT.toLowerCase());
		});
	});

	describe('connect', () => {
		it('returns a new RestrictedSigner instance', () => {
			const wallet = createMockWallet();
			const signer = new RestrictedSigner(
				wallet as unknown as never,
				CHAIN_ID,
				DELEGATION_CONTRACT
			);
			const connected = signer.connect(null);

			expect(connected).toBeInstanceOf(RestrictedSigner);
			expect(connected).not.toBe(signer);
		});

		it('preserves chain ID after connect', () => {
			const wallet = createMockWallet();
			const signer = new RestrictedSigner(
				wallet as unknown as never,
				CHAIN_ID,
				DELEGATION_CONTRACT
			);
			const connected = signer.connect(null);
			expect(connected.getExpectedChainId()).toBe(CHAIN_ID);
		});

		it('preserves delegation contract address after connect', () => {
			const wallet = createMockWallet();
			const signer = new RestrictedSigner(
				wallet as unknown as never,
				CHAIN_ID,
				DELEGATION_CONTRACT
			);
			const connected = signer.connect(null);
			expect(connected.getDelegationContractAddress()).toBe(DELEGATION_CONTRACT.toLowerCase());
		});

		it('delegates to wallet.connect', () => {
			const wallet = createMockWallet();
			const signer = new RestrictedSigner(
				wallet as unknown as never,
				CHAIN_ID,
				DELEGATION_CONTRACT
			);
			signer.connect(null);
			expect(wallet.connect).toHaveBeenCalledWith(null);
		});
	});

	describe('signMessage', () => {
		it('throws RestrictedSignerError with correct message', async () => {
			const wallet = createMockWallet();
			const signer = new RestrictedSigner(
				wallet as unknown as never,
				CHAIN_ID,
				DELEGATION_CONTRACT
			);

			await expect(signer.signMessage('hello')).rejects.toThrow(RestrictedSignerError);
			await expect(signer.signMessage('hello')).rejects.toThrow('signMessage is not permitted');
		});

		it('throws RestrictedSignerError for Uint8Array message', async () => {
			const wallet = createMockWallet();
			const signer = new RestrictedSigner(
				wallet as unknown as never,
				CHAIN_ID,
				DELEGATION_CONTRACT
			);

			await expect(signer.signMessage(new Uint8Array([1, 2, 3]))).rejects.toThrow(
				RestrictedSignerError
			);
		});

		it('throws with REJECTED error code', async () => {
			const wallet = createMockWallet();
			const signer = new RestrictedSigner(
				wallet as unknown as never,
				CHAIN_ID,
				DELEGATION_CONTRACT
			);

			try {
				await signer.signMessage('test');
				expect.unreachable('Should have thrown');
			} catch (e) {
				expect((e as RestrictedSignerError).code).toBe('RESTRICTED_SIGNER_REJECTED');
			}
		});

		it('never delegates to underlying wallet signMessage', async () => {
			const wallet = createMockWallet();
			const signer = new RestrictedSigner(
				wallet as unknown as never,
				CHAIN_ID,
				DELEGATION_CONTRACT
			);

			// Add signMessage to the mock wallet to verify it's never called
			const walletSignMessage = vi.fn();
			(wallet as unknown as Record<string, unknown>).signMessage = walletSignMessage;

			await expect(signer.signMessage('test')).rejects.toThrow(RestrictedSignerError);
			expect(walletSignMessage).not.toHaveBeenCalled();
		});
	});

	describe('signTransaction', () => {
		it('throws RestrictedSignerError with correct message', async () => {
			const wallet = createMockWallet();
			const signer = new RestrictedSigner(
				wallet as unknown as never,
				CHAIN_ID,
				DELEGATION_CONTRACT
			);

			await expect(signer.signTransaction({})).rejects.toThrow(RestrictedSignerError);
			await expect(signer.signTransaction({})).rejects.toThrow('signTransaction is not permitted');
		});

		it('throws with REJECTED error code', async () => {
			const wallet = createMockWallet();
			const signer = new RestrictedSigner(
				wallet as unknown as never,
				CHAIN_ID,
				DELEGATION_CONTRACT
			);

			try {
				await signer.signTransaction({ to: '0x123' });
				expect.unreachable('Should have thrown');
			} catch (e) {
				expect((e as RestrictedSignerError).code).toBe('RESTRICTED_SIGNER_REJECTED');
			}
		});

		it('never delegates to underlying wallet signTransaction', async () => {
			const wallet = createMockWallet();
			const signer = new RestrictedSigner(
				wallet as unknown as never,
				CHAIN_ID,
				DELEGATION_CONTRACT
			);

			const walletSignTx = vi.fn();
			(wallet as unknown as Record<string, unknown>).signTransaction = walletSignTx;

			await expect(signer.signTransaction({})).rejects.toThrow(RestrictedSignerError);
			expect(walletSignTx).not.toHaveBeenCalled();
		});
	});

	describe('signTypedData', () => {
		it('signs with valid domain and matching chain ID', async () => {
			const wallet = createMockWallet();
			const signer = new RestrictedSigner(
				wallet as unknown as never,
				CHAIN_ID,
				DELEGATION_CONTRACT
			);
			const domain: TypedDataDomain = { chainId: CHAIN_ID, name: 'Test', version: '1' };
			const types: Record<string, TypedDataField[]> = {
				Authorization: [{ name: 'nonce', type: 'uint256' }]
			};
			const value = { nonce: 1n };

			const signature = await signer.signTypedData(domain, types, value);
			expect(signature).toBeTruthy();
			expect(wallet.signTypedData).toHaveBeenCalledWith(domain, types, value);
		});

		it('rejects mismatched chain ID', async () => {
			const wallet = createMockWallet();
			const signer = new RestrictedSigner(
				wallet as unknown as never,
				CHAIN_ID,
				DELEGATION_CONTRACT
			);
			const domain: TypedDataDomain = { chainId: 1n, name: 'Wrong Chain' };
			const types: Record<string, TypedDataField[]> = {
				Authorization: [{ name: 'nonce', type: 'uint256' }]
			};
			const value = { nonce: 1n };

			await expect(signer.signTypedData(domain, types, value)).rejects.toThrow(
				RestrictedSignerError
			);
			await expect(signer.signTypedData(domain, types, value)).rejects.toThrow('Chain ID mismatch');
		});

		it('rejects with CHAIN_ID_MISMATCH error code', async () => {
			const wallet = createMockWallet();
			const signer = new RestrictedSigner(
				wallet as unknown as never,
				CHAIN_ID,
				DELEGATION_CONTRACT
			);
			const domain: TypedDataDomain = { chainId: 1n };

			try {
				await signer.signTypedData(domain, {}, { nonce: 1n });
				expect.unreachable('Should have thrown');
			} catch (e) {
				expect((e as RestrictedSignerError).code).toBe('RESTRICTED_SIGNER_CHAIN_ID_MISMATCH');
			}
		});

		it('rejects missing chainId in domain', async () => {
			const wallet = createMockWallet();
			const signer = new RestrictedSigner(
				wallet as unknown as never,
				CHAIN_ID,
				DELEGATION_CONTRACT
			);
			const domain: TypedDataDomain = {};

			await expect(signer.signTypedData(domain, {}, { nonce: 1n })).rejects.toThrow(
				'chainId is missing'
			);
		});

		it('rejects invalid nonce (undefined)', async () => {
			const wallet = createMockWallet();
			const signer = new RestrictedSigner(
				wallet as unknown as never,
				CHAIN_ID,
				DELEGATION_CONTRACT
			);
			const domain: TypedDataDomain = { chainId: CHAIN_ID };

			await expect(signer.signTypedData(domain, {}, { something: 'else' })).rejects.toThrow(
				RestrictedSignerError
			);
		});

		it('rejects invalid nonce (negative bigint)', async () => {
			const wallet = createMockWallet();
			const signer = new RestrictedSigner(
				wallet as unknown as never,
				CHAIN_ID,
				DELEGATION_CONTRACT
			);
			const domain: TypedDataDomain = { chainId: CHAIN_ID };

			await expect(signer.signTypedData(domain, {}, { nonce: -1n })).rejects.toThrow(
				RestrictedSignerError
			);
		});

		it('rejects invalid nonce (exceeds maximum)', async () => {
			const wallet = createMockWallet();
			const signer = new RestrictedSigner(
				wallet as unknown as never,
				CHAIN_ID,
				DELEGATION_CONTRACT
			);
			const domain: TypedDataDomain = { chainId: CHAIN_ID };

			await expect(signer.signTypedData(domain, {}, { nonce: 1_000_000_001n })).rejects.toThrow(
				RestrictedSignerError
			);
		});

		it('rejects with INVALID_NONCE error code', async () => {
			const wallet = createMockWallet();
			const signer = new RestrictedSigner(
				wallet as unknown as never,
				CHAIN_ID,
				DELEGATION_CONTRACT
			);
			const domain: TypedDataDomain = { chainId: CHAIN_ID };

			try {
				await signer.signTypedData(domain, {}, { nonce: -1n });
				expect.unreachable('Should have thrown');
			} catch (e) {
				expect((e as RestrictedSignerError).code).toBe('RESTRICTED_SIGNER_INVALID_NONCE');
			}
		});

		it('accepts nonce as a number type', async () => {
			const wallet = createMockWallet();
			const signer = new RestrictedSigner(
				wallet as unknown as never,
				CHAIN_ID,
				DELEGATION_CONTRACT
			);
			const domain: TypedDataDomain = { chainId: CHAIN_ID };
			const types: Record<string, TypedDataField[]> = {
				Authorization: [{ name: 'nonce', type: 'uint256' }]
			};
			const value = { nonce: 42 };

			const signature = await signer.signTypedData(domain, types, value);
			expect(signature).toBeTruthy();
		});

		it('rejects nonce as string type', async () => {
			const wallet = createMockWallet();
			const signer = new RestrictedSigner(
				wallet as unknown as never,
				CHAIN_ID,
				DELEGATION_CONTRACT
			);
			const domain: TypedDataDomain = { chainId: CHAIN_ID };

			await expect(signer.signTypedData(domain, {}, { nonce: '42' })).rejects.toThrow(
				RestrictedSignerError
			);
		});

		it('delegates to wallet signTypedData only after validation passes', async () => {
			const wallet = createMockWallet();
			const signer = new RestrictedSigner(
				wallet as unknown as never,
				CHAIN_ID,
				DELEGATION_CONTRACT
			);
			const domain: TypedDataDomain = { chainId: CHAIN_ID };
			const value = { nonce: 1n };

			// First call should fail - invalid domain chain ID
			await expect(signer.signTypedData({ chainId: 1n }, {}, value)).rejects.toThrow(
				RestrictedSignerError
			);
			expect(wallet.signTypedData).not.toHaveBeenCalled();

			// Second call should succeed
			await signer.signTypedData(domain, {}, value);
			expect(wallet.signTypedData).toHaveBeenCalledTimes(1);
		});

		it('validates nonce before delegating', async () => {
			const wallet = createMockWallet();
			const signer = new RestrictedSigner(
				wallet as unknown as never,
				CHAIN_ID,
				DELEGATION_CONTRACT
			);
			const domain: TypedDataDomain = { chainId: CHAIN_ID };

			await expect(signer.signTypedData(domain, {}, { nonce: -5n })).rejects.toThrow(
				RestrictedSignerError
			);
			expect(wallet.signTypedData).not.toHaveBeenCalled();
		});

		describe('delegation address validation', () => {
			it('passes when value has matching delegation address', async () => {
				const wallet = createMockWallet();
				const signer = new RestrictedSigner(
					wallet as unknown as never,
					CHAIN_ID,
					'0xabcd1234abcd1234abcd1234abcd1234abcd1234'
				);
				const domain: TypedDataDomain = { chainId: CHAIN_ID };
				const value = {
					nonce: 1n,
					delegateTo: '0xabcd1234abcd1234abcd1234abcd1234abcd1234'
				};

				const sig = await signer.signTypedData(domain, {}, value);
				expect(sig).toBeTruthy();
			});

			it('passes when value has zero address delegation', async () => {
				const wallet = createMockWallet();
				const signer = new RestrictedSigner(
					wallet as unknown as never,
					CHAIN_ID,
					'0xDelegationContract'
				);
				const domain: TypedDataDomain = { chainId: CHAIN_ID };
				const value = {
					nonce: 1n,
					delegateTo: '0x0000000000000000000000000000000000000000'
				};

				const sig = await signer.signTypedData(domain, {}, value);
				expect(sig).toBeTruthy();
			});

			it('rejects when value has different delegation address', async () => {
				const wallet = createMockWallet();
				const signer = new RestrictedSigner(
					wallet as unknown as never,
					CHAIN_ID,
					'0xExpectedDelegation0000000000000000000000000'
				);
				const domain: TypedDataDomain = { chainId: CHAIN_ID };
				const value = {
					nonce: 1n,
					delegateTo: '0xWrongDelegationContract0000000000000000000'
				};

				await expect(signer.signTypedData(domain, {}, value)).rejects.toThrow(
					RestrictedSignerError
				);
				await expect(signer.signTypedData(domain, {}, value)).rejects.toThrow(
					'Delegation contract mismatch'
				);
			});

			it('rejects with DELEGATION_MISMATCH error code', async () => {
				const wallet = createMockWallet();
				const signer = new RestrictedSigner(
					wallet as unknown as never,
					CHAIN_ID,
					'0xExpectedDelegation'
				);
				const domain: TypedDataDomain = { chainId: CHAIN_ID };

				try {
					await signer.signTypedData(
						domain,
						{},
						{
							nonce: 1n,
							delegateTo: '0xWrongDelegation'
						}
					);
					expect.unreachable('Should have thrown');
				} catch (e) {
					expect((e as RestrictedSignerError).code).toBe('RESTRICTED_SIGNER_DELEGATION_MISMATCH');
				}
			});

			it('skips delegation check for sender/from/to fields', async () => {
				const wallet = createMockWallet();
				const signer = new RestrictedSigner(
					wallet as unknown as never,
					CHAIN_ID,
					'0xExpectedDelegation'
				);
				const domain: TypedDataDomain = { chainId: CHAIN_ID };
				const value = {
					nonce: 1n,
					sender: '0xDifferentAddress',
					from: '0xDifferentAddress',
					to: '0xDifferentAddress'
				};

				const sig = await signer.signTypedData(domain, {}, value);
				expect(sig).toBeTruthy();
			});

			it('passes when value has no address-like fields', async () => {
				const wallet = createMockWallet();
				const signer = new RestrictedSigner(
					wallet as unknown as never,
					CHAIN_ID,
					'0xExpectedDelegation'
				);
				const domain: TypedDataDomain = { chainId: CHAIN_ID };
				const value = { nonce: 1n, someField: 'hello', anotherField: 123 };

				const sig = await signer.signTypedData(domain, {}, value);
				expect(sig).toBeTruthy();
			});
		});
	});

	describe('private key security', () => {
		it('does not expose the underlying wallet via public API', () => {
			const wallet = createMockWallet();
			const signer = new RestrictedSigner(
				wallet as unknown as never,
				CHAIN_ID,
				DELEGATION_CONTRACT
			);

			const publicKeys = Object.getOwnPropertyNames(Object.getPrototypeOf(signer));
			expect(publicKeys).not.toContain('wallet');
			expect(publicKeys).not.toContain('privateKey');
			expect(publicKeys).not.toContain('_wallet');
		});

		it('never exposes wallet address except through getAddress()', () => {
			const wallet = createMockWallet();
			const signer = new RestrictedSigner(
				wallet as unknown as never,
				CHAIN_ID,
				DELEGATION_CONTRACT
			);

			const prototypeDescriptors = Object.getOwnPropertyDescriptors(Object.getPrototypeOf(signer));
			const addressGetters = Object.keys(prototypeDescriptors).filter(
				(key) => typeof prototypeDescriptors[key]?.get === 'function'
			);
			// The only property-like access should be getAddress() as an async method
			expect(addressGetters).toHaveLength(0);
		});

		it('does not allow access to #wallet via bracket notation', () => {
			const wallet = createMockWallet();
			const signer = new RestrictedSigner(
				wallet as unknown as never,
				CHAIN_ID,
				DELEGATION_CONTRACT
			);

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			expect((signer as any).wallet).toBeUndefined();
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			expect((signer as any).privateKey).toBeUndefined();
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			expect((signer as any).signingKey).toBeUndefined();
		});
	});
});
