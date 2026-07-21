// =============================================================================
// Gasless Store — Unified wallet store + API helpers for gasless transfers
// =============================================================================
// Merged from src/wallet/gasless-store.ts (store + programmatic API) and
// src/lib/wallet/gasless-store.ts (UI-facing API + EIP-7702 helpers).
//
// Calls the NestJS main backend via gaslessService (axios-based).
// Auth is handled automatically by the axios interceptor — no JWT parameter
// needed. Backend endpoints:
//   POST /gasless/estimate  → { token, amount, recipient }
//   POST /gasless/relay     → { sender, userOp: SerializableUserOperation }

import { writable, derived, get } from 'svelte/store';
import { ethers as ethersLib } from 'ethers';
import { addBreadcrumb } from '@sentry/sveltekit';
import type {
	EIP7702Auth,
	FeeEstimate,
	SerializableUserOperation,
	UserOperation
} from '../../types/gasless.types';
import {
	GAS_TREASURY,
	GAS_BOUNDS,
	ENTRY_POINT_ADDRESS,
	ARBITRUM_RPC_URL,
	ARBITRUM_CHAIN_ID,
	SIMPLE_7702_ACCOUNT_IMPL
} from './gasless.config';
import { gaslessService, type RelayRequest } from '$lib/api/services/gasless.service';
import {
	validateFeeParameters,
	validateFeeBufferBounds,
	validateFeeRecipient
} from './gasless-helpers';

// =============================================================================
// SmartAccount — typed interface for the EIP-7702 account from permissionless
// =============================================================================

/** The EIP-7702 smart account object created by permissionless/accounts. */
export interface SmartAccount {
	address: string;
	signUserOperation: (userOp: {
		sender: string;
		nonce: bigint;
		callData: string;
		callGasLimit: bigint;
		verificationGasLimit: bigint;
		preVerificationGas: bigint;
		maxFeePerGas: bigint;
		maxPriorityFeePerGas: bigint;
		paymasterAndData: string;
		signature: string;
		/** EIP-7702 factory sentinel for first-time delegations */
		factory?: string;
		/** EIP-7702 initialization data */
		factoryData?: string;
	}) => Promise<UserOperation | string>;
	getNonce: () => Promise<bigint>;
}

// =============================================================================
// Ethers.js Interface singletons — used for ABI encoding (replaces viem encodeFunctionData)
// ethers produces properly even-length hex, unlike viem which can strip leading zeros
// =============================================================================

const ethersTransferIface = new ethersLib.Interface([
	'function transfer(address to, uint256 amount) returns (bool)'
]);

const ethersExecuteBatchIface = new ethersLib.Interface([
	'function executeBatch((address target, uint256 value, bytes data)[] calls)'
]);

// =============================================================================
// EIP-7702 constants
// =============================================================================

/** Normalize a hex string to even-length hex (ethers v6 BytesLike requirement). */
function normalizeHex(hex: string): string {
	if (!hex || hex === '0x') return hex;
	const raw = hex.startsWith('0x') ? hex.slice(2) : hex;
	if (raw.length % 2 !== 0) {
		return '0x0' + raw;
	}
	return hex;
}

/** Convert a bigint to a `0x`-prefixed hex string for JSON transport. Always even-length. */
function toHex(value: bigint): string {
	const hex = value.toString(16);
	return '0x' + (hex.length % 2 !== 0 ? '0' + hex : hex);
}

/** Shared ethers JsonRpcProvider for Arbitrum read operations */
function getArbitrumProvider(): ethersLib.JsonRpcProvider {
	return new ethersLib.JsonRpcProvider(ARBITRUM_RPC_URL || undefined);
}

/** EIP-7702 factory sentinel — tells EntryPoint the sender is a 7702-delegated EOA */
const EIP7702_FACTORY = '0x7702000000000000000000000000000000000000' as const;

/** Gas cost of applying an EIP-7702 authorization (ERC-4337 spec §Support for EIP-7702) */
const PER_EMPTY_ACCOUNT_COST = 25_000n;

// =============================================================================
// Writable store — single source of truth for gasless wallet state
// =============================================================================

interface GaslessWalletState {
	address: string | null;
	ready: boolean;
	loading: boolean;
	error: string | null;
	/** The EIP-7702 smart account object (null until init). Exposes signUserOperation() and getNonce(). */
	account: SmartAccount | null;
	/** Raw owner private key — needed for EIP-7702 authorization signing */
	ownerKey: `0x${string}` | null;
}

