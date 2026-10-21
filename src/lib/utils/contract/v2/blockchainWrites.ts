/**
 * Secure-payment contract writes: gas estimate, optional simulation, broadcast.
 * Non-payable lifecycle calls try the meta-tx relay first ({@link executeWriteWithRelay}), then fall back to {@link executeWriteDirect}.
 * These functions do not await chain confirmation — callers own `tx.wait()` / receipt parsing.
 */
import type { BigNumberish, Contract, ContractTransactionResponse } from 'ethers';
import { ethers } from 'ethers';
import { createDebug } from '$lib/utils/debug';
import { initContract } from '../index';
import type { ContractChain } from '../types';
import abi from './abi.json';
import { assertValidCreatePaymentContractParams } from './createPaymentContractParams';
import { getSecurePaymentContractAddress } from './contractAddress';
import {
	RELAY_HTTP_TIMEOUT_MS,
	RELAY_INFO_TIMEOUT_MS,
	TaskeeSignerMismatchError,
	assertExpectedSender,
	fallbackRelayContext,
	deadlineWithoutAbort,
	fetchWithoutAbort
} from './completeTaskRelay';
import {
	FUND_ESCROW_RPC_TIMEOUT_MS,
	FundEscrowTimeoutError,
	logFundEscrow,
	noteFundTxHash,
	trackFundSend
} from './fundEscrowGuard';
import {
	CompleteSendInFlightError,
	endCompleteSend,
	noteCompleteTxHash,
	tryBeginCompleteSend
} from './completeTaskGuard';

export { RelayRequestTimeoutError, TaskeeSignerMismatchError } from './completeTaskRelay';
export { CompleteSendInFlightError } from './completeTaskGuard';
import type {
	CreatePaymentContractParams,
	CreatePaymentContractTxResult,
	GasEstimateResult,
	WriteTxResult
} from './types';

const d = createDebug('contract:v2');
/** Relay / meta-tx steps — enable with `localStorage.debug` including `btasker:contract:v2:relay` */
const relayD = d.extend('relay');

/** Relay returned 400 SIMULATION_FAILED — do not fall back to direct; same tx would revert. */
export class RelaySimulationFailedError extends Error {
	readonly code = 'SIMULATION_FAILED' as const;
	constructor(
		message: string,
		public readonly simulationMessage?: string
	) {
		super(message);
		this.name = 'RelaySimulationFailedError';
	}
}

/** Relay /info mismatch or 400 validation — do not fall back (configuration or client bug). */
export class RelayInvalidRequestError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'RelayInvalidRequestError';
	}
}

/** Relay HTTP budget. `/info` on production hangs, so this must stay short and must not abort. */
const RELAY_FETCH_TIMEOUT_MS = RELAY_HTTP_TIMEOUT_MS;

export type { WriteTxResult };

export type ExecuteWriteOptions = {
	/** ABI function name */
	method: string;
	/** Positional arguments (no overrides object). */
	args: readonly unknown[];
	/** Merged with fee overrides; `gasPrice` is always taken from `getFeeData()` last. */
	overrides?: ethers.Overrides;
	chain?: ContractChain;
	/** Defaults to {@link getSecurePaymentContractAddress}. */
	contractAddress?: string;
	/** When set, the signing wallet must be this address (the on-chain taskee for completeTask). */
	expectedSender?: string;
	/** Task id for the funding double-send guard. Set only for createPaymentContract. */
	fundTaskId?: string;
};

/** Optional chain / contract override for curated payment-contract writes. */
export type SecurePaymentWriteOptions = Pick<
	ExecuteWriteOptions,
	'chain' | 'contractAddress' | 'expectedSender'
>;

type PreparedWrite = {
	method: string;
	fn: ethers.ContractMethod;
	args: readonly unknown[];
	finalOverrides: ethers.Overrides;
	gasPrice: bigint;
	logPrefix: string;
	contract: Contract;
	wallet: Awaited<ReturnType<typeof initContract>>['wallet'];
	/** Checksummed address used for this contract instance. */
	resolvedContractAddress: string;
};

