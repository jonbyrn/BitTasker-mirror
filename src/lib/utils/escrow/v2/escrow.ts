/**
 * V2 Escrow — blockchain layer for SecurePaymentContract (V2).
 * Uses relay (gasless) first, direct tx fallback. No pending Nostr.
 */

import type { FeeTier } from '@bittasker/wallet-core';
import type { ContractTransactionResult, DisputeProposal, EscrowData } from '$lib/types/wallet';
import { ethers, type JsonRpcProvider } from 'ethers';
import { getProvider, getWallet } from '$lib/stores/wallet.store';
import { createDebug } from '$lib/utils/debug';
import { mapBlockchainStateToEnum } from './escrow.enum';
import { getV2ContractAddressByChainId, getRelayBaseUrl } from './config';
import escrowABI from './abi.json';

const d = createDebug('escrow:v2');

let contract: ethers.Contract | null = null;
let cachedChainId: number | null = null;
const legacyContracts = new Map<string, ethers.Contract>();

function resetCachedContract(): void {
	d.log('resetCachedContract');
	contract = null;
	cachedChainId = null;
	legacyContracts.clear();
}

const getRSKWallet = () => getWallet('rsk');
const getRSKProvider = () => getProvider('rsk');

/**
 * Resolve V2 contract address: from param, or from env by current network chainId.
 */
async function resolveContractAddress(contractAddress?: string): Promise<string> {
	if (contractAddress) {
		const resolved = ethers.getAddress(contractAddress.toLowerCase());
		d.log('resolveContractAddress', { fromParam: true, address: `${resolved.slice(0, 10)}...` });
		return resolved;
	}
	const provider = getRSKProvider();
	if (!provider) {
		d.error('resolveContractAddress: RSK provider not initialized');
		throw new Error('RSK provider not initialized');
	}
	const network = await provider.getNetwork();
	const chainId = Number(network.chainId);
	const address = getV2ContractAddressByChainId(chainId);
	if (!address) {
		d.error('resolveContractAddress: no V2 address for chainId', { chainId });
		throw new Error(`V2 contract address not configured for chainId ${chainId}`);
	}
	const resolved = ethers.getAddress(address.toLowerCase());
	d.log('resolveContractAddress', { chainId, address: `${resolved.slice(0, 10)}...` });
	return resolved;
}

/**
 * Ensure wallet, provider, and V2 contract are ready.
 * @param contractAddress - Optional; if not provided, resolved from chainId (env).
 * @param requireBalance - If true, checks wallet has balance (for write ops).
 */
export async function ensureEscrowReady(
	contractAddress?: string,
	requireBalance = true
): Promise<{
	contract: ethers.Contract;
	wallet: ethers.Wallet;
	provider: ethers.JsonRpcProvider;
}> {
	let wallet = getRSKWallet();
	if (!wallet) {
		const { walletManager } = await import('$lib/stores/wallet.store');
		await walletManager.initialize();
		wallet = getRSKWallet();
		if (!wallet) {
			throw new Error('Failed to initialize wallet');
		}
	}

	let provider = getRSKProvider();
	if (!provider) {
		const { walletManager } = await import('$lib/stores/wallet.store');
		await walletManager.initialize();
		provider = getRSKProvider();
		if (!provider) {
			throw new Error('Failed to get provider');
		}
	}

	const providerWithMeta = provider as JsonRpcProvider & {
		destroyed?: boolean;
		_destroyed?: boolean;
	};
	const isDestroyed = providerWithMeta._destroyed === true || providerWithMeta.destroyed === true;
	if (isDestroyed) {
		const { walletManager } = await import('$lib/stores/wallet.store');
		await walletManager.initialize();
		provider = getRSKProvider();
		if (!provider) {
			throw new Error('Failed to get provider after reinitialization');
		}
	}

	const address = await resolveContractAddress(contractAddress);
	const normalizedAddress = address.toLowerCase();

	let targetContract: ethers.Contract;
	if (legacyContracts.has(normalizedAddress)) {
		targetContract = legacyContracts.get(normalizedAddress)!;
		d.log('ensureEscrowReady', { cache: 'legacy', address: `${address.slice(0, 10)}...` });
	} else {
		const network = await provider.getNetwork();
		const chainId = Number(network.chainId);
		const defaultAddress = getV2ContractAddressByChainId(chainId);
		const isDefault = defaultAddress && normalizedAddress === defaultAddress.toLowerCase();
		if (isDefault && contract && cachedChainId === chainId) {
			targetContract = contract;
			d.log('ensureEscrowReady', { cache: 'default', chainId });
		} else {
			targetContract = new ethers.Contract(address, escrowABI as ethers.InterfaceAbi, wallet);
			if (isDefault) {
				contract = targetContract;
				cachedChainId = chainId;
				d.log('ensureEscrowReady', {
					cache: 'new default',
					chainId,
					address: `${address.slice(0, 10)}...`
				});
			} else {
				legacyContracts.set(normalizedAddress, targetContract);
				d.log('ensureEscrowReady', { cache: 'new legacy', address: `${address.slice(0, 10)}...` });
			}
		}
	}

	if (requireBalance) {
		const balance = await provider.getBalance(wallet.address);
		d.log('ensureEscrowReady balance check', { balance: balance.toString(), requireBalance: true });
		if (balance === 0n) {
			d.warn('ensureEscrowReady: zero balance');
			throw new Error(
				'Insufficient balance. Please fund your wallet with RBTC to pay for transaction fees.'
			);
		}
	}

	d.log('ensureEscrowReady ready', { address: address.slice(0, 10) + '...' });
	return { contract: targetContract, wallet, provider };
}