function createGaslessStore() {
	const { subscribe, update, set } = writable<GaslessWalletState>({
		address: null,
		ready: false,
		loading: false,
		error: null,
		account: null,
		ownerKey: null
	});
	return {
		subscribe,
		async init(privateKey: `0x${string}`): Promise<string> {
			update((s) => ({ ...s, loading: true, error: null }));
			try {
				const [
					{ to7702SimpleSmartAccount },
					{ privateKeyToAccount },
					{ createPublicClient, http },
					{ arbitrum }
				] = await Promise.all([
					import('permissionless/accounts'),
					import('viem/accounts'),
					import('viem'),
					import('viem/chains')
				]);
				const publicClient = createPublicClient({
					chain: arbitrum,
					transport: http(ARBITRUM_RPC_URL || undefined)
				});
				const signer = privateKeyToAccount(privateKey);
				const account = await to7702SimpleSmartAccount({ client: publicClient, owner: signer });
				update((s) => ({
					...s,
					address: account.address,
					ready: true,
					loading: false,
					account: account as unknown as SmartAccount,
					ownerKey: privateKey
				}));
				return account.address;
			} catch (e) {
				const msg = e instanceof Error ? e.message : 'Failed to initialize wallet';
				update((s) => ({ ...s, loading: false, error: msg }));
				throw e;
			}
		},
		reset(): void {
			set({
				address: null,
				ready: false,
				loading: false,
				error: null,
				account: null,
				ownerKey: null
			});
		}
	};
}

export const gaslessWallet = createGaslessStore();
export const gaslessAddress = derived(gaslessWallet, ($w) => $w.address);
export const gaslessReady = derived(gaslessWallet, ($w) => $w.ready);
export const gaslessAccount = derived(gaslessWallet, ($w) => $w.account);
export const gaslessLoading = derived(gaslessWallet, ($w) => $w.loading);
export const gaslessError = derived(gaslessWallet, ($w) => $w.error);
export const gaslessOwnerKey = derived(gaslessWallet, ($w) => $w.ownerKey);

// =============================================================================
// Wallet state — public aliases for component-level access
// =============================================================================

export const walletState = gaslessWallet;
export const walletAddress = gaslessAddress;
export const walletReady = gaslessReady;
export const walletLoading = gaslessLoading;
export const walletError = gaslessError;

/** Convenience alias for component-level init. */
export async function initWallet(privateKey: `0x${string}`): Promise<string> {
	return gaslessWallet.init(privateKey);
}

/** Convenience alias for component-level reset. */
export function resetWallet(): void {
	gaslessWallet.reset();
}

// =============================================================================
// EIP-7702 delegation signing (shared helper)
// =============================================================================

/**
 * Check if the sender needs EIP-7702 delegation and sign the authorization if so.
 *
 * Returns `undefined` if the account is already delegated (has code on-chain).
 * Returns `{ eip7702Auth, factory, extraPreVerificationGas }` if this is the
 * first transaction and delegation is needed.
 *
 * @param sender - The EOA address to check
 * @param provider - ethers JsonRpcProvider for getCode / getTransactionCount
 * @returns Delegation data or undefined
 */
async function signEip7702AuthIfNeeded(
	sender: string,
	provider: ethersLib.JsonRpcProvider
): Promise<
	| {
			eip7702Auth: EIP7702Auth;
			factory: string;
			extraPreVerificationGas: bigint;
	  }
	| undefined
> {
	const existingCode = await provider.getCode(sender);
	const isDelegated = existingCode && existingCode !== '0x' && existingCode.length > 2;
	if (isDelegated) {
		// EIP-7702 delegation code format: 0xef0100 + 20-byte delegate address
		const delegationTarget = '0x' + existingCode.slice(8).toLowerCase();
		if (delegationTarget === SIMPLE_7702_ACCOUNT_IMPL.toLowerCase()) {
			return undefined;
		}
		// Delegation target mismatch (old implementation) — re-delegate
	}

	const ownerKey = get(gaslessOwnerKey);
	if (!ownerKey) {
		throw new Error('Owner private key not available — cannot sign EIP-7702 authorization');
	}

	const { ethers } = await import('ethers');

	const eoaNonce = await provider.getTransactionCount(sender);

	// EIP-7702 authorization hash: keccak256(0x05 || rlp([chain_id, address, nonce]))
	// Uses ethers.js encoding — matches backend recoverEIP7702Signer exactly.
	// CRITICAL: nonce=0 must encode as empty bytes (0x → RLP 0x80), NOT 0x00.
	const chainIdHex = ethers.toBeHex(BigInt(ARBITRUM_CHAIN_ID));
	const nonceHex = eoaNonce === 0 ? '0x' : ethers.toBeHex(eoaNonce);

	const rlpEncoded = ethers.encodeRlp([chainIdHex, SIMPLE_7702_ACCOUNT_IMPL, nonceHex]);
	const authHash = ethers.keccak256(ethers.concat(['0x05', rlpEncoded]));

	// Sign the authorization hash using SigningKey (raw hash signing, no EIP-191 prefix)
	const signingKey = new ethers.SigningKey(ownerKey);
	const sig = signingKey.sign(authHash);

	const r = sig.r as `0x${string}`;
	const s = sig.s as `0x${string}`;
	const v = '0x' + sig.v.toString(16);

	return {
		eip7702Auth: {
			chainId: '0x' + BigInt(ARBITRUM_CHAIN_ID).toString(16),
			address: SIMPLE_7702_ACCOUNT_IMPL,
			nonce: '0x' + BigInt(eoaNonce).toString(16),
			r,
			s,
			v
		},
		factory: EIP7702_FACTORY,
		extraPreVerificationGas: PER_EMPTY_ACCOUNT_COST
	};
}

