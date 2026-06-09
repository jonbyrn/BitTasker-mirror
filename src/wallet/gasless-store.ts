// Gasless Wallet Store — Svelte store for Arbitrum ERC-4337 + EIP-7702
// Client-side: builds UserOps, signs locally, relays via NestJS backend.
import { writable, derived, get } from 'svelte/store';
import { encodeFunctionData, isAddress, type Address } from 'viem';
import type { SerializableUserOperation, FeeEstimate } from '$lib/types/gasless.types';
import {
	GAS_TREASURY,
	GAS_BOUNDS,
	API_BASE_URL,
	ARBITRUM_RPC_URL,
	ENTRY_POINT_ADDRESS
} from './gasless.config';
import {
	validateFeeParameters,
	validateFeeBufferBounds,
	validateFeeRecipient
} from './gasless-helpers';

// ---------------------------------------------------------------------------
// Minimal ABIs (local — only what we encode)
// ---------------------------------------------------------------------------

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
			{ type: 'address[]', name: 'dest' },
			{ type: 'uint256[]', name: 'value' },
			{ type: 'bytes[]', name: 'func' }
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

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

interface GaslessWalletState {
	address: string | null;
	ready: boolean;
	loading: boolean;
	error: string | null;
}

function createGaslessStore() {
	const { subscribe, update, set } = writable<GaslessWalletState>({
		address: null,
		ready: false,
		loading: false,
		error: null
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
				update((s) => ({ ...s, address: account.address, ready: true, loading: false }));
				return account.address;
			} catch (e) {
				const msg = e instanceof Error ? e.message : 'Failed to initialize wallet';
				update((s) => ({ ...s, loading: false, error: msg }));
				throw e;
			}
		},
		reset(): void {
			set({ address: null, ready: false, loading: false, error: null });
		}
	};
}

export const gaslessWallet = createGaslessStore();
export const gaslessAddress = derived(gaslessWallet, ($w) => $w.address);
export const gaslessReady = derived(gaslessWallet, ($w) => $w.ready);

// ---------------------------------------------------------------------------
// Build executeBatch callData
// ---------------------------------------------------------------------------

export function buildExecuteBatchCallData(
	calls: Array<{ to: string; data: string; value?: bigint }>,
	feeTokenAddress: string,
	feeBufferAmount: bigint
): `0x${string}` {
	if (calls.length === 0) throw new Error('At least one user call is required');
	const dests = calls.map((c) => c.to as Address);
	const values = calls.map((c) => c.value ?? 0n);
	const funcs = calls.map((c) => c.data as `0x${string}`);
	dests.push(feeTokenAddress as Address);
	values.push(0n);
	funcs.push(
		encodeFunctionData({
			abi: ERC20_TRANSFER_ABI,
			functionName: 'transfer',
			args: [GAS_TREASURY as Address, feeBufferAmount]
		})
	);
	return encodeFunctionData({
		abi: EXECUTE_BATCH_ABI,
		functionName: 'executeBatch',
		args: [dests, values, funcs]
	});
}

// ---------------------------------------------------------------------------
// Send gasless transaction
// ---------------------------------------------------------------------------

export async function sendGasless(
	calls: Array<{ to: string; data: string; value?: bigint }>,
	feeBufferToken: string,
	feeBufferAmount: bigint,
	estimatedGas: { callGasLimit: bigint; verificationGasLimit: bigint; preVerificationGas: bigint },
	jwt: string,
	smartAccount: { signUserOp: (op: Record<string, unknown>) => Promise<Record<string, unknown>> }
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

	const signedUserOp = await smartAccount.signUserOp(userOp);

	const serializableOp: SerializableUserOperation = {
		sender: signedUserOp.sender,
		nonce: signedUserOp.nonce.toString(),
		callData: signedUserOp.callData,
		callGasLimit: signedUserOp.callGasLimit.toString(),
		verificationGasLimit: signedUserOp.verificationGasLimit.toString(),
		preVerificationGas: signedUserOp.preVerificationGas.toString(),
		maxFeePerGas: signedUserOp.maxFeePerGas.toString(),
		maxPriorityFeePerGas: signedUserOp.maxPriorityFeePerGas.toString(),
		paymasterAndData: signedUserOp.paymasterAndData,
		signature: signedUserOp.signature
	};

	const response = await fetch(`${API_BASE_URL}/gasless/relay`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
		body: JSON.stringify({ sender: state.address, userOp: serializableOp })
	});

	if (!response.ok) {
		const error = await response.json().catch(() => ({ message: 'Relay failed' }));
		throw new Error(error.message || `Relay failed with status ${response.status}`);
	}
	return (await response.json()).userOpHash;
}

// ---------------------------------------------------------------------------
// Convenience: simple token transfer
// ---------------------------------------------------------------------------

export async function sendToken(
	token: string,
	recipient: string,
	amount: bigint,
	feeBufferAmount: bigint,
	estimatedGas: { callGasLimit: bigint; verificationGasLimit: bigint; preVerificationGas: bigint },
	jwt: string,
	smartAccount: { signUserOp: (op: Record<string, unknown>) => Promise<Record<string, unknown>> }
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
		jwt,
		smartAccount
	);
}

// ---------------------------------------------------------------------------
// Fee estimation (client-side, calls backend)
// ---------------------------------------------------------------------------

export async function estimateFee(
	token: string,
	amount: bigint,
	recipient: string,
	jwt: string
): Promise<FeeEstimate> {
	// Input validation
	if (!token || !recipient) throw new Error('token and recipient are required');
	if (!isAddress(token)) throw new Error('Invalid token address');
	if (!isAddress(recipient)) throw new Error('Invalid recipient address');
	if (amount <= 0n) throw new Error('Amount must be positive');

	const response = await fetch(`${API_BASE_URL}/gasless/estimate`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
		body: JSON.stringify({ token, amount: amount.toString(), recipient })
	});
	if (!response.ok) {
		const error = await response.json().catch(() => ({ message: 'Estimation failed' }));
		if (error.message?.includes('Network fee too high'))
			throw new Error('This operation is too complex. Please try a simpler transaction.');
		throw new Error(error.message || 'Fee estimation failed');
	}
	return response.json();
}

// ---------------------------------------------------------------------------
// Pre-flight balance check
// ---------------------------------------------------------------------------

export async function checkSufficientBalance(
	tokenAddress: string,
	userAddress: string,
	transferAmount: bigint,
	feeBufferAmount: bigint,
	rpcUrl?: string
): Promise<{ sufficient: boolean; balance: bigint; required: bigint }> {
	// Input validation
	if (!tokenAddress || !userAddress) throw new Error('tokenAddress and userAddress are required');
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