/** Map SecurePaymentLegacy (or getPaymentContractState result) to EscrowData. */
function mapToEscrowData(
	paymentId: string,
	data: {
		state: number;
		tasker: string;
		taskee: string;
		amount?: bigint;
		taskerFeeTier?: number;
		taskeeFeeTier?: number;
		createdAt?: number;
		estimatedStartTime?: number;
		estimatedCompletionTime?: number;
		timelockEnd?: number;
		noShowMarked?: boolean;
	}
): EscrowData {
	const client = (data.tasker ?? '').toLowerCase();
	const freelancer = (data.taskee ?? '').toLowerCase();
	const amountStr = data.amount != null ? ethers.formatEther(data.amount) : '0';
	// V2: fee tier 0 for the other party; use 1 as default for type
	const clientFeeTier = (data.taskerFeeTier ?? 0) || 1;
	const freelancerFeeTier = (data.taskeeFeeTier ?? 0) || 1;
	// Status: v2 enum 0-11; cast to EscrowData (global EscrowStatus is numeric-compatible)
	return {
		id: paymentId,
		client,
		freelancer,
		baseAmount: amountStr,
		clientFee: '0',
		freelancerFee: '0',
		totalAmount: amountStr,
		status: mapBlockchainStateToEnum(data.state) as unknown as EscrowData['status'],
		estimatedStartTime: Number(data.estimatedStartTime ?? 0),
		estimatedCompletionTime: Number(data.estimatedCompletionTime ?? 0),
		completionTime: 0,
		timelockExpiry: Number(data.timelockEnd ?? 0),
		clientFeeTier: clientFeeTier as FeeTier,
		freelancerFeeTier: freelancerFeeTier as FeeTier,
		createdAt: (Number(data.createdAt ?? 0) || 0) * 1000,
		lastUpdated: Date.now()
	};
}

/**
 * Load payment details from chain.
 * Uses getPaymentContractState (public); if caller is a party, uses getPaymentContract for full struct.
 */
