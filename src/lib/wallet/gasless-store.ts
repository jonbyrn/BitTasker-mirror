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
import { encodeFunctionData, isAddress, type Address } from 'viem';
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
} from '../../wallet/gasless.config';
import { gaslessService } from '$lib/api/services/gasless.service';
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
	}) => Promise<UserOperation>;
	getNonce: () => Promise<bigint>;
}

// =============================================================================
// Minimal ABIs (local — only what we encode)
// =============================================================================

const ERC20_TRANSFER_ABI = [
	{
		type: 'function' as const,
		name: 'transfer',
		inputs: [
			{ type: 'address', name: 'to' },
			{ type: 'uint256', name: 'amount' }
		],
		outputs: [{ type: 'bool' }],
		stateMutability: 'nonpayable' as const
	}
];

const EXECUTE_BATCH_ABI = [
	{
		type: 'function' as const,
		name: 'executeBatch',
		inputs: [
			{
				type: 'tuple[]' as const,
				name: 'calls',
				components: [
					{ type: 'address', name: 'target' },
					{ type: 'uint256', name: 'value' },
					{ type: 'bytes', name: 'data' }
				]
			}
		],
		outputs: [],
		stateMutability: 'nonpayable' as const
	}
];

const ENTRY_POINT_ABI = [
	{
		type: 'function' as const,
		name: 'getNonce',
		inputs: [
			{ type: 'address', name: 'sender' },
			{ type: 'uint192', name: 'key' }
		],
		outputs: [{ type: 'uint256' }],
		stateMutability: 'view' as const
	}
];

// =============================================================================
// EIP-7702 constants
// =============================================================================