function hasNonZeroValue(overrides?: ethers.Overrides): boolean {
	if (overrides?.value == null) return false;
	const v = overrides.value;
	if (typeof v === 'bigint') return v !== 0n;
	return BigInt(String(v)) !== 0n;
}

/**
 * Base URL for the meta-tx relay (no trailing slash).
 * Set `VITE_TX_RELAY_ENABLED=false` to skip relay and use direct writes only.
 * See docs/payments-v2/FRONTEND-INTEGRATION.md
 */
export function getTxRelayBaseUrl(): string | undefined {
	if (import.meta.env.VITE_TX_RELAY_ENABLED === 'false') return undefined;
	const raw = import.meta.env.VITE_TX_RELAY_BASE_URL;
	if (typeof raw === 'string' && raw.trim()) {
		return raw.replace(/\/$/, '');
	}
	const network = import.meta.env.VITE_RSK_NETWORK || 'testnet';
	if (network === 'mainnet') return 'https://tx-relay.bittasker.com';
	return 'https://tx-relay.testnet.bittasker.com';
}

async function prepareWrite(options: ExecuteWriteOptions): Promise<PreparedWrite> {
	const {
		method,
		args,
		overrides: callerOverrides = {},
		chain = 'rsk',
		contractAddress = getSecurePaymentContractAddress()
	} = options;

	d.log('prepareWrite', { method, args, contractAddress, chain });

	const { contract, provider, wallet } = await initContract(
		contractAddress,
		chain,
		abi as ethers.InterfaceAbi
	);
	const resolvedContractAddress = await contract.getAddress();
	d.log('resolvedContractAddress', { resolvedContractAddress });
	const feeData = await provider.getFeeData();
	const gasPrice = feeData.gasPrice || BigInt(0);
	const finalOverrides: ethers.Overrides = { ...callerOverrides, gasPrice };
	const fn = contract.getFunction(method);
	const logPrefix = `contract.write.${method}`;

	return {
		method,
		fn,
		args,
		finalOverrides,
		gasPrice,
		logPrefix,
		contract,
		wallet,
		resolvedContractAddress
	};
}

/**
 * Same fee + override merging as {@link executeWrite}, but only `estimateGas` (no staticCall, no broadcast).
 * Safe for UI preflight; failures return `{ success: false, error }` instead of throwing.
 */
export async function estimateWrite(options: ExecuteWriteOptions): Promise<GasEstimateResult> {
	try {
		const { fn, args, finalOverrides, gasPrice, logPrefix } = await prepareWrite(options);

		const gasEstimate = await fn.estimateGas(...args, finalOverrides);
		const estimatedCostWei = gasEstimate * gasPrice;
		const estimatedCostFormatted = ethers.formatEther(estimatedCostWei);

		d.log(`${logPrefix}: estimateWrite`, {
			gasLimit: gasEstimate.toString(),
			gasPrice: gasPrice.toString(),
			estimatedCostWei: estimatedCostWei.toString(),
			estimatedCostFormatted
		});

		return {
			success: true,
			estimatedGas: gasEstimate,
			estimatedCostWei,
			estimatedCostFormatted
		};
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		d.error(`estimateWrite failed (${options.method})`, err);
		return { success: false, error: err.message };
	}
}

/**
 * estimateGas → staticCall → broadcast with identical args and merged overrides.
 * Does not await confirmation. User pays gas.
 */
function logComplete(step: 'sign' | 'send tx', detail: Record<string, unknown>): void {
	console.log(`[complete-task] ${step}`, detail);
}

export async function executeWriteDirect(options: ExecuteWriteOptions): Promise<WriteTxResult> {
	const { requirePasskeyApproval } = await import('$lib/utils/helpers/passkey-approval');
	await requirePasskeyApproval();
	const broadcast = broadcastWrite(options);
	// Passkey stays outside the deadline. The RPC send is not aborted on timeout.
	if (options.method === 'createPaymentContract' && options.fundTaskId) {
		trackFundSend(options.fundTaskId, broadcast);
		return deadlineWithoutAbort(
			() => broadcast,
			FUND_ESCROW_RPC_TIMEOUT_MS,
			() => new FundEscrowTimeoutError(FUND_ESCROW_RPC_TIMEOUT_MS)
		);
	}
	return broadcast;
}

