import {
	type FeeTier,
	type RSKNetwork,
	type GasEstimation,
	FEE_TIERS
} from '@bittasker/wallet-core';
import type { ContractTransactionResult, EscrowData } from '$lib/types/wallet';
import type { EscrowError } from '$lib/utils/helpers/escrowErrors';
import type { Attachment } from '$lib/types/task';
import { t } from 'svelte-i18n';
import { get } from 'svelte/store';
import { appStore } from '$lib/stores/app.store';
import { ethers, type JsonRpcProvider } from 'ethers';
import { EscrowStatus, mapBlockchainStateToEnum } from './escrow.enum';
import { getProvider, getWallet } from '$lib/stores/wallet.store';
import * as EscrowNostrEvent from './escrowEvents';
import { submitEscrowWrite } from '../relayClient';
import { createDebug } from '$lib/utils/debug';
import escrowABI from './abi.json';

const d = createDebug('escrow:v2');
const getRelayBaseUrl = (): string | undefined =>
	typeof import.meta.env.VITE_RELAY_URL === 'string' ? import.meta.env.VITE_RELAY_URL : undefined;

let contract: ethers.Contract | null = null;
const legacyContracts = new Map<string, ethers.Contract>();

export function resetCachedContract(): void {
	contract = null;
	legacyContracts.clear();
}

const getRSKWallet = () => getWallet('rsk');
const getRSKProvider = () => getProvider('rsk');

function getDefaultContractAddress(): string | undefined {
	const network: RSKNetwork = import.meta.env.VITE_RSK_NETWORK || 'testnet';
	return network === 'mainnet'
		? import.meta.env.VITE_RSK_CONTRACT_ADDRESS_V2_MAINNET
		: import.meta.env.VITE_RSK_CONTRACT_ADDRESS_V2_TESTNET;
}

export async function ensureEscrowReady(
	contractAddress?: string,
	requireBalance: boolean = true
): Promise<{
	contract: ethers.Contract;
	wallet: ethers.Wallet;
	provider: ethers.JsonRpcProvider;
}> {
	d.log('ensureEscrowReady', { contractAddress: contractAddress ?? 'default', requireBalance });
	let wallet = getRSKWallet();
	if (!wallet) {
		try {
			const { walletManager } = await import('$lib/stores/wallet.store');
			await walletManager.initialize();
			wallet = getRSKWallet();
			if (!wallet) throw new Error('Failed to initialize wallet');
		} catch {
			throw new Error('Failed to initialize wallet');
		}
	}

	let provider = getRSKProvider();
	if (!provider) {
		try {
			const { walletManager } = await import('$lib/stores/wallet.store');
			await walletManager.initialize();
			provider = getRSKProvider();
			if (!provider) throw new Error('Failed to get provider');
		} catch {
			throw new Error('Failed to get provider');
		}
	} else {
		const providerWithDestroyed = provider as JsonRpcProvider & {
			_destroyed?: boolean;
			destroyed?: boolean;
		};
		if (providerWithDestroyed._destroyed || providerWithDestroyed.destroyed) {
			try {
				const { walletManager } = await import('$lib/stores/wallet.store');
				await walletManager.initialize();
				provider = getRSKProvider();
				if (!provider) throw new Error('Failed to get provider after reinitialization');
			} catch {
				throw new Error('Failed to get provider after reinitialization');
			}
		}
	}

	let targetContract: ethers.Contract;

	if (!contractAddress) {
		if (!contract) {
			await connectToEscrowContract();
			if (!contract) throw new Error('Failed to connect to contract');
		}
		targetContract = contract;
	} else {
		const defaultAddress = getDefaultContractAddress();
		if (contractAddress.toLowerCase() === defaultAddress?.toLowerCase()) {
			if (!contract) {
				await connectToEscrowContract();
				if (!contract) throw new Error('Failed to connect to contract');
			}
			targetContract = contract;
		} else {
			const normalizedAddress = contractAddress.toLowerCase();
			if (legacyContracts.has(normalizedAddress)) {
				targetContract = legacyContracts.get(normalizedAddress)!;
			} else {
				try {
					const checksummedAddress = ethers.getAddress(contractAddress.toLowerCase());
					targetContract = new ethers.Contract(checksummedAddress, escrowABI, wallet);
					legacyContracts.set(normalizedAddress, targetContract);
				} catch (error) {
					throw new Error(
						`Failed to connect to contract at ${contractAddress}: ${error instanceof Error ? error.message : 'Unknown error'}`
					);
				}
			}
		}
	}

	if (requireBalance) {
		const balance = await provider.getBalance(wallet.address);
		if (balance === 0n) {
			throw new Error(
				'Insufficient balance. Please fund your wallet with RBTC to pay for transaction fees.'
			);
		}
	}

	d.log('ensureEscrowReady done', { hasContract: !!targetContract });
	return { contract: targetContract, wallet, provider };
}