// =============================================================================
// API helpers — now delegated to gaslessService (axios-based)
// =============================================================================

// =============================================================================
// Build executeBatch callData (programmatic — arbitrary batch calls)
// =============================================================================

/**
 * Build executeBatch callData from arbitrary calls + fee buffer transfer.
 *
 * PROGRAMMATIC API — accepts a `calls[]` array for full batch flexibility.
 * For simple single-token transfers in UI components, use `sendToken()` instead.
 *
 * @param calls - Array of contract calls: `{ to, data, value? }`
 * @param feeTokenAddress - Token address used for the fee buffer transfer
 * @param feeBufferAmount - Fee buffer amount in token's smallest unit
 * @returns ABI-encoded callData for executeBatch
 */
export function buildExecuteBatchCallData(
	calls: Array<{ to: string; data: string; value?: bigint }>,
	feeTokenAddress: string,
	feeBufferAmount: bigint
): `0x${string}` {
	if (calls.length === 0) throw new Error('At least one user call is required');
	const batchCalls: Array<{ to: string; value: bigint; data: string }> = calls.map((c) => ({
		to: c.to,
		value: c.value ?? 0n,
		data: normalizeHex(c.data)
	}));
	batchCalls.push({
		to: feeTokenAddress,
		value: 0n,
		data: ethersTransferIface.encodeFunctionData('transfer', [GAS_TREASURY, feeBufferAmount])
	});
	return ethersExecuteBatchIface.encodeFunctionData('executeBatch', [
		batchCalls.map((c) => [c.to, c.value, c.data])
	]) as `0x${string}`;
}

// =============================================================================
// Send gasless transaction (PROGRAMMATIC API)
//
// Lower-level API that accepts arbitrary batch calls and an explicit
// smartAccount parameter. For UI components doing single token transfers,
// prefer `sendToken()` which reads wallet state internally.
// =============================================================================

export async function sendGasless(
	calls: Array<{ to: string; data: string; value?: bigint }>,
	feeBufferToken: string,
	feeBufferAmount: bigint,
	estimatedGas: { callGasLimit: bigint; verificationGasLimit: bigint; preVerificationGas: bigint },
	smartAccount: Pick<SmartAccount, 'signUserOperation'>
): Promise<string> {
	const state = get(gaslessWallet);
	if (!state.ready || !state.address) throw new Error('Wallet not initialized');

	// Validate inputs BEFORE constructing callData (defense-in-depth)
	validateFeeBufferBounds(feeBufferToken, feeBufferAmount);
	validateFeeRecipient(GAS_TREASURY);
	const callData = normalizeHex(buildExecuteBatchCallData(calls, feeBufferToken, feeBufferAmount)) as `0x${string}`;

	// Fetch nonce from EntryPoint contract (key=0 for sequential nonce)
	const provider = getArbitrumProvider();
	const entryPoint = new ethersLib.Contract(ENTRY_POINT_ADDRESS, ['function getNonce(address,uint192) view returns (uint256)'], provider);
	const nonce: bigint = await entryPoint.getNonce(state.address, 0);

	const userOp = {
		sender: state.address,
		nonce,
		callData,
		callGasLimit: estimatedGas.callGasLimit,
		verificationGasLimit: estimatedGas.verificationGasLimit,
		preVerificationGas: estimatedGas.preVerificationGas,
		maxFeePerGas: GAS_BOUNDS.maxFeePerGas,
		maxPriorityFeePerGas: GAS_BOUNDS.maxPriorityFeePerGas,
		paymasterAndData: '0x',
		signature: '0x'
	};
	validateFeeParameters(userOp);

	const signedResult = await smartAccount.signUserOperation(userOp);

	// permissionless may return the signature string directly or a full signed UserOperation
	const signedUserOp = typeof signedResult === 'string'
		? { ...userOp, signature: signedResult }
		: signedResult;

	const serializableOp: SerializableUserOperation = {
		sender: signedUserOp.sender,
		nonce: toHex(signedUserOp.nonce),
		callData: signedUserOp.callData,
		callGasLimit: toHex(signedUserOp.callGasLimit),
		verificationGasLimit: toHex(signedUserOp.verificationGasLimit),
		preVerificationGas: toHex(signedUserOp.preVerificationGas),
		maxFeePerGas: toHex(signedUserOp.maxFeePerGas),
		maxPriorityFeePerGas: toHex(signedUserOp.maxPriorityFeePerGas),
		paymasterAndData: signedUserOp.paymasterAndData,
		signature: (typeof signedResult === 'string' ? signedResult : signedUserOp.signature) || '0x'
	};

	const result = await gaslessService.relay({ sender: state.address, userOp: serializableOp });
	return result.userOpHash;
}