async function broadcastWrite(options: ExecuteWriteOptions): Promise<WriteTxResult> {
	const { fn, args, finalOverrides, gasPrice, logPrefix, wallet } = await prepareWrite(options);
	const sender = await wallet.getAddress();
	assertExpectedSender(sender, options.expectedSender);
	if (options.method === 'completeTask') {
		logComplete('sign', { paymentId: String(args[0] ?? ''), sender, via: 'direct' });
	}
	if (options.method === 'createPaymentContract') {
		logFundEscrow('sign', {
			taskId: options.fundTaskId ?? '',
			sender,
			nonce: finalOverrides.nonce ?? null
		});
	}

	const gasEstimate = await fn.estimateGas(...args, finalOverrides);
	const estimatedCostFormatted = ethers.formatEther(gasEstimate * gasPrice);

	d.log(`${logPrefix}: gas estimate`, {
		gasLimit: gasEstimate.toString(),
		estimatedCostFormatted
	});

	await fn.staticCall(...args, finalOverrides);
	d.log(`${logPrefix}: staticCall ok`);

	const tx = (await fn(...args, finalOverrides)) as ContractTransactionResponse;
	d.log(`${logPrefix}: broadcast`, { hash: tx.hash });
	if (options.method === 'completeTask') {
		logComplete('send tx', { hash: tx.hash, via: 'direct' });
	}
	if (options.method === 'createPaymentContract') {
		if (options.fundTaskId) noteFundTxHash(options.fundTaskId, tx.hash);
		logFundEscrow('send tx', { taskId: options.fundTaskId ?? '', hash: tx.hash, sender });
	}

	return { tx, estimatedCostFormatted };
}

type RelayInfoResponse = {
	securePaymentAddress: string;
	chainId: string;
};

async function fetchRelayJson<T>(
	url: string,
	init?: RequestInit & { timeoutMs?: number }
): Promise<{ ok: boolean; status: number; json: T | null }> {
	const timeoutMs = init?.timeoutMs ?? RELAY_FETCH_TIMEOUT_MS;
	const { timeoutMs: _omit, ...fetchInit } = init ?? {};
	// No AbortSignal. Aborting the Capacitor HTTP proxy reloads the Android WebView.
	const res = await fetchWithoutAbort(
		() =>
			fetch(url, {
				...fetchInit,
				headers: { Accept: 'application/json', ...fetchInit.headers }
			}),
		timeoutMs
	);
	const text = await res.text();
	let json: T | null = null;
	try {
		json = text ? (JSON.parse(text) as T) : null;
	} catch {
		json = null;
	}
	return { ok: res.ok, status: res.status, json };
}

/**
 * Meta-transaction path: sign relay payload and POST to `/relay`.
 * On success returns a {@link WriteTxResult} with `tx.hash` set (no full `ContractTransactionResponse` fields).
 * @throws {@link RelaySimulationFailedError} when relay reports SIMULATION_FAILED (400).
 * @throws {@link RelayInvalidRequestError} when `/info` disagrees with the app contract address or response is invalid.
 * @throws on network errors — callers that should fall back to {@link executeWriteDirect} must catch broadly.
 */
