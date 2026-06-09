import { writable, derived, get } from 'svelte/store';
import {
	createPublicClient,
	http,
	parseAbi,
	encodeFunctionData,
	type Address,
	type PublicClient,
	type Hex
} from 'viem';
import { arbitrum } from 'viem/chains';
import { createSmartAccountClient, type SmartAccountClient } from 'permissionless';
import { to7702SimpleSmartAccount, type SmartAccount } from 'permissionless/accounts';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import type { UserOperation, GasEstimate } from '$lib/types/gasless.types';
import { feeTiers, getFeeTier, isTokenAllowed } from '../../../gasless.config';

// =============================================================================
// Constants
// =============================================================================

const ERC20_ABI = parseAbi([
	'function transfer(address to, uint256 amount) returns (bool)',
	'function balanceOf(address owner) view returns (uint256)',
	'function allowance(address owner, address spender) view returns (uint256)'
]);

const FEE_BUFFER_MULTIPLIER = 12n; // 20% buffer on gas estimates (12/10 = 1.2x)
const FEE_BUFFER_DIVISOR = 10n;

// =============================================================================
// Relay Configuration
// =============================================================================

function getRelayBaseUrl(): string {
	const url = import.meta.env.VITE_TX_RELAY_BASE_URL;
	if (!url) throw new Error('VITE_TX_RELAY_BASE_URL not configured');
	return url.replace(/\/$/, ''); // trim trailing slash
}

function getAuthToken(): string | null {
	if (typeof window === 'undefined') return null;
	return localStorage.getItem('auth_token');
}

// =============================================================================
// Reactive State
// =============================================================================

/** The EIP-7702 smart account instance */
export const smartAccount = writable<SmartAccount<'7702'> | null>(null);

/** The permissionless.js smart account client */
export const bundlerClient = writable<SmartAccountClient | null>(null);

/** Derived: the smart account address (null if not initialized) */
export const address = derived(smartAccount, ($account) => $account?.address ?? null);

/** Derived: whether the wallet is ready for transactions */
export const isReady = derived(smartAccount, ($account) => !!$account);

// =============================================================================
// Initialization
// =============================================================================

/**
 * Initialize the EIP-7702 smart account on Arbitrum.
 *
 * Creates a 7702 SimpleSmartAccount bound to the provided private key,
 * then wraps it in a SmartAccountClient connected to the Alto bundler.
 *
 * @param privateKey - Hex-encoded private key (with or without 0x prefix)
 * @returns The smart account address
 * @throws If already initialized or environment is misconfigured
 */