// =============================================================================
// Convenience: simple token transfer (PROGRAMMATIC API)
//
// Wraps sendGasless() with a single ERC-20 transfer call for convenience.
// Requires explicit smartAccount parameter — UI components should use the
// sendToken() function instead which reads wallet state internally.
// =============================================================================

export async function sendTokenProgrammatic(
	token: string,
	recipient: string,
	amount: bigint,
	feeBufferAmount: bigint,
	estimatedGas: { callGasLimit: bigint; verificationGasLimit: bigint; preVerificationGas: bigint },
	smartAccount: Pick<SmartAccount, 'signUserOperation'>
): Promise<string> {
	// Input validation
	if (!token || !recipient) throw new Error('token and recipient are required');
	if (!ethersLib.isAddress(token)) throw new Error('Invalid token address');
	if (!ethersLib.isAddress(recipient)) throw new Error('Invalid recipient address');
	if (amount <= 0n) throw new Error('Amount must be positive');
	if (feeBufferAmount <= 0n) throw new Error('Fee buffer amount must be positive');

	const transferData = ethersTransferIface.encodeFunctionData('transfer', [recipient, amount]);
	return sendGasless(
		[{ to: token, data: transferData }],
		token,
		feeBufferAmount,
		estimatedGas,
		smartAccount
	);
}

// =============================================================================
// Fee estimation (UI-facing — calls relay backend)
// =============================================================================

/**
 * Estimate the fee for a gasless token transfer via the relay API.
 *
 * @param token - Token contract address
 * @param amount - Transfer amount in token's smallest unit (bigint)
 * @param recipient - Recipient address
 * @returns Fee estimate with buffer and cost details
 */
export async function estimateFee(
	token: string,
	amount: bigint,
	recipient: string
): Promise<FeeEstimate> {
	if (!ethersLib.isAddress(token)) throw new Error('Invalid token address');
	if (!ethersLib.isAddress(recipient)) throw new Error('Invalid recipient address');
	if (amount <= 0n) throw new Error('Amount must be positive');

	return gaslessService.estimate({
		token,
		amount: amount.toString(),
		recipient
	});
}

// =============================================================================
// UI-facing sendToken — reads wallet state internally, handles EIP-7702
// =============================================================================

/**
 * Build executeBatch callData for a single token transfer + fee buffer.
 *
 * Used internally by `sendToken()` (UI-facing). For arbitrary batch calls,
 * use `buildExecuteBatchCallData()` instead.
 */
function buildTransferCallData(
	token: string,
	recipient: string,
	amount: bigint,
	feeBuffer: bigint
): `0x${string}` {
	// User's token transfer
	const transferData = ethersTransferIface.encodeFunctionData('transfer', [recipient, amount]);

	// Fee buffer transfer to treasury
	const feeTransferData = ethersTransferIface.encodeFunctionData('transfer', [GAS_TREASURY, feeBuffer]);

	return ethersExecuteBatchIface.encodeFunctionData('executeBatch', [
		[
			[token, 0n, transferData],
			[token, 0n, feeTransferData]
		]
	]) as `0x${string}`;
}

/**
 * Send a gasless token transfer via the relay API. (UI-FACING API)
 *
 * This is the simplified, UI-focused API used by GaslessSendFlow and other
 * Svelte components. It handles the full lifecycle internally:
 *
 * 1. Reads wallet state and smart account from the Svelte store (no need to
 *    pass them as parameters).
 * 2. Encodes executeBatch callData (user transfer + fee buffer to treasury).
 * 3. Fetches nonce from the EntryPoint contract via viem.
 * 4. Constructs and signs the UserOp client-side.
 * 5. Relays to the NestJS backend which submits to the Alto bundler.
 *
 * @param token    - Token contract address
 * @param recipient - Recipient address
 * @param amount    - Transfer amount in token's smallest unit (bigint)
 * @param feeBuffer - Fee buffer amount in token's smallest unit (bigint)
 * @param estimatedGas - Optional gas estimate from fee estimation (decimal strings).
 *                       If omitted, falls back to GAS_BOUNDS max values.
 * @returns UserOp hash from the bundler (hex string)
 */