export async function executeWriteWithRelay(
	options: ExecuteWriteOptions,
	relayBaseUrl: string
): Promise<WriteTxResult> {
	const { requirePasskeyApproval } = await import('$lib/utils/helpers/passkey-approval');
	await requirePasskeyApproval();
	const prepared = await prepareWrite(options);
	const { method, args, contract, wallet, logPrefix, resolvedContractAddress } = prepared;

	const base = relayBaseUrl.replace(/\/$/, '');
	relayD.log('start', {
		logPrefix,
		method,
		relayBaseUrl: base,
		contractAddress: resolvedContractAddress,
		argsSummary: args.map((a) => (typeof a === 'bigint' ? a.toString() : a))
	});

	const infoUrl = `${base}/info`;
	const localAddr = ethers.getAddress(resolvedContractAddress);
	let relayAddr = localAddr;
	let chainId = fallbackRelayContext(localAddr, import.meta.env.VITE_RSK_NETWORK).chainId;

	relayD.log('GET /info', { url: infoUrl, timeoutMs: RELAY_INFO_TIMEOUT_MS });
	try {
		const infoRes = await fetchRelayJson<RelayInfoResponse>(infoUrl, {
			timeoutMs: RELAY_INFO_TIMEOUT_MS
		});
		relayD.log('/info response', {
			httpOk: infoRes.ok,
			status: infoRes.status,
			securePaymentAddress: infoRes.json?.securePaymentAddress,
			chainId: infoRes.json?.chainId
		});

		if (!infoRes.ok || !infoRes.json?.securePaymentAddress || !infoRes.json?.chainId) {
			throw new Error(
				`Relay /info failed: HTTP ${infoRes.status} ${infoRes.json ? JSON.stringify(infoRes.json) : ''}`
			);
		}

		relayAddr = ethers.getAddress(infoRes.json.securePaymentAddress);
		if (relayAddr !== localAddr) {
			relayD.log('contract address mismatch (relay vs app)', { relayAddr, localAddr });
			throw new RelayInvalidRequestError(
				`Relay securePaymentAddress (${relayAddr}) does not match app contract (${localAddr})`
			);
		}
		chainId = infoRes.json.chainId;
		relayD.log('contract address OK', { address: relayAddr });
	} catch (infoError) {
		if (infoError instanceof RelayInvalidRequestError) throw infoError;
		const local = fallbackRelayContext(localAddr, import.meta.env.VITE_RSK_NETWORK);
		relayAddr = ethers.getAddress(local.securePaymentAddress);
		chainId = local.chainId;
		relayD.log('relay /info unavailable, using local contract and chain id', {
			chainId,
			contract: relayAddr,
			message: infoError instanceof Error ? infoError.message : 'failed'
		});
		if (method === 'completeTask') {
			console.log('[complete-task] relay /info unavailable, using local chain', {
				chainId,
				contract: relayAddr
			});
		}
	}

	const data = contract.interface.encodeFunctionData(method, args);
	const sender = ethers.getAddress(await wallet.getAddress());
	assertExpectedSender(sender, options.expectedSender);
	relayD.log('calldata', {
		byteLength: Math.max(0, (data.length - 2) / 2),
		data0x: `${data.slice(0, 12)}…`
	});

	const dataHash = ethers.keccak256(data);
	const innerHash = ethers.keccak256(
		ethers.solidityPacked(
			['address', 'address', 'bytes32', 'uint256'],
			[sender, relayAddr, dataHash, BigInt(chainId)]
		)
	);
	relayD.log('meta-tx hash inputs', {
		sender,
		relayAddr,
		chainId,
		dataHash: `${dataHash.slice(0, 12)}…`,
		innerHash: `${innerHash.slice(0, 12)}…`
	});

	relayD.log('wallet.signMessage (EIP-191) for relay');
	if (method === 'completeTask') {
		logComplete('sign', { paymentId: String(args[0] ?? ''), sender, chainId, via: 'relay' });
	}
	const signature = await wallet.signMessage(ethers.getBytes(innerHash));
	relayD.log('signature', {
		lengthHexChars: signature.length,
		sig0x: `${signature.slice(0, 12)}…`
	});

	const relayUrl = `${base}/relay`;
	relayD.log('POST /relay', { url: relayUrl, timeoutMs: RELAY_FETCH_TIMEOUT_MS });
	const relayPost = await fetchRelayJson<{
		txHash?: string;
		status?: string;
		error?: string;
		message?: string;
	}>(relayUrl, {
		method: 'POST',
		timeoutMs: RELAY_FETCH_TIMEOUT_MS,
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ sender, data, signature })
	});

	const body = relayPost.json;
	relayD.log('/relay response', {
		httpOk: relayPost.ok,
		status: relayPost.status,
		bodyError: body?.error,
		bodyMessage: body?.message,
		txHash: body?.txHash
	});

	if (relayPost.status === 202 && body?.txHash) {
		d.log(`${logPrefix}: relay submitted`, { hash: body.txHash });
		relayD.log('relay success', { logPrefix, txHash: body.txHash });
		if (method === 'completeTask') {
			logComplete('send tx', { hash: body.txHash, via: 'relay' });
		}
		const tx = { hash: body.txHash } as ContractTransactionResponse;
		return { tx, estimatedCostFormatted: '0' };
	}

	if (relayPost.status === 202 && !body?.txHash) {
		relayD.log('relay accepted but missing txHash', { status: relayPost.status });
		throw new RelayInvalidRequestError('Relay accepted but no txHash in response');
	}

	if (relayPost.status === 400 && body?.error === 'SIMULATION_FAILED') {
		const msg = body.message ?? 'SIMULATION_FAILED';
		relayD.log('relay SIMULATION_FAILED (no direct fallback)', { message: msg });
		throw new RelaySimulationFailedError(msg, msg);
	}

	if (body?.error === 'SUBMISSION_FAILED' || relayPost.status === 502) {
		relayD.log('relay submission or gateway failure (will try direct if orchestrator allows)', {
			error: body?.error,
			status: relayPost.status,
			message: body?.message
		});
		throw new Error(body?.message ?? 'SUBMISSION_FAILED');
	}

	if (relayPost.status === 400) {
		relayD.log('relay validation error (no direct fallback)', {
			message: body?.message,
			error: body?.error
		});
		throw new RelayInvalidRequestError(body?.message ?? body?.error ?? 'Relay validation failed');
	}

	relayD.log('relay unexpected failure (orchestrator may fall back to direct)', {
		status: relayPost.status,
		body: body ?? null
	});
	throw new Error(
		body?.message ?? `Relay /relay failed: HTTP ${relayPost.status} ${JSON.stringify(body ?? {})}`
	);
}

