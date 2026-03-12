/**
 * Relay client for gasless meta-transactions on SecurePaymentContract v2.
 *
 * Users sign off-chain; the relay pays gas and submits via executeMetaTransaction.
 * Falls back to direct contract calls when relay fails.
 *
 * @see docs/escrow/v2/gasless-frontend-integration.md
 */

import {
	ethers,
	type Contract,
	type JsonRpcProvider,
	type TransactionReceipt,
	type Wallet
} from 'ethers';
import { createDebug } from '$lib/utils/debug';

const d = createDebug('escrow:relay');

/** Relay info from GET /info */
export interface RelayInfo {
	securePaymentAddress: string;
	chainId: string;
}

/** Result of submitEscrowWrite - tx-like object for confirmation handling */
export interface EscrowWriteResult {
	hash: string;
	wait: () => Promise<TransactionReceipt | null>;
}

/** Relay error response */
interface RelayErrorResponse {
	error?: string;
	message?: string;
}

const RELAY_RETRY_ATTEMPTS = 3;
const RELAY_RETRY_DELAY_MS = 1000;
const POLL_INTERVAL_MS = 5000;
const POLL_MAX_ATTEMPTS = 60; // ~5 min at 5s interval

/**
 * Fetch relay info (contract address, chainId).
 */
export async function fetchRelayInfo(relayBaseUrl: string): Promise<RelayInfo> {
	d.log('fetchRelayInfo', { relayBaseUrl });
	const response = await fetch(`${relayBaseUrl}/info`);
	if (!response.ok) {
		d.error('fetchRelayInfo failed', { status: response.status });
		throw new Error(`Relay /info failed: ${response.status}`);
	}
	const json = (await response.json()) as RelayInfo;
	if (!json.securePaymentAddress || !json.chainId) {
		d.error('fetchRelayInfo invalid response', {
			hasAddress: !!json.securePaymentAddress,
			hasChainId: !!json.chainId
		});
		throw new Error('Invalid relay /info response');
	}
	d.log('fetchRelayInfo ok', {
		contractAddress: json.securePaymentAddress.slice(0, 10) + '...',
		chainId: json.chainId
	});
	return json;
}

/**
 * Build meta-transaction: encode data and sign EIP-191.
 * Hash: keccak256(solidityPacked(sender, contractAddress, keccak256(data), chainId))
 */
export async function buildMetaTransaction(
	wallet: Wallet,
	contractAddress: string,
	chainId: string,
	contractInterface: ethers.Interface,
	method: string,
	args: unknown[]
): Promise<{ sender: string; data: string; signature: string }> {
	d.log('buildMetaTransaction', { method, argsLength: args.length });
	const sender = await wallet.getAddress();
	const data = contractInterface.encodeFunctionData(method, args);
	const dataHash = ethers.keccak256(data);
	const chainIdBigInt = BigInt(chainId);
	const innerHash = ethers.keccak256(
		ethers.solidityPacked(
			['address', 'address', 'bytes32', 'uint256'],
			[sender, contractAddress, dataHash, chainIdBigInt]
		)
	);
	const signature = await wallet.signMessage(ethers.getBytes(innerHash));
	d.log('buildMetaTransaction done', {
		sender: sender.slice(0, 10) + '...',
		dataLen: data.length,
		sigLen: signature.length
	});
	return { sender, data, signature };
}

/**
 * Submit meta-transaction to relay. Returns txHash on success.
 */
export async function postToRelay(
	relayBaseUrl: string,
	sender: string,
	data: string,
	signature: string
): Promise<{ txHash: string }> {
	d.log('postToRelay', { relayBaseUrl, sender: sender.slice(0, 10) + '...' });
	const response = await fetch(`${relayBaseUrl}/relay`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ sender, data, signature })
	});

	const json = (await response.json()) as { txHash?: string } & RelayErrorResponse;

	if (response.status === 202 && json.txHash) {
		d.log('postToRelay success', { txHash: json.txHash.slice(0, 18) + '...' });
		return { txHash: json.txHash };
	}

	const msg = json.message || json.error || `Relay returned ${response.status}`;
	d.warn('postToRelay failed', { status: response.status, error: msg });
	throw new Error(msg);
}

/**
 * Poll for transaction receipt.
 */
export async function pollForReceipt(
	provider: JsonRpcProvider,
	txHash: string
): Promise<TransactionReceipt | null> {
	d.log('pollForReceipt start', { txHash: txHash.slice(0, 18) + '...' });
	for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
		const receipt = await provider.getTransactionReceipt(txHash);
		if (receipt && receipt.blockNumber) {
			d.log('pollForReceipt confirmed', {
				txHash: txHash.slice(0, 18) + '...',
				blockNumber: receipt.blockNumber
			});
			return receipt;
		}
		if (i > 0 && i % 6 === 0) {
			d.log('pollForReceipt waiting', { attempt: i, txHash: txHash.slice(0, 18) + '...' });
		}
		await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
	}
	d.warn('pollForReceipt timeout', {
		txHash: txHash.slice(0, 18) + '...',
		attempts: POLL_MAX_ATTEMPTS
	});
	return null;
}