export async function loadEscrowDetails(
	paymentId: string,
	contractAddress?: string
): Promise<EscrowData> {
	d.log('loadEscrowDetails start', {
		paymentId,
		contractAddress: contractAddress ? `${contractAddress.slice(0, 10)}...` : undefined
	});
	const paymentIdNum = parseInt(paymentId, 10);
	if (isNaN(paymentIdNum) || paymentIdNum < 0) {
		d.error('loadEscrowDetails invalid paymentId', { paymentId });
		throw new Error(`Invalid payment id: ${paymentId}`);
	}

	const MAX_RETRIES = 2;
	let lastError: Error | null = null;

	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		try {
			const { contract: targetContract } = await ensureEscrowReady(contractAddress, false);
			if (!targetContract) {
				throw new Error('Contract not found');
			}

			const [state, exists, tasker, taskee, noShowMarked] =
				await targetContract.getPaymentContractState(paymentIdNum);

			d.log('loadEscrowDetails getPaymentContractState', {
				paymentId,
				exists,
				state: Number(state),
				attempt: attempt + 1
			});

			if (!exists) {
				throw new Error(`Payment contract ${paymentId} does not exist`);
			}

			const base = {
				state: Number(state),
				tasker: tasker?.toLowerCase?.() ?? '',
				taskee: taskee?.toLowerCase?.() ?? '',
				noShowMarked: Boolean(noShowMarked)
			};

			try {
				const full = await targetContract.getPaymentContract(paymentIdNum);
				d.log('loadEscrowDetails getPaymentContract success (party)', {
					paymentId,
					state: base.state
				});
				return mapToEscrowData(paymentId, {
					...base,
					amount: full.amount != null ? BigInt(full.amount.toString()) : undefined,
					taskerFeeTier: full.taskerFeeTier != null ? Number(full.taskerFeeTier) : undefined,
					taskeeFeeTier: full.taskeeFeeTier != null ? Number(full.taskeeFeeTier) : undefined,
					createdAt: full.createdAt != null ? Number(full.createdAt) : undefined,
					estimatedStartTime:
						full.estimatedStartTime != null ? Number(full.estimatedStartTime) : undefined,
					estimatedCompletionTime:
						full.estimatedCompletionTime != null ? Number(full.estimatedCompletionTime) : undefined,
					timelockEnd: full.timelockEnd != null ? Number(full.timelockEnd) : undefined
				});
			} catch {
				d.warn('loadEscrowDetails getPaymentContract reverted (not a party), using state only', {
					paymentId
				});
				return mapToEscrowData(paymentId, base);
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			lastError = error instanceof Error ? error : new Error(String(error));
			d.error(
				'loadEscrowDetails attempt failed',
				{ paymentId, attempt: attempt + 1, errorMessage },
				error
			);
			const isProviderError =
				errorMessage.includes('provider') ||
				errorMessage.includes('Failed to get provider') ||
				errorMessage.includes('provider destroyed');
			if (isProviderError && attempt < MAX_RETRIES) {
				d.log('loadEscrowDetails retry after provider error', {
					paymentId,
					nextAttempt: attempt + 2
				});
				resetCachedContract();
				await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
				continue;
			}
			throw new Error(`Failed to load escrow details for payment ${paymentId}: ${errorMessage}`);
		}
	}

	if (lastError) throw lastError;
	throw new Error(`Failed to load escrow details for payment ${paymentId}: Unknown error`);
}

/** V2 has no getDisputeProposal; return null for compatibility. */
export async function getDisputeProposal(
	_paymentId: string,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature matches interface
	_contractAddress?: string
): Promise<DisputeProposal | null> {
	d.log('getDisputeProposal (v2 stub)', { paymentId: _paymentId });
	return null;
}

/**
 * Check if payment exists and was funded (exists on chain = funded for V2).
 */
export async function checkEscrowFundingStatus(paymentId: string): Promise<{
	wasFunded: boolean;
	escrowData: EscrowData | null;
	error?: import('$lib/utils/helpers/escrowErrors').EscrowError;
}> {
	d.log('checkEscrowFundingStatus start', { paymentId });
	const { createEscrowError, isEscrowNotFoundError } = await import(
		'$lib/utils/helpers/escrowErrors'
	);
	try {
		const escrowData = await loadEscrowDetails(paymentId);
		d.log('checkEscrowFundingStatus success', {
			paymentId,
			wasFunded: true,
			state: escrowData.status
		});
		return { wasFunded: true, escrowData };
	} catch (error) {
		if (isEscrowNotFoundError(error)) {
			d.log('checkEscrowFundingStatus not found', { paymentId });
			return { wasFunded: false, escrowData: null };
		}
		d.error('checkEscrowFundingStatus error', { paymentId }, error);
		const escrowError = createEscrowError(
			error,
			`Failed to check escrow funding status for ${paymentId}`
		);
		return { wasFunded: false, escrowData: null, error: escrowError };
	}
}