export async function sendToken(
	token: string,
	recipient: string,
	amount: bigint,
	feeBuffer: bigint,
	estimatedGas?: {
		callGasLimit: string;
		verificationGasLimit: string;
		preVerificationGas: string;
	}
): Promise<string> {
	// Validate inputs
	if (!ethersLib.isAddress(token)) throw new Error('Invalid token address');
	if (!ethersLib.isAddress(recipient)) throw new Error('Invalid recipient address');
	if (amount <= 0n) throw new Error('Amount must be positive');
	if (feeBuffer <= 0n) throw new Error('Fee buffer must be positive');

	const state = get(gaslessWallet);
	if (!state.ready || !state.address) {
		throw new Error('Wallet not initialized — call initWallet() first');
	}
	const sender = state.address;

	// 1. Build executeBatch callData (normalize hex to even-length for ethers v6)
	const callData = normalizeHex(buildTransferCallData(token, recipient, amount, feeBuffer)) as `0x${string}`;

	// 2. Fetch nonce from EntryPoint contract
	const provider = getArbitrumProvider();
	const entryPoint = new ethersLib.Contract(ENTRY_POINT_ADDRESS, ['function getNonce(address,uint192) view returns (uint256)'], provider);

	const nonce: bigint = await entryPoint.getNonce(sender, 0);

	// 3. Use estimated gas if provided, otherwise fall back to max bounds
	const gasLimits = estimatedGas
		? {
				callGasLimit: BigInt(estimatedGas.callGasLimit),
				verificationGasLimit: BigInt(estimatedGas.verificationGasLimit),
				preVerificationGas: BigInt(estimatedGas.preVerificationGas)
			}
		: {
				callGasLimit: GAS_BOUNDS.maxCallGas,
				verificationGasLimit: GAS_BOUNDS.maxVerificationGas,
				preVerificationGas: GAS_BOUNDS.maxPreVerificationGas
			};

	// 3b. Construct UserOp for signing (bigint fields)
	const userOp: UserOperation = {
		sender,
		nonce,
		callData,
		callGasLimit: gasLimits.callGasLimit,
		verificationGasLimit: gasLimits.verificationGasLimit,
		preVerificationGas: gasLimits.preVerificationGas,
		maxFeePerGas: GAS_BOUNDS.maxFeePerGas,
		maxPriorityFeePerGas: GAS_BOUNDS.maxPriorityFeePerGas,
		paymasterAndData: '0x',
		signature: '0x'
	};

	// 3c. EIP-7702 delegation check — shared helper handles signing if needed
	const delegation = await signEip7702AuthIfNeeded(sender, provider);
	let eip7702Auth: EIP7702Auth | undefined;
	if (delegation) {
		eip7702Auth = delegation.eip7702Auth;
		userOp.factory = delegation.factory;
		userOp.preVerificationGas = userOp.preVerificationGas + delegation.extraPreVerificationGas;
	}

	// 3d. Prepare paymaster data — must happen BEFORE signing so the
	// UserOp hash includes the actual paymasterAndData (not '0x').
	// The paymaster signature depends on UserOp fields but NOT on the UserOp signature.
	try {
		const serializableForPrepare: SerializableUserOperation = {
			sender: userOp.sender,
			nonce: toHex(userOp.nonce),
			callData: userOp.callData,
			callGasLimit: toHex(userOp.callGasLimit),
			verificationGasLimit: toHex(userOp.verificationGasLimit),
			preVerificationGas: toHex(userOp.preVerificationGas),
			maxFeePerGas: toHex(userOp.maxFeePerGas),
			maxPriorityFeePerGas: toHex(userOp.maxPriorityFeePerGas),
			paymasterAndData: '0x',
			signature: '0x',
			...(userOp.factory ? { factory: userOp.factory } : {})
		};
		const prepared = await gaslessService.prepare({
			sender,
			userOp: serializableForPrepare,
			...(eip7702Auth ? { eip7702Auth } : {})
		});
		userOp.paymasterAndData = prepared.paymasterAndData;
	} catch (prepareErr) {
		addBreadcrumb({
			category: 'gasless',
			message: `Paymaster prepare failed: ${prepareErr instanceof Error ? prepareErr.message : String(prepareErr)}`,
			level: 'warning',
			data: { sender }
		});
		// Continue without paymaster data — relay will handle it
	}

	// 3e. Sign the UserOp client-side if account is available
	const account = get(gaslessAccount);
	if (account && typeof account.signUserOperation === 'function') {
		const signed = await account.signUserOperation(userOp);
		// permissionless may return the signature string directly or as { signature }
		userOp.signature = (typeof signed === 'string' ? signed : signed.signature) || '0x';
	}

	// 3e. Serialize for JSON transport
	const serializableOp: SerializableUserOperation = {
		sender: userOp.sender,
		nonce: toHex(userOp.nonce),
		callData: userOp.callData,
		callGasLimit: toHex(userOp.callGasLimit),
		verificationGasLimit: toHex(userOp.verificationGasLimit),
		preVerificationGas: toHex(userOp.preVerificationGas),
		maxFeePerGas: toHex(userOp.maxFeePerGas),
		maxPriorityFeePerGas: toHex(userOp.maxPriorityFeePerGas),
		paymasterAndData: userOp.paymasterAndData,
		signature: userOp.signature || '0x',
		// Include factory sentinel for 7702 first-time delegations
		...(userOp.factory ? { factory: userOp.factory } : {})
	};

	// 4. Relay to NestJS backend via gaslessService (auth handled by axios interceptor)
	addBreadcrumb({
		category: 'gasless',
		message: `Relaying UserOp for ${token.slice(0, 10)}...`,
		level: 'info',
		data: { sender, token, recipient, hasEip7702Auth: !!eip7702Auth }
	});

	try {
		const result = await gaslessService.relay({
			sender,
			userOp: serializableOp,
			...(eip7702Auth ? { eip7702Auth } : {})
		});

		addBreadcrumb({
			category: 'gasless',
			message: 'UserOp relayed successfully',
			level: 'info',
			data: { userOpHash: result.userOpHash, sender }
		});
		return result.userOpHash;
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		addBreadcrumb({
			category: 'gasless',
			message: `Relay failed: ${msg}`,
			level: 'error',
			data: { sender }
		});
		throw error;
	}
}