/**
 * Tries {@link executeWriteWithRelay} first (non-payable lifecycle calls), then {@link executeWriteDirect} if the relay is unreachable or submission fails.
 * Does not fall back when {@link RelaySimulationFailedError}, {@link RelayInvalidRequestError},
 * or {@link TaskeeSignerMismatchError} is thrown.
 */
export async function executeWrite(options: ExecuteWriteOptions): Promise<WriteTxResult> {
	if (hasNonZeroValue(options.overrides)) {
		relayD.log('skip relay (payable / msg.value)', { method: options.method });
		return executeWriteDirect(options);
	}

	const relayBaseUrl = getTxRelayBaseUrl();
	if (!relayBaseUrl) {
		relayD.log('relay disabled by env, direct write only', {
			method: options.method,
			hint: 'set VITE_TX_RELAY_ENABLED or VITE_TX_RELAY_BASE_URL to enable'
		});
		return executeWriteDirect(options);
	}

	relayD.log('orchestrate: try relay then fallback', { method: options.method, relayBaseUrl });
	try {
		const result = await executeWriteWithRelay(options, relayBaseUrl);
		relayD.log('orchestrate: relay path succeeded', {
			method: options.method,
			txHash: result.tx.hash
		});
		return result;
	} catch (e) {
		if (e instanceof RelaySimulationFailedError) {
			relayD.log('orchestrate: relay simulation failed, rethrow (no fallback)', {
				method: options.method,
				message: e.message
			});
			throw e;
		}
		if (e instanceof RelayInvalidRequestError) {
			relayD.log('orchestrate: relay invalid request, rethrow (no fallback)', {
				method: options.method,
				message: e.message
			});
			throw e;
		}
		if (e instanceof TaskeeSignerMismatchError) {
			relayD.log('orchestrate: signer is not the taskee, rethrow (no fallback)', {
				method: options.method
			});
			throw e;
		}
		const err = e instanceof Error ? e : new Error(String(e));
		relayD.log('orchestrate: relay error, falling back to direct', {
			method: options.method,
			errorName: err.name,
			errorMessage: err.message
		});
		d.warn('executeWrite: relay failed, falling back to direct', e);
		return executeWriteDirect(options);
	}
}

/**
 * Validates params, then {@link executeWriteDirect} for `createPaymentContract` (payable; not relayed).
 */