/**
 * Submit a meta-transaction via the relay (gasless).
 * Builds calldata, signs with EIP-191, POSTs to relay. Does not wait for confirmation.
 */
export async function submitGaslessMetaTx(
	signer: ethers.Signer,
	relayBaseUrl: string,
	contractAddress: string,
	chainId: string | number,
	functionName: string,
	args: unknown[]
): Promise<{ ok: true; txHash: string } | { ok: false; error: string; message?: string }> {
	d.log('submitGaslessMetaTx start', {
		functionName,
		args,
		contractAddress: contractAddress.slice(0, 10) + '...',
		chainId
	});
	const baseUrl = relayBaseUrl.replace(/\/$/, '');
	if (!baseUrl) {
		d.warn('submitGaslessMetaTx: relay URL not configured');
		return { ok: false, error: 'Relay URL not configured', message: 'VITE_RELAY_URL is missing' };
	}

	const contract = new ethers.Contract(contractAddress, escrowABI as ethers.InterfaceAbi, signer);
	const data = contract.interface.encodeFunctionData(functionName, args);
	const sender = await signer.getAddress();
	const chainIdBig = typeof chainId === 'string' ? BigInt(chainId) : BigInt(chainId);
	const innerHash = ethers.keccak256(
		ethers.solidityPacked(
			['address', 'address', 'bytes32', 'uint256'],
			[sender, contractAddress, ethers.keccak256(data), chainIdBig]
		)
	);
	const signature = await signer.signMessage(ethers.getBytes(innerHash));

	const res = await fetch(`${baseUrl}/relay`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ sender, data, signature })
	});
	const json = (await res.json()) as { txHash?: string; error?: string; message?: string };

	if (res.status === 202 && json.txHash) {
		d.log('submitGaslessMetaTx success', {
			functionName,
			txHash: json.txHash.slice(0, 18) + '...'
		});
		return { ok: true, txHash: json.txHash };
	}
	d.warn('submitGaslessMetaTx relay error', {
		functionName,
		status: res.status,
		error: json.error,
		message: json.message
	});
	return {
		ok: false,
		error: json.error ?? 'UNKNOWN',
		message: json.message
	};
}

/**
 * Read GAS_REIMBURSEMENT_PER_OP from the contract (wei per meta-tx op).
 * Used to enforce minimum msg.value for createPaymentContract (e.g. 2× for two ops).
 */
export async function getGasReimbursementPerOp(contractAddress?: string): Promise<bigint> {
	const { contract: targetContract } = await ensureEscrowReady(contractAddress, false);
	const value = await targetContract.GAS_REIMBURSEMENT_PER_OP();
	const result = typeof value === 'bigint' ? value : BigInt(String(value));
	d.log('getGasReimbursementPerOp', { value: result.toString() });
	return result;
}

export interface CreatePaymentContractParams {
	taskee: string;
	estimatedStartTime: number;
	estimatedCompletionTime: number;
	taskerFeeTier: number;
	taskeeFeeTier: number;
	cancellationFee: bigint;
	upfrontDeposit: bigint;
	valueWei: bigint;
}

/**
 * Create a V2 payment contract (payable, direct tx only).
 * Waits for receipt and parses PaymentContractCreated to get paymentId.
 */