// =============================================================================
// Pre-flight balance check
// =============================================================================

/**
 * Check if the user's on-chain token balance covers transfer + fee buffer.
 *
 * Performs a client-side viem readContract call — no backend endpoint needed.
 *
 * @param tokenAddress - ERC-20 token contract address
 * @param userAddress - User's smart account address
 * @param transferAmount - Transfer amount in token's smallest unit
 * @param feeBufferAmount - Fee buffer amount in token's smallest unit
 * @param rpcUrl - Optional RPC URL override
 * @returns Balance check result
 */
export async function checkSufficientBalance(
	tokenAddress: string,
	userAddress: string,
	transferAmount: bigint,
	feeBufferAmount: bigint,
	rpcUrl?: string
): Promise<{
	sufficient: boolean;
	balance: bigint;
	required: bigint;
}> {
	if (!ethersLib.isAddress(tokenAddress)) throw new Error('Invalid token address');
	if (!ethersLib.isAddress(userAddress)) throw new Error('Invalid user address');
	if (transferAmount < 0n) throw new Error('transferAmount must be non-negative');
	if (feeBufferAmount < 0n) throw new Error('feeBufferAmount must be non-negative');

	const provider = new ethersLib.JsonRpcProvider(rpcUrl || ARBITRUM_RPC_URL || undefined);
	const tokenContract = new ethersLib.Contract(tokenAddress, ['function balanceOf(address) view returns (uint256)'], provider);
	const balance: bigint = await tokenContract.balanceOf(userAddress);

	const required = transferAmount + feeBufferAmount;
	return { sufficient: balance >= required, balance, required };
}

// =============================================================================
// Fallback: Direct ERC-20 transfer (user pays gas in ETH)
// =============================================================================

/**
 * Check if the user has enough ETH on Arbitrum to pay for a direct transaction.
 *
 * @param userAddress - The user's smart account / EOA address
 * @param rpcUrl - Optional RPC URL override
 * @returns ETH balance in wei
 */
export async function checkETHBalance(userAddress: string, rpcUrl?: string): Promise<bigint> {
	if (!ethersLib.isAddress(userAddress)) throw new Error('Invalid user address');

	const provider = new ethersLib.JsonRpcProvider(rpcUrl || ARBITRUM_RPC_URL || undefined);
	return provider.getBalance(userAddress);
}

/**
 * Send a direct ERC-20 transfer on Arbitrum, paying gas in ETH.
 *
 * This is the emergency fallback when the gasless relay is unavailable.
 * Uses the owner's private key (from the wallet store) to sign and send
 * a standard ERC-20 transfer() transaction via viem.
 *
 * @param token - ERC-20 token contract address
 * @param recipient - Recipient address
 * @param amount - Transfer amount in token's smallest unit (bigint)
 * @returns Transaction hash
 */
export async function sendTokenDirect(
	token: string,
	recipient: string,
	amount: bigint
): Promise<string> {
	if (!ethersLib.isAddress(token)) throw new Error('Invalid token address');
	if (!ethersLib.isAddress(recipient)) throw new Error('Invalid recipient address');
	if (amount <= 0n) throw new Error('Amount must be positive');

	const ownerKey = get(gaslessOwnerKey);
	if (!ownerKey) {
		throw new Error('Owner key not available — cannot sign direct transaction');
	}

	const provider = new ethersLib.JsonRpcProvider(ARBITRUM_RPC_URL || undefined);
	const wallet = new ethersLib.Wallet(ownerKey, provider);
	const tokenContract = new ethersLib.Contract(token, ethersTransferIface.fragments, wallet);

	const tx = await tokenContract.transfer(recipient, amount);
	const receipt = await tx.wait();
	return receipt.hash;
}