export async function createPaymentContract(
	params: CreatePaymentContractParams,
	options?: { fundTaskId?: string; nonce?: number }
): Promise<CreatePaymentContractTxResult> {
	assertValidCreatePaymentContractParams(params);

	const taskeeEip55 = ethers.getAddress(params.taskee.toLowerCase());

	return executeWriteDirect({
		method: 'createPaymentContract',
		args: [
			taskeeEip55,
			params.estimatedStartTime,
			params.estimatedCompletionTime,
			params.taskerFeeTier,
			params.taskeeFeeTier,
			params.cancellationFee,
			params.upfrontDeposit
		],
		overrides: {
			value: params.totalValueWei,
			...(options?.nonce != null ? { nonce: options.nonce } : {})
		},
		fundTaskId: options?.fundTaskId
	});
}

// --- Curated lifecycle writes (uint32 paymentId; nonpayable unless noted) ---

export async function completeTask(
	paymentId: BigNumberish,
	options?: SecurePaymentWriteOptions
): Promise<WriteTxResult> {
	const id = String(paymentId);
	if (!tryBeginCompleteSend(id)) {
		throw new CompleteSendInFlightError(id);
	}
	try {
		const result = await executeWrite({ method: 'completeTask', args: [paymentId], ...options });
		if (result.tx.hash) noteCompleteTxHash(id, result.tx.hash);
		return result;
	} finally {
		endCompleteSend(id);
	}
}

export async function acceptTask(
	paymentId: BigNumberish,
	options?: SecurePaymentWriteOptions
): Promise<WriteTxResult> {
	return executeWrite({ method: 'acceptTask', args: [paymentId], ...options });
}

export async function resolveAfterTimelock(
	paymentId: BigNumberish,
	options?: SecurePaymentWriteOptions
): Promise<WriteTxResult> {
	return executeWrite({ method: 'resolveAfterTimelock', args: [paymentId], ...options });
}

export async function disputeTask(
	paymentId: BigNumberish,
	options?: SecurePaymentWriteOptions
): Promise<WriteTxResult> {
	return executeWrite({ method: 'disputeTask', args: [paymentId], ...options });
}

export async function proposeResolution(
	paymentId: BigNumberish,
	taskeeAmount: bigint,
	proposalNumber: number,
	options?: SecurePaymentWriteOptions
): Promise<WriteTxResult> {
	return executeWrite({
		method: 'proposeResolution',
		args: [paymentId, taskeeAmount, proposalNumber],
		...options
	});
}

export async function acceptProposal(
	paymentId: BigNumberish,
	options?: SecurePaymentWriteOptions
): Promise<WriteTxResult> {
	return executeWrite({ method: 'acceptProposal', args: [paymentId], ...options });
}

export async function cancelPaymentContract(
	paymentId: BigNumberish,
	options?: SecurePaymentWriteOptions
): Promise<WriteTxResult> {
	return executeWrite({ method: 'cancelPaymentContract', args: [paymentId], ...options });
}

export async function refundTasker(
	paymentId: BigNumberish,
	options?: SecurePaymentWriteOptions
): Promise<WriteTxResult> {
	return executeWrite({ method: 'refundTasker', args: [paymentId], ...options });
}

export async function markNoShow(
	paymentId: BigNumberish,
	options?: SecurePaymentWriteOptions
): Promise<WriteTxResult> {
	return executeWrite({ method: 'markNoShow', args: [paymentId], ...options });
}

export async function markWorkInProgress(
	paymentId: BigNumberish,
	options?: SecurePaymentWriteOptions
): Promise<WriteTxResult> {
	return executeWrite({ method: 'markWorkInProgress', args: [paymentId], ...options });
}

export async function claimNoShowRefund(
	paymentId: BigNumberish,
	options?: SecurePaymentWriteOptions
): Promise<WriteTxResult> {
	return executeWrite({ method: 'claimNoShowRefund', args: [paymentId], ...options });
}

export async function claimUpfrontDeposit(
	paymentId: BigNumberish,
	options?: SecurePaymentWriteOptions
): Promise<WriteTxResult> {
	return executeWrite({ method: 'claimUpfrontDeposit', args: [paymentId], ...options });
}