export async function createPaymentContract(
	params: CreatePaymentContractParams,
	contractAddress?: string
): Promise<ContractTransactionResult> {
	const taskeeAddress = ethers.getAddress(params.taskee.toLowerCase());
	d.log('createPaymentContract start', {
		taskee: taskeeAddress.slice(0, 10) + '...',
		valueWei: params.valueWei.toString(),
		start: params.estimatedStartTime,
		end: params.estimatedCompletionTime
	});
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- wallet reserved for future gasless flow
	const { contract: targetContract, wallet } = await ensureEscrowReady(contractAddress, true);
	const tx = await targetContract.createPaymentContract(
		taskeeAddress,
		params.estimatedStartTime,
		params.estimatedCompletionTime,
		params.taskerFeeTier,
		params.taskeeFeeTier,
		params.cancellationFee,
		params.upfrontDeposit,
		{ value: params.valueWei }
	);
	d.log('createPaymentContract tx sent', { hash: tx.hash?.slice(0, 18) });
	const receipt = await tx.wait();
	if (!receipt) {
		d.error('createPaymentContract no receipt');
		throw new Error('Transaction failed: no receipt');
	}
	const iface = targetContract.interface;
	let paymentId = 0;
	for (const log of receipt.logs ?? []) {
		try {
			const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
			if (parsed?.name === 'PaymentContractCreated') {
				paymentId = Number(parsed.args?.paymentContractId ?? parsed.args?.[0] ?? 0);
				break;
			}
		} catch {
			// not this event, skip
		}
	}
	if (paymentId === 0) {
		d.error('createPaymentContract PaymentContractCreated not found in logs', {
			logs: receipt.logs?.length
		});
		throw new Error('Transaction succeeded but PaymentContractCreated event not found');
	}
	d.log('createPaymentContract success', { paymentId, hash: receipt.hash });
	return {
		hash: receipt.hash,
		escrowId: String(paymentId),
		status: receipt.status === 1 ? 'confirmed' : 'failed'
	};
}

/**
 * Fetch relay /info for securePaymentAddress and chainId.
 * We prefer env for contract address; use this when you need chainId for signing.
 */
export async function fetchRelayInfo(): Promise<{ securePaymentAddress: string; chainId: string }> {
	d.log('fetchRelayInfo start');
	const baseUrl = getRelayBaseUrl();
	if (!baseUrl) {
		d.error('fetchRelayInfo: relay URL not configured');
		throw new Error('Relay URL not configured (VITE_RELAY_URL)');
	}
	const res = await fetch(`${baseUrl}/info`);
	if (!res.ok) {
		d.error('fetchRelayInfo /info failed', { status: res.status });
		throw new Error(`Relay /info failed: ${res.status}`);
	}
	const json = (await res.json()) as { securePaymentAddress?: string; chainId?: string };
	if (!json.securePaymentAddress || json.chainId == null) {
		d.error('fetchRelayInfo invalid response', {
			hasAddress: !!json.securePaymentAddress,
			hasChainId: json.chainId != null
		});
		throw new Error('Invalid relay /info response');
	}
	d.log('fetchRelayInfo success', {
		chainId: json.chainId,
		address: json.securePaymentAddress.slice(0, 10) + '...'
	});
	return {
		securePaymentAddress: json.securePaymentAddress,
		chainId: String(json.chainId)
	};
}

const notImplemented = (method: string): never => {
	throw new Error(
		`V2: ${method} not implemented yet. Use bidOps.acceptBidAndCreateEscrow for creation.`
	);
};

/** Stub for IEscrowHandler; V2 creation uses createPaymentContract via escrowBid. */
async function createEscrow(): Promise<ContractTransactionResult> {
	return notImplemented('createEscrow');
}

async function completeTask(): Promise<ContractTransactionResult> {
	return notImplemented('completeTask');
}
async function acceptTask(): Promise<ContractTransactionResult> {
	return notImplemented('acceptTask');
}
async function cancelEscrow(): Promise<ContractTransactionResult> {
	return notImplemented('cancelEscrow');
}
async function disputeTask(): Promise<ContractTransactionResult> {
	return notImplemented('disputeTask');
}
async function proposeResolution(): Promise<ContractTransactionResult> {
	return notImplemented('proposeResolution');
}
async function acceptProposal(): Promise<ContractTransactionResult> {
	return notImplemented('acceptProposal');
}
async function resolveAfterTimelock(): Promise<ContractTransactionResult> {
	return notImplemented('resolveAfterTimelock');
}

export const escrow = {
	ensureEscrowReady,
	loadEscrowDetails,
	getDisputeProposal,
	checkEscrowFundingStatus,
	submitGaslessMetaTx,
	fetchRelayInfo,
	resetCachedContract,
	getGasReimbursementPerOp,
	createPaymentContract,
	createEscrow,
	completeTask,
	acceptTask,
	cancelEscrow,
	disputeTask,
	proposeResolution,
	acceptProposal,
	resolveAfterTimelock
};