export async function initArbitrumWallet(privateKey: string): Promise<Address> {
	const existing = get(smartAccount);
	if (existing) {
		console.warn('[gasless] Wallet already initialized:', existing.address);
		return existing.address;
	}

	// Public client for on-chain reads
	const publicClient: PublicClient = createPublicClient({
		chain: arbitrum,
		transport: http()
	});

	// EOA signer from private key
	const signer: PrivateKeyAccount = privateKeyToAccount(
		(privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`) as Hex
	);

	// EIP-7702 smart account
	const account = await to7702SimpleSmartAccount({
		client: publicClient,
		owner: signer
	});

	// Bundler client for UserOp submission
	const bundlerUrl = import.meta.env.VITE_ALTO_BUNDLER_URL ?? 'http://localhost:3000';
	const client = createSmartAccountClient({
		account,
		chain: arbitrum,
		bundlerTransport: http(bundlerUrl)
	});

	smartAccount.set(account);
	bundlerClient.set(client);

	console.log('[gasless] Wallet initialized:', account.address);
	return account.address;
}

// =============================================================================
// Gas Estimation
// =============================================================================

/**
 * Estimate gas for a batch of calls via the NestJS relay endpoint.
 *
 * @param calls - Array of { to, data } call targets
 * @param feeTier - Requested fee tier (default: 'standard')
 * @returns GasEstimate with raw and buffered values (bigint fields)
 */
export async function estimateFee(
	calls: Array<{ to: Address; data: Hex }>,
	feeTier: string = 'standard'
): Promise<GasEstimate> {
	const account = get(smartAccount);
	if (!account) throw new Error('Wallet not initialized');

	const relayUrl = `${getRelayBaseUrl()}/gasless/estimate`;
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	const token = getAuthToken();
	if (token) headers['Authorization'] = `Bearer ${token}`;

	const response = await fetch(relayUrl, {
		method: 'POST',
		headers,
		body: JSON.stringify({
			sender: account.address,
			calls,
			feeTier
		})
	});

	if (!response.ok) {
		const error = await response.json().catch(() => ({ message: response.statusText }));
		throw new Error(`Fee estimation failed: ${error.message ?? response.statusText}`);
	}

	const raw = await response.json();

	// Convert to bigint and apply 20% buffer
	return {
		callGasLimit: (BigInt(raw.callGasLimit) * FEE_BUFFER_MULTIPLIER) / FEE_BUFFER_DIVISOR,
		verificationGasLimit:
			(BigInt(raw.verificationGasLimit) * FEE_BUFFER_MULTIPLIER) / FEE_BUFFER_DIVISOR,
		preVerificationGas:
			(BigInt(raw.preVerificationGas) * FEE_BUFFER_MULTIPLIER) / FEE_BUFFER_DIVISOR,
		totalGas: (BigInt(raw.totalGasLimit) * FEE_BUFFER_MULTIPLIER) / FEE_BUFFER_DIVISOR
	};
}

// =============================================================================
// UserOp Construction & Signing
// =============================================================================

/**
 * Build and sign a UserOp locally, then relay to the NestJS backend.
 *
 * The private key never leaves the client. The backend validates, adds
 * paymaster sponsorship, and forwards to the Alto bundler.
 *
 * @param calls - Array of { to, data } call targets
 * @param feeTier - Fee tier name ('standard' | 'fast' | 'urgent')
 * @returns UserOp hash from the bundler
 */
export async function sendGasless(
	calls: Array<{ to: Address; data: Hex }>,
	feeTier: string = 'standard'
): Promise<string> {
	const client = get(bundlerClient);
	const account = get(smartAccount);
	if (!client || !account) throw new Error('Wallet not initialized');

	const tier = getFeeTier(feeTier) ?? feeTiers[0];

	// 1. Estimate gas with buffer
	const estimate = await estimateFee(calls, feeTier);

	// 2. Build UserOperation fields (all gas fields are bigint)
	const userOp: Partial<UserOperation> = {
		sender: account.address,
		nonce: 0n, // permissionless.js manages nonce
		callData: await account.encodeCalls(calls),
		callGasLimit: estimate.callGasLimit,
		verificationGasLimit: estimate.verificationGasLimit,
		preVerificationGas: estimate.preVerificationGas,
		maxFeePerGas: BigInt(tier.maxFeePerGas),
		maxPriorityFeePerGas: BigInt(tier.maxPriorityFeePerGas),
		paymasterAndData: '0x', // NestJS backend fills this
		signature: '0x' // placeholder, signed below
	};

	// 3. Sign the UserOperation locally
	const signedUserOp = await account.signUserOperation(userOp as UserOperation);

	// 4. Relay to NestJS backend (NOT directly to bundler)
	const relayUrl = `${getRelayBaseUrl()}/gasless/relay`;
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	const token = getAuthToken();
	if (token) headers['Authorization'] = `Bearer ${token}`;

	const response = await fetch(relayUrl, {
		method: 'POST',
		headers,
		body: JSON.stringify({
			...signedUserOp,
			feeTier
		})
	});

	if (!response.ok) {
		const error = await response.json().catch(() => ({ message: response.statusText }));
		throw new Error(`Relay submission failed: ${error.message ?? response.statusText}`);
	}

	const result = await response.json();
	console.log('[gasless] UserOp relayed:', result.userOpHash);
	return result.userOpHash as string;
}

// =============================================================================
// Convenience: Token Transfer
// =============================================================================

/**
 * Send an ERC-20 token transfer as a gasless transaction.
 *
 * @param tokenAddress - ERC-20 contract address
 * @param recipient - Recipient address
 * @param amount - Amount in token's smallest unit (raw bigint)
 * @param feeTier - Fee tier name (default: 'standard')
 * @returns UserOp hash
 */
export async function sendToken(
	tokenAddress: Address,
	recipient: Address,
	amount: bigint,
	feeTier: string = 'standard'
): Promise<string> {
	if (!isTokenAllowed(tokenAddress)) {
		throw new Error(`Token ${tokenAddress} is not allowed for gasless transfers`);
	}

	const transferData = encodeFunctionData({
		abi: ERC20_ABI,
		functionName: 'transfer',
		args: [recipient, amount]
	});

	return sendGasless([{ to: tokenAddress, data: transferData }], feeTier);
}

// =============================================================================
// Utility: Balance Check
// =============================================================================

/**
 * Check the on-chain balance of an ERC-20 token for the smart account.
 *
 * @param tokenAddress - ERC-20 contract address
 * @returns Balance as bigint in the token's smallest unit
 */
export async function getTokenBalance(tokenAddress: Address): Promise<bigint> {
	const account = get(smartAccount);
	if (!account) throw new Error('Wallet not initialized');

	const publicClient: PublicClient = createPublicClient({
		chain: arbitrum,
		transport: http()
	});

	const balance = await publicClient.readContract({
		address: tokenAddress,
		abi: ERC20_ABI,
		functionName: 'balanceOf',
		args: [account.address]
	});

	return balance;
}

// =============================================================================
// Teardown
// =============================================================================

/**
 * Disconnect and clear the wallet state.
 */
export function disconnectWallet(): void {
	smartAccount.set(null);
	bundlerClient.set(null);
	console.log('[gasless] Wallet disconnected');
}