/** Convert a bigint to a `0x`-prefixed hex string for JSON transport. */
function toHex(value: bigint): string {
	return '0x' + value.toString(16);
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
 * @param publicClient - viem PublicClient for eth_getCode / getTransactionCount
 * @returns Delegation data or undefined
 */
async function signEip7702AuthIfNeeded(
	sender: string,
	publicClient: {
		getCode: (args: { address: `0x${string}` }) => Promise<string | undefined>;
		getTransactionCount: (args: { address: `0x${string}` }) => Promise<number>;
	}
): Promise<
	| {
			eip7702Auth: EIP7702Auth;
			factory: string;
			extraPreVerificationGas: bigint;
	  }
	| undefined
> {
	const existingCode = await publicClient.getCode({ address: sender as Address });
	const isDelegated = existingCode && existingCode !== '0x' && existingCode.length > 2;
	if (isDelegated) return undefined;

	const ownerKey = get(gaslessOwnerKey);
	if (!ownerKey) {
		throw new Error('Owner private key not available — cannot sign EIP-7702 authorization');
	}

	const { ethers } = await import('ethers');

	const eoaNonce = await publicClient.getTransactionCount({ address: sender as Address });

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
	const batchCalls: Array<[`0x${string}`, bigint, `0x${string}`]> = calls.map((c) => [
		c.to as `0x${string}`,
		c.value ?? 0n,
		c.data as `0x${string}`
	]);
	batchCalls.push([
		feeTokenAddress as `0x${string}`,
		0n,
		encodeFunctionData({
			abi: ERC20_TRANSFER_ABI,
			functionName: 'transfer',
			args: [GAS_TREASURY as Address, feeBufferAmount]
		})
	]);
	return encodeFunctionData({
		abi: EXECUTE_BATCH_ABI,
		functionName: 'executeBatch',
		args: [batchCalls]
	});
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
	const callData = buildExecuteBatchCallData(calls, feeBufferToken, feeBufferAmount);

	// Fetch nonce from EntryPoint contract (key=0 for sequential nonce)
	const { createPublicClient, http } = await import('viem');
	const { arbitrum } = await import('viem/chains');
	const publicClient = createPublicClient({
		chain: arbitrum,
		transport: http(ARBITRUM_RPC_URL || undefined)
	});
	const nonce = await publicClient.readContract({
		address: ENTRY_POINT_ADDRESS as Address,
		abi: ENTRY_POINT_ABI,
		functionName: 'getNonce',
		args: [state.address as Address, 0n]
	});

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

	const signedUserOp = await smartAccount.signUserOperation(userOp);

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
		signature: signedUserOp.signature || '0x'
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
	if (!isAddress(token)) throw new Error('Invalid token address');
	if (!isAddress(recipient)) throw new Error('Invalid recipient address');
	if (amount <= 0n) throw new Error('Amount must be positive');
	if (feeBufferAmount <= 0n) throw new Error('Fee buffer amount must be positive');

	const transferData = encodeFunctionData({
		abi: ERC20_TRANSFER_ABI,
		functionName: 'transfer',
		args: [recipient as Address, amount]
	});
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
	if (!isAddress(token)) throw new Error('Invalid token address');
	if (!isAddress(recipient)) throw new Error('Invalid recipient address');
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
	const transferData = encodeFunctionData({
		abi: ERC20_TRANSFER_ABI,
		functionName: 'transfer',
		args: [recipient as Address, amount]
	});

	// Fee buffer transfer to treasury
	const feeTransferData = encodeFunctionData({
		abi: ERC20_TRANSFER_ABI,
		functionName: 'transfer',
		args: [GAS_TREASURY as Address, feeBuffer]
	});

	return encodeFunctionData({
		abi: EXECUTE_BATCH_ABI,
		functionName: 'executeBatch',
		args: [
			[
				[token as Address, 0n, transferData],
				[token as Address, 0n, feeTransferData]
			]
		]
	});
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
	if (!isAddress(token)) throw new Error('Invalid token address');
	if (!isAddress(recipient)) throw new Error('Invalid recipient address');
	if (amount <= 0n) throw new Error('Amount must be positive');
	if (feeBuffer <= 0n) throw new Error('Fee buffer must be positive');

	const state = get(gaslessWallet);
	if (!state.ready || !state.address) {
		throw new Error('Wallet not initialized — call initWallet() first');
	}
	const sender = state.address;

	// 1. Build executeBatch callData
	const callData = buildTransferCallData(token, recipient, amount, feeBuffer);

	// 2. Fetch nonce from EntryPoint contract
	const { createPublicClient, http } = await import('viem');
	const { arbitrum } = await import('viem/chains');
	const publicClient = createPublicClient({
		chain: arbitrum,
		transport: http(ARBITRUM_RPC_URL || undefined)
	});

	const nonce = await publicClient.readContract({
		address: ENTRY_POINT_ADDRESS as Address,
		abi: ENTRY_POINT_ABI,
		functionName: 'getNonce',
		args: [sender as Address, 0n]
	});

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
	const delegation = await signEip7702AuthIfNeeded(sender, publicClient);
	let eip7702Auth: EIP7702Auth | undefined;
	if (delegation) {
		eip7702Auth = delegation.eip7702Auth;
		userOp.factory = delegation.factory;
		userOp.preVerificationGas = userOp.preVerificationGas + delegation.extraPreVerificationGas;
	}

	// 3d. Sign the UserOp client-side if account is available
	const account = get(gaslessAccount);
	if (account && typeof account.signUserOperation === 'function') {
		const signed = await account.signUserOperation(userOp);
		userOp.signature = signed.signature || '0x';
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
	if (!isAddress(tokenAddress)) throw new Error('Invalid token address');
	if (!isAddress(userAddress)) throw new Error('Invalid user address');
	if (transferAmount < 0n) throw new Error('transferAmount must be non-negative');
	if (feeBufferAmount < 0n) throw new Error('feeBufferAmount must be non-negative');

	const { createPublicClient, http } = await import('viem');
	const { arbitrum } = await import('viem/chains');
	const publicClient = createPublicClient({
		chain: arbitrum,
		transport: http(rpcUrl || ARBITRUM_RPC_URL || undefined)
	});

	const balance = await publicClient.readContract({
		address: tokenAddress as Address,
		abi: [
			{
				type: 'function' as const,
				name: 'balanceOf',
				inputs: [{ type: 'address' }],
				outputs: [{ type: 'uint256' }],
				stateMutability: 'view' as const
			}
		],
		functionName: 'balanceOf',
		args: [userAddress as Address]
	});

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
	if (!isAddress(userAddress)) throw new Error('Invalid user address');

	const { createPublicClient, http } = await import('viem');
	const { arbitrum } = await import('viem/chains');
	const publicClient = createPublicClient({
		chain: arbitrum,
		transport: http(rpcUrl || ARBITRUM_RPC_URL || undefined)
	});

	return publicClient.getBalance({ address: userAddress as Address });
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
	if (!isAddress(token)) throw new Error('Invalid token address');
	if (!isAddress(recipient)) throw new Error('Invalid recipient address');
	if (amount <= 0n) throw new Error('Amount must be positive');

	const ownerKey = get(gaslessOwnerKey);
	if (!ownerKey) {
		throw new Error('Owner key not available — cannot sign direct transaction');
	}

	const { createWalletClient, http, encodeFunctionData } = await import('viem');
	const { privateKeyToAccount } = await import('viem/accounts');
	const { arbitrum } = await import('viem/chains');

	const account = privateKeyToAccount(ownerKey);
	const walletClient = createWalletClient({
		account,
		chain: arbitrum,
		transport: http(ARBITRUM_RPC_URL || undefined)
	});

	// Encode ERC-20 transfer(recipient, amount)
	const data = encodeFunctionData({
		abi: ERC20_TRANSFER_ABI,
		functionName: 'transfer',
		args: [recipient as Address, amount]
	});

	const txHash = await walletClient.sendTransaction({
		to: token as Address,
		data,
		chain: arbitrum
	});

	return txHash;
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
	feeToken: string,
	feeBuffer: bigint,
	estimatedGas?: {
		callGasLimit: string;
		verificationGasLimit: string;
		preVerificationGas: string;
	}
): Promise<string> {
	if (calls.length === 0) throw new Error('At least one call is required');
	if (!isAddress(feeToken)) throw new Error('Invalid fee token address');
	if (feeBuffer <= 0n) throw new Error('Fee buffer must be positive');

	const state = get(gaslessWallet);
	if (!state.ready || !state.address) {
		throw new Error('Wallet not initialized — call initWallet() first');
	}
	const sender = state.address;

	// Build executeBatch callData with the user's calls + fee buffer
	const batchCalls: Array<[`0x${string}`, bigint, `0x${string}`]> = calls.map((c) => [
		c.to as `0x${string}`,
		c.value ?? 0n,
		c.data as `0x${string}`
	]);

	// Append fee buffer transfer as the last call
	batchCalls.push([
		feeToken as `0x${string}`,
		0n,
		encodeFunctionData({
			abi: ERC20_TRANSFER_ABI,
			functionName: 'transfer',
			args: [GAS_TREASURY as Address, feeBuffer]
		})
	]);

	const callData = encodeFunctionData({
		abi: EXECUTE_BATCH_ABI,
		functionName: 'executeBatch',
		args: [batchCalls]
	});

	// Fetch nonce from EntryPoint
	const { createPublicClient, http } = await import('viem');
	const { arbitrum } = await import('viem/chains');
	const publicClient = createPublicClient({
		chain: arbitrum,
		transport: http(ARBITRUM_RPC_URL || undefined)
	});

	const nonce = await publicClient.readContract({
		address: ENTRY_POINT_ADDRESS as Address,
		abi: ENTRY_POINT_ABI,
		functionName: 'getNonce',
		args: [sender as Address, 0n]
	});

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
	const delegation = await signEip7702AuthIfNeeded(sender, publicClient);
	let eip7702Auth: EIP7702Auth | undefined;
	if (delegation) {
		eip7702Auth = delegation.eip7702Auth;
		userOp.factory = delegation.factory;
		userOp.preVerificationGas = userOp.preVerificationGas + delegation.extraPreVerificationGas;
	}

	// Sign the UserOp
	const account = get(gaslessAccount);
	if (account && typeof account.signUserOperation === 'function') {
		const signed = await account.signUserOperation(userOp);
		userOp.signature = signed.signature || '0x';
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