// =============================================================================
// Gasless arbitrary calls (for swaps, bridges, approvals, etc.)
// =============================================================================

/**
 * Send arbitrary contract calls through the gasless relay.
 *
 * This is the general-purpose gasless function used by swaps, bridges,
 * approvals, and any other multi-step Arbitrum operations. The calls are
 * wrapped in an `executeBatch(Call[])` with a fee buffer transfer appended.
 *
 * @param calls - Array of contract calls: `{ to, data, value? }`
 * @param feeToken - Token address used for the fee buffer (must be in ALLOWED_FEE_TOKENS)
 * @param feeBuffer - Fee buffer amount in token's smallest unit (bigint)
 * @param estimatedGas - Optional gas estimate from fee estimation
 * @returns UserOp hash from the bundler
 */
export async function sendGaslessCalls(
	calls: Array<{ to: string; data: string; value?: bigint }>,
	feeToken?: string,
	feeBuffer?: bigint,
	estimatedGas?: {
		callGasLimit: string;
		verificationGasLimit: string;
		preVerificationGas: string;
	}
): Promise<string> {
	if (calls.length === 0) throw new Error('At least one call is required');

	// Validate fee buffer params early (before wallet check) for clear error messages.
	// When feeToken and feeBuffer are provided, they must be valid.
	if (feeToken && feeBuffer !== undefined) {
		if (!ethersLib.isAddress(feeToken)) {
			throw new Error('Invalid fee token address');
		}
		if (feeBuffer <= 0n) {
			throw new Error('Fee buffer must be positive');
		}
	}

	const state = get(gaslessWallet);
	if (!state.ready || !state.address) {
		throw new Error('Wallet not initialized — call initWallet() first');
	}
	const sender = state.address;

	// Build callData: always use executeBatch with fee buffer.
	// The fee token should be the token the user will receive from the operation
	// (e.g., tBTC when claiming). The claim + fee transfer execute atomically:
	// claim produces tBTC, then fee transfer uses that tBTC.
	if (!feeToken || !feeBuffer || feeBuffer <= 0n) {
		throw new Error(
			'Fee token and fee buffer are required. ' +
			'The fee should use the token being received from the operation ' +
			'(e.g., tBTC when claiming).'
		);
	}

	const normalizedCalls: Array<{ to: string; value: bigint; data: string }> = calls.map((c) => ({
		to: c.to,
		value: c.value ?? 0n,
		data: normalizeHex(c.data)
	}));

	// executeBatch with user calls + fee buffer transfer
	const batchCalls = [...normalizedCalls];
	batchCalls.push({
		to: feeToken,
		value: 0n,
		data: ethersTransferIface.encodeFunctionData('transfer', [GAS_TREASURY, feeBuffer])
	});
	const callData = normalizeHex(
		ethersExecuteBatchIface.encodeFunctionData('executeBatch', [
			batchCalls.map((c) => [c.to, c.value, c.data])
		])
	) as `0x${string}`;

	// Fetch nonce from EntryPoint
	const provider = getArbitrumProvider();
	const entryPoint = new ethersLib.Contract(ENTRY_POINT_ADDRESS, ['function getNonce(address,uint192) view returns (uint256)'], provider);
	const nonce: bigint = await entryPoint.getNonce(sender, 0);

	// Use estimated gas or fall back to max bounds
	const gasLimits = estimatedGas
		? {
				callGasLimit: BigInt(estimatedGas.callGasLimit),
				verificationGasLimit: BigInt(estimatedGas.verificationGasLimit),
				preVerificationGas: BigInt(estimatedGas.preVerificationGas)
			}
		: {
				callGasLimit: GAS_BOUNDS.maxCallGas,
				verificationGasLimit: GAS_BOUNDS.maxVerificationGas,
				preVerificationGas: GAS_BOUNDS.maxPreVerificationGas
			};

	// Construct UserOp
	const userOp: UserOperation = {
		sender,
		nonce,
		callData,
		callGasLimit: gasLimits.callGasLimit,
		verificationGasLimit: gasLimits.verificationGasLimit,
		preVerificationGas: gasLimits.preVerificationGas,
		maxFeePerGas: GAS_BOUNDS.maxFeePerGas,
		maxPriorityFeePerGas: GAS_BOUNDS.maxPriorityFeePerGas,
		paymasterAndData: '0x',
		signature: '0x'
	};

	// EIP-7702 delegation check — shared helper handles signing if needed
	const delegation = await signEip7702AuthIfNeeded(sender, provider);
	let eip7702Auth: EIP7702Auth | undefined;
	if (delegation) {
		eip7702Auth = delegation.eip7702Auth;
		userOp.factory = delegation.factory;
		userOp.preVerificationGas = userOp.preVerificationGas + delegation.extraPreVerificationGas;
	}

	// Prepare paymaster data — must happen BEFORE signing so the
	// UserOp hash includes the actual paymasterAndData (not '0x').
	try {
		const serializableForPrepare: SerializableUserOperation = {
			sender: userOp.sender,
			nonce: toHex(userOp.nonce),
			callData: userOp.callData,
			callGasLimit: toHex(userOp.callGasLimit),
			verificationGasLimit: toHex(userOp.verificationGasLimit),
			preVerificationGas: toHex(userOp.preVerificationGas),
			maxFeePerGas: toHex(userOp.maxFeePerGas),
			maxPriorityFeePerGas: toHex(userOp.maxPriorityFeePerGas),
			paymasterAndData: '0x',
			signature: '0x',
			...(userOp.factory ? { factory: userOp.factory } : {})
		};
		const prepared = await gaslessService.prepare({
			sender,
			userOp: serializableForPrepare,
			...(eip7702Auth ? { eip7702Auth } : {})
		});
		userOp.paymasterAndData = prepared.paymasterAndData;
	} catch (prepareErr) {
		addBreadcrumb({
			category: 'gasless',
			message: `Paymaster prepare failed: ${prepareErr instanceof Error ? prepareErr.message : String(prepareErr)}`,
			level: 'warning',
			data: { sender }
		});
	}

	// Pre-flight simulation: verify the UserOp will succeed on-chain BEFORE
	// signing and submitting. This prevents losing funds in Boltz swaps where
	// the gasless relay fails after funds are already locked.
	// The simulate endpoint calls eth_estimateUserOperationGas on the bundler.
	try {
		const simRequest: RelayRequest = {
			sender,
			userOp: {
				...userOp,
				nonce: toHex(userOp.nonce),
				callGasLimit: toHex(userOp.callGasLimit),
				verificationGasLimit: toHex(userOp.verificationGasLimit),
				preVerificationGas: toHex(userOp.preVerificationGas),
				maxFeePerGas: toHex(userOp.maxFeePerGas),
				maxPriorityFeePerGas: toHex(userOp.maxPriorityFeePerGas),
				paymasterAndData: userOp.paymasterAndData,
				signature: '0x',
				...(userOp.factory ? { factory: userOp.factory } : {})
			},
			...(eip7702Auth ? { eip7702Auth } : {})
		};
		const simResult = await gaslessService.simulate(simRequest);
		if (!simResult.success) {
			throw new Error(
				`Pre-flight simulation failed: ${simResult.error || 'unknown error'}`
			);
		}
		addBreadcrumb({
			category: 'gasless',
			message: 'Pre-flight simulation passed',
			level: 'info',
			data: { sender }
		});
	} catch (simErr) {
		const simMsg = simErr instanceof Error ? simErr.message : String(simErr);
		addBreadcrumb({
			category: 'gasless',
			message: `Pre-flight simulation failed: ${simMsg}`,
			level: 'error',
			data: { sender }
		});
		throw simErr;
	}

	// Sign the UserOp
	const account = get(gaslessAccount);
	if (account && typeof account.signUserOperation === 'function') {
		const signed = await account.signUserOperation(userOp);
		// permissionless may return the signature string directly or as { signature }
		userOp.signature = (typeof signed === 'string' ? signed : signed.signature) || '0x';
	}

	// Serialize
	const serializableOp: SerializableUserOperation = {
		sender: userOp.sender,
		nonce: toHex(userOp.nonce),
		callData: userOp.callData,
		callGasLimit: toHex(userOp.callGasLimit),
		verificationGasLimit: toHex(userOp.verificationGasLimit),
		preVerificationGas: toHex(userOp.preVerificationGas),
		maxFeePerGas: toHex(userOp.maxFeePerGas),
		maxPriorityFeePerGas: toHex(userOp.maxPriorityFeePerGas),
		paymasterAndData: userOp.paymasterAndData,
		signature: userOp.signature || '0x',
		// Include factory sentinel for 7702 first-time delegations
		...(userOp.factory ? { factory: userOp.factory } : {})
	};

	// Relay via gaslessService (auth handled by axios interceptor)
	addBreadcrumb({
		category: 'gasless',
		message: `Relaying batch calls (${calls.length} calls)`,
		level: 'info',
		data: { sender, callCount: calls.length, feeToken, hasEip7702Auth: !!eip7702Auth }
	});

	try {
		const result = await gaslessService.relay({
			sender,
			userOp: serializableOp,
			...(eip7702Auth ? { eip7702Auth } : {})
		});

		addBreadcrumb({
			category: 'gasless',
			message: 'Batch UserOp relayed successfully',
			level: 'info',
			data: { userOpHash: result.userOpHash, sender, callCount: calls.length }
		});
		return result.userOpHash;
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		addBreadcrumb({
			category: 'gasless',
			message: `Batch relay failed: ${msg}`,
			level: 'error',
			data: { sender }
		});
		throw error;
	}
}