/**
 * Execute a write via relay (gasless) or direct, with fallback.
 * Tries relay first when useGasless is true; falls back to direct on relay failure.
 * createPaymentContract is always direct (payable).
 */
export async function submitEscrowWrite(params: {
	contract: Contract;
	wallet: Wallet;
	provider: JsonRpcProvider;
	method: string;
	args: unknown[];
	value?: bigint;
	relayBaseUrl?: string;
	useGasless?: boolean;
	contractAddress: string;
}): Promise<EscrowWriteResult> {
	const {
		contract,
		wallet,
		provider,
		method,
		args,
		value,
		relayBaseUrl,
		useGasless = true,
		contractAddress: _contractAddress
	} = params;

	// Always direct for payable (createPaymentContract)
	const isPayable = method === 'createPaymentContract';
	if (isPayable || !useGasless || !relayBaseUrl) {
		d.log('submitEscrowWrite using direct', {
			method,
			reason: isPayable ? 'payable' : !useGasless ? 'useGasless=false' : 'no relay URL'
		});
		return executeDirect(contract, method, args, value, provider);
	}

	d.log('submitEscrowWrite trying relay', { method, args: args.map(String).slice(0, 2) });

	// Try relay with retries on 5xx / network
	let lastError: Error | null = null;
	for (let attempt = 0; attempt < RELAY_RETRY_ATTEMPTS; attempt++) {
		try {
			d.log('submitEscrowWrite relay attempt', {
				attempt: attempt + 1,
				maxAttempts: RELAY_RETRY_ATTEMPTS
			});
			const info = await fetchRelayInfo(relayBaseUrl);
			const { sender, data, signature } = await buildMetaTransaction(
				wallet,
				info.securePaymentAddress,
				info.chainId,
				contract.interface,
				method,
				args
			);
			const { txHash } = await postToRelay(relayBaseUrl, sender, data, signature);
			d.log('submitEscrowWrite relay success', { method, txHash: txHash.slice(0, 18) + '...' });
			return {
				hash: txHash,
				wait: () => pollForReceipt(provider, txHash)
			};
		} catch (err) {
			lastError = err instanceof Error ? err : new Error(String(err));
			const msg = lastError.message;
			d.warn('submitEscrowWrite relay attempt failed', { attempt: attempt + 1, message: msg });
			// Do not retry 4xx (SIMULATION_FAILED, etc.)
			if (msg.includes('400') || msg.includes('SIMULATION_FAILED') || msg.includes('Invalid')) {
				d.log('submitEscrowWrite no retry (4xx/simulation)');
				break;
			}
			if (attempt < RELAY_RETRY_ATTEMPTS - 1) {
				const delay = RELAY_RETRY_DELAY_MS * (attempt + 1);
				d.log('submitEscrowWrite retry after delay', { delayMs: delay });
				await new Promise((r) => setTimeout(r, delay));
			}
		}
	}

	// Fallback to direct
	d.warn('submitEscrowWrite falling back to direct', { method, lastError: lastError?.message });
	return executeDirect(contract, method, args, value, provider);
}

/**
 * Execute transaction directly (user pays gas).
 */
async function executeDirect(
	contract: Contract,
	method: string,
	args: unknown[],
	value: bigint | undefined,
	provider: JsonRpcProvider
): Promise<EscrowWriteResult> {
	d.log('executeDirect', { method });
	const feeData = await provider.getFeeData();
	const gasPrice = feeData.gasPrice || 0n;

	const txOptions: { gasLimit?: bigint; gasPrice: bigint; value?: bigint } = { gasPrice };
	if (value !== undefined) {
		txOptions.value = value;
	}

	let gasEstimate: bigint;
	try {
		gasEstimate = await (
			contract[method] as { estimateGas: (...a: unknown[]) => Promise<bigint> }
		).estimateGas(...args, txOptions);
	} catch {
		d.warn('executeDirect estimateGas failed, using default', { method });
		gasEstimate = 300000n;
	}

	txOptions.gasLimit = gasEstimate + gasEstimate / 10n;

	const tx = await (contract[method] as (...a: unknown[]) => Promise<ethers.TransactionResponse>)(
		...args,
		txOptions
	);

	d.log('executeDirect sent', { method, hash: tx.hash.slice(0, 18) + '...' });
	return {
		hash: tx.hash,
		wait: () => tx.wait()
	};
}