async function connectToEscrowContract(): Promise<void> {
	d.log('connectToEscrowContract');
	const wallet = getRSKWallet();
	const provider = getRSKProvider();

	if (!wallet || !provider) {
		throw new Error('RSK wallet not initialized. Please connect your wallet first.');
	}

	if (!wallet.address) {
		throw new Error('Wallet address not available. Please ensure wallet is properly connected.');
	}

	try {
		const network: RSKNetwork = import.meta.env.VITE_RSK_NETWORK;
		const contractAddress = getDefaultContractAddress();

		if (!contractAddress) {
			throw new Error(`V2 contract address not configured for ${network}.`);
		}

		d.log('connectToEscrowContract V2', {
			network,
			contractAddress: contractAddress.slice(0, 10) + '...'
		});

		const checksummedAddress = ethers.getAddress(contractAddress.toLowerCase());
		contract = new ethers.Contract(checksummedAddress, escrowABI, wallet);
		d.log('connectToEscrowContract done');
	} catch (error) {
		throw new Error(
			`Failed to connect to V2 contract: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}
}

export function calculateFeeAmount(baseAmount: bigint, feeTier: FeeTier): bigint {
	const feePercentage = BigInt(FEE_TIERS[feeTier].percentage);
	return (baseAmount * feePercentage) / 10000n;
}

export function calculateTotalPayment(baseAmount: bigint, clientFeeTier: FeeTier): bigint {
	const clientFee = calculateFeeAmount(baseAmount, clientFeeTier);
	return baseAmount + clientFee;
}

async function loadEscrowDetails(escrowId: string, contractAddress?: string): Promise<EscrowData> {
	d.log('loadEscrowDetails', { escrowId, contractAddress: contractAddress ?? 'default' });
	const MAX_RETRIES = 2;
	let lastError: Error | null = null;

	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		try {
			const { contract: targetContract } = await ensureEscrowReady(contractAddress, false);

			if (!targetContract) throw new Error('Contract not found');

			const paymentData = await targetContract.getPaymentContract(escrowId);

			const escrow: EscrowData = {
				id: escrowId,
				client: paymentData.tasker?.toLowerCase() || '',
				freelancer: paymentData.taskee?.toLowerCase() || '',
				baseAmount: ethers.formatEther(paymentData.amount),
				clientFee: '0',
				freelancerFee: '0',
				totalAmount: ethers.formatEther(paymentData.amount),
				status: mapBlockchainStateToEnum(Number(paymentData.state)),
				estimatedStartTime: Number(paymentData.estimatedStartTime),
				estimatedCompletionTime: Number(paymentData.estimatedCompletionTime),
				completionTime: 0,
				timelockExpiry: Number(paymentData.timelockEnd),
				clientFeeTier: Number(paymentData.taskerFeeTier) as FeeTier,
				freelancerFeeTier: Number(paymentData.taskeeFeeTier) as FeeTier,
				createdAt: Number(paymentData.createdAt) * 1000,
				lastUpdated: Date.now(),
				noShowMarked: Boolean(paymentData.noShowMarked)
			};

			return escrow;
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));
			const errorMessage = lastError.message;
			const isProviderError =
				errorMessage.includes('provider') ||
				errorMessage.includes('Failed to get provider') ||
				errorMessage.includes('provider destroyed');

			if (isProviderError && attempt < MAX_RETRIES) {
				resetCachedContract();
				await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
				continue;
			}

			throw new Error(`Failed to load escrow details for ID ${escrowId}: ${errorMessage}`);
		}
	}

	if (lastError) throw lastError;
	throw new Error(`Failed to load escrow details for ID ${escrowId}: Unknown error`);
}

async function createEscrow(
	freelancerAddress: string,
	baseAmount: string,
	estimatedStartTime: number,
	estimatedCompletionTime: number,
	clientFeeTier: FeeTier,
	freelancerFeeTier: FeeTier,
	cancellationFee: bigint = 0n,
	upfrontDeposit: bigint = 0n
): Promise<ContractTransactionResult> {
	d.log('createEscrow start', {
		baseAmount,
		estimatedStartTime,
		estimatedCompletionTime,
		freelancerAddressPrefix: freelancerAddress.slice(0, 10) + '...'
	});
	try {
		const { contract, provider, wallet } = await ensureEscrowReady();

		const freelancerAddressEip55 = ethers.getAddress(freelancerAddress.toLowerCase());
		const baseAmountWei = ethers.parseEther(baseAmount);
		const totalPayment = calculateTotalPayment(baseAmountWei, clientFeeTier);

		const feeDataForEstimate = await provider.getFeeData();
		const gasPriceForEstimate = feeDataForEstimate.gasPrice || 0n;

		const gasEstimate = await contract.createPaymentContract.estimateGas(
			freelancerAddressEip55,
			estimatedStartTime,
			estimatedCompletionTime,
			clientFeeTier,
			freelancerFeeTier,
			cancellationFee,
			upfrontDeposit,
			{ value: totalPayment, gasPrice: gasPriceForEstimate }
		);

		const feeDataForTx = await provider.getFeeData();
		const gasPriceForTx = feeDataForTx.gasPrice || 0n;

		const tx = await contract.createPaymentContract(
			freelancerAddressEip55,
			estimatedStartTime,
			estimatedCompletionTime,
			clientFeeTier,
			freelancerFeeTier,
			cancellationFee,
			upfrontDeposit,
			{
				value: totalPayment,
				gasLimit: gasEstimate + gasEstimate / 10n,
				gasPrice: gasPriceForTx
			}
		);

		const result: ContractTransactionResult = {
			hash: tx.hash,
			status: 'pending'
		};

		d.log('createEscrow tx broadcast (direct, payable)', { hash: tx.hash.slice(0, 18) + '...' });

		const TX_WAIT_TIMEOUT = 5 * 60 * 1000;
		Promise.race([
			tx.wait(),
			new Promise<null>((_, reject) =>
				setTimeout(
					() => reject(new Error('Transaction wait timeout after 5 minutes')),
					TX_WAIT_TIMEOUT
				)
			)
		])
			.then(async (receipt: ethers.TransactionReceipt | null) => {
				if (receipt) {
					result.status = 'confirmed';
					result.gasUsed = receipt.gasUsed.toString();

					try {
						if (!contract) {
							console.error('[V2] Contract is null, cannot parse events');
							return;
						}

						const paymentContractCreatedEvent = receipt.logs.find((log) => {
							try {
								const parsedLog = contract.interface.parseLog({
									topics: log.topics,
									data: log.data
								});
								return parsedLog?.name === 'PaymentContractCreated';
							} catch {
								return false;
							}
						});

						if (paymentContractCreatedEvent) {
							const parsedLog = contract.interface.parseLog({
								topics: paymentContractCreatedEvent.topics,
								data: paymentContractCreatedEvent.data
							});

							if (parsedLog) {
								const escrowId = parsedLog.args[0].toString();
								result.escrowId = escrowId;

								d.log('createEscrow PaymentContractCreated confirmed, triggering Nostr publish', {
									escrowId,
									txHash: receipt.hash.slice(0, 18) + '...'
								});

								await EscrowNostrEvent.handleEscrowCreated({
									escrowId,
									transactionHash: receipt.hash,
									client: wallet.address,
									freelancer: freelancerAddressEip55,
									amount: totalPayment.toString()
								});
							}
						} else {
							console.warn('[V2] PaymentContractCreated event not found in transaction receipt');
							EscrowNostrEvent.cleanupPendingContractByTxHash(receipt.hash);
							appStore.showErrorToast(
								'Escrow transaction succeeded, but PaymentContractCreated event was not found.'
							);
						}
					} catch (error) {
						console.error('[V2] Failed to extract escrow ID from receipt:', error);
						EscrowNostrEvent.cleanupPendingContractByTxHash(receipt.hash);
					}
				} else {
					result.status = 'failed';
					console.error('[V2] Transaction receipt is null');
					if (result.hash) {
						EscrowNostrEvent.cleanupPendingContractByTxHash(result.hash);
					}
				}
			})
			.catch((error: unknown) => {
				console.error('[V2] Transaction failed or timed out:', error);
				result.status = 'failed';
				if (result.hash) {
					EscrowNostrEvent.cleanupPendingContractByTxHash(result.hash);
				}
			});

		return result;
	} catch (error) {
		throw new Error(
			`Failed to create escrow: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}
}

async function completeTask(
	escrowId: string,
	contractEventId?: string,
	completionAttachments?: Attachment[]
): Promise<ContractTransactionResult> {
	d.log('completeTask start', { escrowId, contractEventId, useGasless: !!getRelayBaseUrl() });
	try {
		const { contract, wallet, provider } = await ensureEscrowReady(undefined, false);

		const { hash, wait } = await submitEscrowWrite({
			contract,
			wallet,
			provider,
			method: 'completeTask',
			args: [escrowId],
			contractAddress: await contract.getAddress(),
			relayBaseUrl: getRelayBaseUrl(),
			useGasless: true
		});

		d.log('completeTask submitEscrowWrite returned', {
			escrowId,
			hash: hash.slice(0, 18) + '...'
		});

		const result: ContractTransactionResult = { hash, escrowId, status: 'pending' };

		if (contractEventId) {
			await EscrowNostrEvent.publishEscrowStatus({
				escrowId,
				contractEventId,
				transactionHash: hash,
				status: EscrowStatus.PendingCompletion,
				completionAttachments
			});
		}

		wait()
			.then(async (receipt: ethers.TransactionReceipt | null) => {
				if (receipt) {
					result.status = 'confirmed';
					result.gasUsed = receipt.gasUsed.toString();
					d.log('completeTask confirmed', { escrowId, txHash: receipt.hash.slice(0, 18) + '...' });
					if (contractEventId) {
						await EscrowNostrEvent.publishEscrowStatus({
							escrowId,
							contractEventId,
							transactionHash: receipt.hash,
							status: EscrowStatus.Completed,
							completionAttachments
						});
					}
				} else {
					result.status = 'failed';
					d.warn('completeTask receipt null');
					appStore.showErrorToast(get(t)('dashboard.contracts.actions.task_completed_error'));
				}
			})
			.catch((error: unknown) => {
				d.error('completeTask wait failed', { escrowId, error });
				console.error('[V2] Task completion transaction failed:', error);
				result.status = 'failed';
				appStore.showErrorToast(get(t)('dashboard.contracts.actions.task_completed_error'));
			});

		return result;
	} catch (error) {
		d.error('completeTask failed', { escrowId, error });
		throw new Error(
			`Failed to complete task: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}
}

async function acceptTask(
	escrowId: string,
	contractEventId?: string,
	options?: { onConfirmed?: () => Promise<void> }
): Promise<ContractTransactionResult> {
	d.log('acceptTask start', { escrowId, contractEventId, useGasless: !!getRelayBaseUrl() });
	try {
		const { contract, wallet, provider } = await ensureEscrowReady(undefined, false);

		const { hash, wait } = await submitEscrowWrite({
			contract,
			wallet,
			provider,
			method: 'acceptTask',
			args: [escrowId],
			contractAddress: await contract.getAddress(),
			relayBaseUrl: getRelayBaseUrl(),
			useGasless: true
		});

		d.log('acceptTask submitEscrowWrite returned', {
			escrowId,
			hash: hash.slice(0, 18) + '...'
		});

		const result: ContractTransactionResult = { hash, escrowId, status: 'pending' };

		if (contractEventId) {
			await EscrowNostrEvent.publishEscrowStatus({
				escrowId,
				contractEventId,
				transactionHash: hash,
				status: EscrowStatus.PendingAcceptance
			});
		}

		wait()
			.then(async (receipt: ethers.TransactionReceipt | null) => {
				if (receipt) {
					result.status = 'confirmed';
					result.gasUsed = receipt.gasUsed.toString();
					d.log('acceptTask confirmed', { escrowId, txHash: receipt.hash.slice(0, 18) + '...' });
					if (contractEventId) {
						await EscrowNostrEvent.publishEscrowStatus({
							escrowId,
							contractEventId,
							transactionHash: receipt.hash,
							status: EscrowStatus.FundsReleased
						});
					}
					// Task status update to COMPLETED (Nostr after chain confirmation)
					try {
						await options?.onConfirmed?.();
					} catch (err) {
						d.error('acceptTask onConfirmed failed', { escrowId, error: err });
					}
				} else {
					result.status = 'failed';
					d.warn('acceptTask receipt null');
					appStore.showErrorToast(get(t)('dashboard.contracts.actions.payment_released_error'));
				}
			})
			.catch((error: unknown) => {
				d.error('acceptTask wait failed', { escrowId, error });
				console.error('[V2] Task acceptance transaction failed:', error);
				result.status = 'failed';
				appStore.showErrorToast(get(t)('dashboard.contracts.actions.payment_released_error'));
			});

		return result;
	} catch (error) {
		d.error('acceptTask failed', { escrowId, error });
		throw new Error(
			`Failed to accept task: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}
}

async function cancelEscrow(
	escrowId: string,
	contractEventId?: string
): Promise<ContractTransactionResult> {
	try {
		const { contract, wallet, provider } = await ensureEscrowReady(undefined, false);

		const { hash, wait } = await submitEscrowWrite({
			contract,
			wallet,
			provider,
			method: 'cancelPaymentContract',
			args: [escrowId],
			contractAddress: await contract.getAddress(),
			relayBaseUrl: getRelayBaseUrl(),
			useGasless: true
		});

		const result: ContractTransactionResult = { hash, escrowId, status: 'pending' };

		if (contractEventId) {
			await EscrowNostrEvent.publishEscrowStatus({
				escrowId,
				contractEventId,
				transactionHash: hash,
				status: EscrowStatus.PendingCancellation
			});
		}

		wait()
			.then(async (receipt: ethers.TransactionReceipt | null) => {
				if (receipt) {
					result.status = 'confirmed';
					result.gasUsed = receipt.gasUsed.toString();
					if (contractEventId) {
						await EscrowNostrEvent.publishEscrowStatus({
							escrowId,
							contractEventId,
							transactionHash: receipt.hash,
							status: EscrowStatus.Cancelled
						});
					}
				} else {
					result.status = 'failed';
					appStore.showErrorToast(get(t)('dashboard.contracts.actions.escrow_cancelled_error'));
				}
			})
			.catch((error: unknown) => {
				console.error('[V2] Escrow cancellation transaction failed:', error);
				result.status = 'failed';
				appStore.showErrorToast(get(t)('dashboard.contracts.actions.escrow_cancelled_error'));
			});

		return result;
	} catch (error) {
		throw new Error(
			`Failed to cancel escrow: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}
}

async function disputeTask(
	escrowId: string,
	contractEventId?: string
): Promise<ContractTransactionResult> {
	try {
		const { contract, wallet, provider } = await ensureEscrowReady(undefined, false);

		const { hash, wait } = await submitEscrowWrite({
			contract,
			wallet,
			provider,
			method: 'disputeTask',
			args: [escrowId],
			contractAddress: await contract.getAddress(),
			relayBaseUrl: getRelayBaseUrl(),
			useGasless: true
		});

		const result: ContractTransactionResult = { hash, escrowId, status: 'pending' };

		if (contractEventId) {
			await EscrowNostrEvent.publishEscrowStatus({
				escrowId,
				contractEventId,
				transactionHash: hash,
				status: EscrowStatus.PendingDispute
			});
		}

		wait()
			.then(async (receipt: ethers.TransactionReceipt | null) => {
				if (receipt) {
					result.status = 'confirmed';
					result.gasUsed = receipt.gasUsed.toString();
					if (contractEventId) {
						await EscrowNostrEvent.publishEscrowStatus({
							escrowId,
							contractEventId,
							transactionHash: receipt.hash,
							status: EscrowStatus.InDispute
						});
					}
				} else {
					result.status = 'failed';
					appStore.showErrorToast(get(t)('dashboard.contracts.actions.dispute_raised_error'));
				}
			})
			.catch((error: unknown) => {
				console.error('[V2] Task dispute transaction failed:', error);
				result.status = 'failed';
				appStore.showErrorToast(get(t)('dashboard.contracts.actions.dispute_raised_error'));
			});

		return result;
	} catch (error) {
		throw new Error(
			`Failed to dispute task: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}
}

async function proposeResolution(
	escrowId: string,
	freelancerAmount: string,
	contractEventId?: string,
	proposedClientAmount?: string,
	proposedFreelancerAmount?: string
): Promise<ContractTransactionResult> {
	try {
		const { contract, wallet, provider } = await ensureEscrowReady(undefined, false);

		// V2 uses uint72 for freelancerAmount. parseEther returns bigint; truncate to uint72 max.
		const freelancerAmountWei = ethers.parseEther(freelancerAmount);
		const uint72Max = (1n << 72n) - 1n;
		const safeFreelancerAmount = freelancerAmountWei > uint72Max ? uint72Max : freelancerAmountWei;

		const { hash, wait } = await submitEscrowWrite({
			contract,
			wallet,
			provider,
			method: 'proposeResolution',
			args: [escrowId, safeFreelancerAmount],
			contractAddress: await contract.getAddress(),
			relayBaseUrl: getRelayBaseUrl(),
			useGasless: true
		});

		const result: ContractTransactionResult = { hash, escrowId, status: 'pending' };

		if (contractEventId && proposedClientAmount && proposedFreelancerAmount) {
			await EscrowNostrEvent.publishEscrowStatus({
				escrowId,
				contractEventId,
				transactionHash: hash,
				status: EscrowStatus.PendingResolutionProposal,
				proposedClientAmount,
				proposedFreelancerAmount
			});
		}

		wait()
			.then(async (receipt: ethers.TransactionReceipt | null) => {
				if (receipt) {
					result.status = 'confirmed';
					result.gasUsed = receipt.gasUsed.toString();
					if (contractEventId && proposedClientAmount && proposedFreelancerAmount) {
						await EscrowNostrEvent.publishEscrowStatus({
							escrowId,
							contractEventId,
							transactionHash: receipt.hash,
							status: EscrowStatus.DisputeResolutionProposed,
							proposedClientAmount,
							proposedFreelancerAmount
						});
					}
				} else {
					result.status = 'failed';
					appStore.showErrorToast(get(t)('dashboard.contracts.actions.resolution_proposed_error'));
				}
			})
			.catch((error: unknown) => {
				console.error('[V2] Resolution proposal transaction failed:', error);
				result.status = 'failed';
				appStore.showErrorToast(get(t)('dashboard.contracts.actions.resolution_proposed_error'));
			});

		return result;
	} catch (error) {
		throw new Error(
			`Failed to propose resolution: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}
}

async function acceptProposal(
	escrowId: string,
	contractEventId?: string
): Promise<ContractTransactionResult> {
	try {
		const { contract, wallet, provider } = await ensureEscrowReady(undefined, false);

		const { hash, wait } = await submitEscrowWrite({
			contract,
			wallet,
			provider,
			method: 'acceptProposal',
			args: [escrowId],
			contractAddress: await contract.getAddress(),
			relayBaseUrl: getRelayBaseUrl(),
			useGasless: true
		});

		const result: ContractTransactionResult = { hash, escrowId, status: 'pending' };

		if (contractEventId) {
			await EscrowNostrEvent.publishEscrowStatus({
				escrowId,
				contractEventId,
				transactionHash: hash,
				status: EscrowStatus.PendingProposalAcceptance
			});
		}

		wait()
			.then(async (receipt: ethers.TransactionReceipt | null) => {
				if (receipt) {
					result.status = 'confirmed';
					result.gasUsed = receipt.gasUsed.toString();
					if (contractEventId) {
						await EscrowNostrEvent.publishEscrowStatus({
							escrowId,
							contractEventId,
							transactionHash: receipt.hash,
							status: EscrowStatus.DisputeResolved
						});
					}
				} else {
					result.status = 'failed';
					appStore.showErrorToast(get(t)('dashboard.contracts.actions.proposal_accepted_error'));
				}
			})
			.catch((error: unknown) => {
				console.error('[V2] Proposal acceptance transaction failed:', error);
				result.status = 'failed';
				appStore.showErrorToast(get(t)('dashboard.contracts.actions.proposal_accepted_error'));
			});

		return result;
	} catch (error) {
		throw new Error(
			`Failed to accept proposal: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}
}

async function resolveAfterTimelock(
	escrowId: string,
	escrowStatus: number,
	contractEventId?: string
): Promise<ContractTransactionResult> {
	try {
		const { contract, wallet, provider } = await ensureEscrowReady(undefined, false);

		const { hash, wait } = await submitEscrowWrite({
			contract,
			wallet,
			provider,
			method: 'resolveAfterTimelock',
			args: [escrowId],
			contractAddress: await contract.getAddress(),
			relayBaseUrl: getRelayBaseUrl(),
			useGasless: true
		});

		const result: ContractTransactionResult = { hash, escrowId, status: 'pending' };

		if (contractEventId) {
			await EscrowNostrEvent.publishEscrowStatus({
				escrowId,
				contractEventId,
				transactionHash: hash,
				status: EscrowStatus.PendingTimelockResolution
			});
		}

		appStore.showInfoToast(get(t)('dashboard.contracts.actions.timelock_resolving_message'));

		wait()
			.then(async (receipt: ethers.TransactionReceipt | null) => {
				if (receipt) {
					result.status = 'confirmed';
					result.gasUsed = receipt.gasUsed.toString();

					if (contractEventId) {
						// Use StateTransition event from receipt to determine final status reliably.
						// Falls back to pre-call status if event parsing fails.
						const finalStatus = extractFinalStateFromReceipt(receipt, contract, escrowStatus);

						await EscrowNostrEvent.publishEscrowStatus({
							escrowId,
							contractEventId,
							transactionHash: receipt.hash,
							status: finalStatus
						});
					}
				} else {
					result.status = 'failed';
					appStore.showErrorToast(get(t)('dashboard.contracts.actions.timelock_resolved_error'));
				}
			})
			.catch((error: unknown) => {
				console.error('[V2] Timelock resolution transaction failed:', error);
				result.status = 'failed';
				appStore.showErrorToast(get(t)('dashboard.contracts.actions.timelock_resolved_error'));
			});

		return result;
	} catch (error) {
		throw new Error(
			`Failed to resolve after timelock: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}
}

/**
 * Extracts the final EscrowStatus from a StateTransition event in a V2 transaction receipt.
 * Falls back to inference from the pre-transaction status if parsing fails.
 */
function extractFinalStateFromReceipt(
	receipt: ethers.TransactionReceipt,
	contractInstance: ethers.Contract,
	priorStatus: number
): EscrowStatus {
	try {
		for (const log of receipt.logs) {
			const parsed = contractInstance.interface.parseLog({
				topics: log.topics,
				data: log.data
			});
			if (parsed?.name === 'StateTransition') {
				return mapBlockchainStateToEnum(Number(parsed.args.toState));
			}
		}
	} catch {
		// Fall through to inference
	}

	// Inference fallback based on prior status
	if (priorStatus === EscrowStatus.Completed) return EscrowStatus.FundsClaimed;
	if (priorStatus === EscrowStatus.InDispute) return EscrowStatus.DisputeUnresolved;
	return EscrowStatus.DisputeUnresolved;
}

async function markNoShow(
	escrowId: string,
	contractAddress?: string
): Promise<ContractTransactionResult> {
	try {
		const { contract, wallet, provider } = await ensureEscrowReady(contractAddress, false);

		const { hash, wait } = await submitEscrowWrite({
			contract,
			wallet,
			provider,
			method: 'markNoShow',
			args: [escrowId],
			contractAddress: await contract.getAddress(),
			relayBaseUrl: getRelayBaseUrl(),
			useGasless: true
		});

		const result: ContractTransactionResult = { hash, escrowId, status: 'pending' };

		wait()
			.then(async (receipt: ethers.TransactionReceipt | null) => {
				if (receipt) {
					result.status = 'confirmed';
					result.gasUsed = receipt.gasUsed.toString();
				} else {
					result.status = 'failed';
					appStore.showErrorToast(get(t)('dashboard.contracts.errors.no_show_marked_error'));
				}
			})
			.catch((error: unknown) => {
				console.error('[V2] markNoShow transaction failed:', error);
				result.status = 'failed';
				appStore.showErrorToast(get(t)('dashboard.contracts.errors.no_show_marked_error'));
			});

		return result;
	} catch (error) {
		throw new Error(
			`Failed to mark no-show: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}
}

async function markWorkInProgress(
	escrowId: string,
	contractAddress?: string
): Promise<ContractTransactionResult> {
	try {
		const { contract, wallet, provider } = await ensureEscrowReady(contractAddress, false);

		const { hash, wait } = await submitEscrowWrite({
			contract,
			wallet,
			provider,
			method: 'markWorkInProgress',
			args: [escrowId],
			contractAddress: await contract.getAddress(),
			relayBaseUrl: getRelayBaseUrl(),
			useGasless: true
		});

		const result: ContractTransactionResult = { hash, escrowId, status: 'pending' };

		wait()
			.then(async (receipt: ethers.TransactionReceipt | null) => {
				if (receipt) {
					result.status = 'confirmed';
					result.gasUsed = receipt.gasUsed.toString();
				} else {
					result.status = 'failed';
					appStore.showErrorToast(get(t)('dashboard.contracts.errors.work_in_progress_error'));
				}
			})
			.catch((error: unknown) => {
				console.error('[V2] markWorkInProgress transaction failed:', error);
				result.status = 'failed';
				appStore.showErrorToast(get(t)('dashboard.contracts.errors.work_in_progress_error'));
			});

		return result;
	} catch (error) {
		throw new Error(
			`Failed to mark work in progress: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}
}

async function claimNoShowRefund(
	escrowId: string,
	contractAddress?: string
): Promise<ContractTransactionResult> {
	try {
		const { contract, wallet, provider } = await ensureEscrowReady(contractAddress, false);

		const { hash, wait } = await submitEscrowWrite({
			contract,
			wallet,
			provider,
			method: 'claimNoShowRefund',
			args: [escrowId],
			contractAddress: await contract.getAddress(),
			relayBaseUrl: getRelayBaseUrl(),
			useGasless: true
		});

		const result: ContractTransactionResult = { hash, escrowId, status: 'pending' };

		wait()
			.then(async (receipt: ethers.TransactionReceipt | null) => {
				if (receipt) {
					result.status = 'confirmed';
					result.gasUsed = receipt.gasUsed.toString();
				} else {
					result.status = 'failed';
					appStore.showErrorToast(get(t)('dashboard.contracts.errors.no_show_refund_error'));
				}
			})
			.catch((error: unknown) => {
				console.error('[V2] claimNoShowRefund transaction failed:', error);
				result.status = 'failed';
				appStore.showErrorToast(get(t)('dashboard.contracts.errors.no_show_refund_error'));
			});

		return result;
	} catch (error) {
		throw new Error(
			`Failed to claim no-show refund: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}
}

async function claimUpfrontDeposit(
	escrowId: string,
	contractAddress?: string
): Promise<ContractTransactionResult> {
	try {
		const { contract, wallet, provider } = await ensureEscrowReady(contractAddress, false);

		const { hash, wait } = await submitEscrowWrite({
			contract,
			wallet,
			provider,
			method: 'claimUpfrontDeposit',
			args: [escrowId],
			contractAddress: await contract.getAddress(),
			relayBaseUrl: getRelayBaseUrl(),
			useGasless: true
		});

		const result: ContractTransactionResult = { hash, escrowId, status: 'pending' };

		wait()
			.then(async (receipt: ethers.TransactionReceipt | null) => {
				if (receipt) {
					result.status = 'confirmed';
					result.gasUsed = receipt.gasUsed.toString();
				} else {
					result.status = 'failed';
					appStore.showErrorToast(get(t)('dashboard.contracts.errors.upfront_deposit_error'));
				}
			})
			.catch((error: unknown) => {
				console.error('[V2] claimUpfrontDeposit transaction failed:', error);
				result.status = 'failed';
				appStore.showErrorToast(get(t)('dashboard.contracts.errors.upfront_deposit_error'));
			});

		return result;
	} catch (error) {
		throw new Error(
			`Failed to claim upfront deposit: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}
}

async function isContractPaused(): Promise<boolean> {
	try {
		const { contract } = await ensureEscrowReady(undefined, false);
		return await contract.paused();
	} catch (error) {
		console.error('[V2] Failed to check contract pause status:', error);
		return true;
	}
}

async function checkEscrowFundingStatus(escrowId: string): Promise<{
	wasFunded: boolean;
	escrowData: EscrowData | null;
	error?: EscrowError;
}> {
	const { createEscrowError, isEscrowNotFoundError } = await import(
		'$lib/utils/helpers/escrowErrors'
	);

	try {
		const escrowData = await loadEscrowDetails(escrowId);

		if (!escrowData) {
			return { wasFunded: false, escrowData: null };
		}

		if (escrowData.status === EscrowStatus.Cancelled) {
			const amount = parseFloat(escrowData.baseAmount);
			return { wasFunded: amount > 0, escrowData };
		}

		return { wasFunded: true, escrowData };
	} catch (error) {
		if (isEscrowNotFoundError(error)) {
			return { wasFunded: false, escrowData: null };
		}

		const escrowError = createEscrowError(
			error,
			`Failed to check escrow funding status for ${escrowId}`
		);
		return {
			wasFunded: false,
			escrowData: null,
			error: escrowError as unknown as EscrowError
		};
	}
}

async function estimateContractGas(
	functionName: string,
	escrowId: string,
	...args: unknown[]
): Promise<GasEstimation> {
	const GAS_ESTIMATION_TIMEOUT_MS = 30000;

	try {
		const { contract, provider } = await ensureEscrowReady(undefined, false);

		const contractFunction = contract[functionName];
		if (!contractFunction) {
			throw new Error(`Function ${functionName} not found`);
		}

		const feeData = await provider.getFeeData();
		const gasPrice = feeData.gasPrice || 0n;

		let processedArgs: unknown[];
		if (functionName === 'proposeResolution' && args.length > 0) {
			const freelancerAmountWei = ethers.parseEther(String(args[0]));
			const uint72Max = (1n << 72n) - 1n;
			processedArgs = [freelancerAmountWei > uint72Max ? uint72Max : freelancerAmountWei];
		} else {
			processedArgs = args;
		}

		const gasEstimatePromise = contractFunction.estimateGas(escrowId, ...processedArgs, {
			gasPrice
		});

		const timeoutPromise = new Promise<never>((_, reject) => {
			setTimeout(() => {
				reject(new Error('Gas estimation timeout after 30 seconds'));
			}, GAS_ESTIMATION_TIMEOUT_MS);
		});

		const gasEstimate = await Promise.race([gasEstimatePromise, timeoutPromise]);
		const gasLimitWithBuffer = gasEstimate + gasEstimate / 10n;
		const totalCost = gasLimitWithBuffer * gasPrice;

		return {
			gasLimit: gasLimitWithBuffer.toString(),
			gasPrice: gasPrice.toString(),
			totalCost: totalCost.toString(),
			totalCostFormatted: ethers.formatEther(totalCost)
		};
	} catch (error) {
		if (error instanceof Error) {
			const wrappedError = new Error(`Gas estimation failed: ${error.message}`);
			if ('code' in error && typeof (error as { code: unknown }).code === 'string') {
				(wrappedError as { code?: unknown }).code = (error as { code: unknown }).code;
			}
			(wrappedError as { cause?: unknown }).cause = error;
			throw wrappedError;
		}
		throw new Error(
			`Gas estimation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}
}

export const escrow = {
	ensureEscrowReady,
	createEscrow,
	completeTask,
	acceptTask,
	cancelEscrow,
	disputeTask,
	proposeResolution,
	acceptProposal,
	resolveAfterTimelock,
	markNoShow,
	markWorkInProgress,
	claimNoShowRefund,
	claimUpfrontDeposit,
	estimateContractGas,
	loadEscrowDetails,
	isContractPaused,
	checkEscrowFundingStatus,
	resetCachedContract
};
