<script lang="ts">
	import type { EscrowData } from '$lib/types/wallet';
	import type { ContractPermissions } from '$lib/types/contract';
	import {
		getStatusColorClass,
		getStatusTranslationKey
	} from '$lib/utils/helpers/contractStatusFormatterV2';
	import { t } from 'svelte-i18n';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import IconOpenInNew from '~icons/mdi/open-in-new';
	import { estimateWrite } from '$lib/utils/contract/v1/blockchainWrites';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import { onMount, onDestroy } from 'svelte';
	import { ethers } from 'ethers';
	import { getRSKConfig } from '@bittasker/wallet-core';

	// Define error types for better type safety
	interface EthersError {
		code?: string;
		message?: string;
		cause?: unknown;
		reason?: unknown;
	}

	function isEthersError(error: unknown): error is EthersError {
		return typeof error === 'object' && error !== null && ('code' in error || 'message' in error);
	}

	const {
		contract,
		permissions,
		isClient,
		isFreelancer,
		isExpanded,
		safetyOverride,
		isExecuting = false,
		onToggleRawData,
		onExecuteFunction
	} = $props<{
		contract: EscrowData;
		permissions: ContractPermissions;
		isClient: boolean;
		isFreelancer: boolean;
		isExpanded: boolean;
		safetyOverride: boolean;
		isExecuting?: boolean;
		onToggleRawData: () => void;
		onExecuteFunction: (functionName: string, ...args: string[]) => Promise<void>;
	}>();

	// Modal state
	let showConfirmModal = $state(false);
	let pendingFunction = $state<{ name: string; args: string[] } | null>(null);
	let showResolutionForm = $state(false);
	let proposedFreelancerAmount = $state('');

	// Gas estimation state
	let btcPrice = $state<number>(0);
	let gasEstimates = $state<Map<string, number>>(new Map()); // Map of functionName -> USD cost
	let blockedFunctions = $state<Set<string>>(new Set()); // Functions that are blocked (contract revert)
	let unpredictableFunctions = $state<Set<string>>(new Set()); // Functions with unpredictable gas (UNPREDICTABLE_GAS_LIMIT)
	let estimatingGas = $state<Set<string>>(new Set()); // Functions currently being estimated
	let hasEstimatedGas = $state(false); // Track if initial gas estimation has been done
	let estimationAbortController = $state<AbortController | null>(null); // Abort controller for race condition prevention

	// Payment information state
	let paymentInfo = $state<{
		paidOut: boolean;
		recipient: 'client' | 'freelancer' | null;
		recipientAddress: string | null;
		amount: string | null;
		timestamp: number | null;
	} | null>(null);
	let checkingPayment = $state(false);

	// Check if contract has zero value or funds were released
	function hasZeroValue(): boolean {
		// If funds were paid out, consider it as zero value
		if (paymentInfo?.paidOut) {
			return true;
		}
		const baseAmount = parseFloat(contract.baseAmount || '0');
		return baseAmount === 0;
	}

	// Determine if function button should be disabled
	function isFunctionDisabled(functionName: string): boolean {
		// Always disable if contract value is zero or funds were released
		if (hasZeroValue()) return true;

		// If funds were paid out, disable all buttons (unless safety override)
		if (paymentInfo?.paidOut && !safetyOverride) {
			return true;
		}

		if (safetyOverride) return false; // Override enabled - all functions available (except zero value)

		// When safety override is OFF, base disabled state on gas estimation results
		// If gas estimation shows "Tx Blocked" (CALL_EXCEPTION with revert), the contract will revert - disable the button
		if (blockedFunctions.has(functionName)) {
			return true; // Contract will revert, disable button
		}

		// If we have a gas estimate (not blocked), allow the button
		// This means the contract will accept the transaction
		if (gasEstimates.has(functionName)) {
			return false; // Gas estimate succeeded, enable button
		}

		// If gas is unpredictable (UNPREDICTABLE_GAS_LIMIT), allow the button
		// The transaction might work, we just can't estimate gas accurately
		if (unpredictableFunctions.has(functionName)) {
			return false; // Unpredictable but might work, enable button
		}

		// If no gas estimate yet (still loading or failed for non-contract reasons),
		// fall back to permission-based logic
		switch (functionName) {
			case 'completeTask':
				return !permissions.canComplete;
			case 'acceptTask':
				return !permissions.canAccept;
			case 'cancelEscrow':
				return !permissions.canCancel;
			case 'disputeTask':
				return !permissions.canDispute;
			case 'proposeResolution':
				return !permissions.canPropose;
			case 'acceptProposal':
				return !permissions.canAcceptProposal;
			case 'resolveAfterTimelock':
				return !permissions.canResolveTimelock;
			default:
				return true;
		}
	}

	// Get tooltip text for disabled buttons
	function getDisabledTooltip(functionName: string): string {
		if (hasZeroValue()) {
			return $t('debug.smart_contract.actions.disabled_zero_value');
		}

		if (safetyOverride) return '';

		switch (functionName) {
			case 'completeTask':
				return !isFreelancer
					? $t('debug.smart_contract.actions.disabled_tooltip', {
							values: { reason: 'Only freelancer can complete tasks' }
						})
					: $t('debug.smart_contract.actions.disabled_tooltip', {
							values: { reason: 'Task completion not available in current contract state' }
						});
			case 'acceptTask':
				return !isClient
					? $t('debug.smart_contract.actions.disabled_tooltip', {
							values: { reason: 'Only client can accept tasks' }
						})
					: $t('debug.smart_contract.actions.disabled_tooltip', {
							values: { reason: 'Task acceptance not available in current contract state' }
						});
			default:
				return $t('debug.smart_contract.actions.disabled_tooltip', {
					values: { reason: 'Function not available in current contract state' }
				});
		}
	}

	// Format address
	function formatAddress(address: string): string {
		return `${address.slice(0, 6)}...${address.slice(-4)}`;
	}

	// Format timestamp
	function formatTimestamp(timestamp: number): string {
		if (!timestamp || timestamp <= 0) {
			return 'Not set';
		}

		const date = timestamp > 1000000000000 ? new Date(timestamp) : new Date(timestamp * 1000);

		if (isNaN(date.getTime())) {
			return 'Invalid date';
		}

		return date.toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	// Convert RBTC to sats (1 RBTC = 100,000,000 sats)
	function rbtcToSats(rbtcAmount: string | number): bigint {
		const rbtc = typeof rbtcAmount === 'string' ? parseFloat(rbtcAmount) : rbtcAmount;
		if (isNaN(rbtc)) return 0n;
		// RBTC has 18 decimals, so we need to multiply by 10^18, then divide by 10^10 to get sats
		// 1 RBTC = 1 BTC = 100,000,000 sats
		return BigInt(Math.round(rbtc * 100_000_000));
	}

	// Format sats amount
	function formatSats(amount: string | number): string {
		const sats = rbtcToSats(amount);
		return sats.toLocaleString('en-US');
	}

	// Get explorer URL for address
	function getExplorerUrl(address: string, network: 'RSK' | 'BSC'): string {
		const rskNetwork = import.meta.env.VITE_RSK_NETWORK || 'testnet';
		const bscNetwork = import.meta.env.VITE_BSC_NETWORK || 'testnet';

		if (network === 'RSK') {
			// RSK explorer uses Blockscout format
			if (rskNetwork === 'mainnet') {
				return `https://rootstock.blockscout.com/address/${address}`;
			} else {
				return `https://rootstock-testnet.blockscout.com/address/${address}`;
			}
		} else {
			if (bscNetwork === 'mainnet') {
				return `https://bscscan.com/address/${address}`;
			} else {
				return `https://testnet.bscscan.com/address/${address}`;
			}
		}
	}

	// Handle function execution
	async function handleExecuteFunction(functionName: string, ...args: string[]) {
		if (safetyOverride) {
			// Skip confirmation if override is enabled
			// onExecuteFunction expects (functionName, ...args) - parent adds contract.id
			await onExecuteFunction(functionName, ...args);
		} else {
			// Show confirmation modal
			pendingFunction = { name: functionName, args };
			showConfirmModal = true;
		}
	}

	// Confirm and execute
	async function confirmExecute() {
		if (pendingFunction) {
			showConfirmModal = false;
			// onExecuteFunction expects (functionName, ...args) - parent adds contract.id
			await onExecuteFunction(pendingFunction.name, ...pendingFunction.args);
			pendingFunction = null;
		}
	}

	// Get default contract address from env vars
	function getDefaultContractAddress(): string | null {
		const network = import.meta.env.VITE_RSK_NETWORK || 'testnet';
		return network === 'mainnet'
			? import.meta.env.VITE_RSK_CONTRACT_ADDRESS_MAINNET
			: import.meta.env.VITE_RSK_CONTRACT_ADDRESS_TESTNET;
	}

	/**
	 * Check if escrow funds were released by checking for internal transactions
	 * from the escrow contract to the client or freelancer addresses
	 * @param escrowId The escrow ID to check
	 * @param escrowData The escrow data containing client and freelancer addresses
	 * @param contractAddress Optional contract address for legacy contracts
	 * @returns Object with payment information or null if no payment found
	 */
	async function checkEscrowPayment(
		escrowId: string,
		escrowData: EscrowData,
		contractAddress?: string
	): Promise<{
		paidOut: boolean;
		recipient: 'client' | 'freelancer' | null;
		recipientAddress: string | null;
		amount: string | null;
		timestamp: number | null;
	} | null> {
		try {

			const escrowContractAddress = contractAddress || getDefaultContractAddress();
			if (!escrowContractAddress) {
				console.warn('[escrow] Contract address not configured, cannot check payment');
				return null;
			}

			// Get network configuration
			const rskConfig = getRSKConfig();
			const explorerApiUrl = rskConfig.explorerApiUrl;

			// Normalize addresses for comparison
			const contractAddr = escrowContractAddress.toLowerCase();
			const clientAddr = escrowData.client.toLowerCase();
			const freelancerAddr = escrowData.freelancer.toLowerCase();

			// Check internal transactions for both client and freelancer
			const addressesToCheck = [clientAddr, freelancerAddr];
			let paymentFound: {
				recipient: 'client' | 'freelancer';
				recipientAddress: string;
				amount: string;
				timestamp: number;
			} | null = null;

			for (const recipientAddr of addressesToCheck) {
				try {
					// Query internal transactions for the recipient address
					// The API returns transactions where this address is involved (as sender or recipient)
					const response = await fetch(
						`${explorerApiUrl}/v2/addresses/${recipientAddr}/internal-transactions`,
						{ signal: AbortSignal.timeout(10000) } // 10 second timeout
					);

					if (!response.ok) {
						console.debug(
							`[escrow] Failed to fetch internal transactions for ${recipientAddr}:`,
							response.status
						);
						continue;
					}

					const data = await response.json();
					if (!data || !data.items || !Array.isArray(data.items)) {
						continue;
					}

					// Look for transfers from the escrow contract to this recipient
					for (const tx of data.items) {
						const txFrom = (tx.from?.hash || tx.from || '').toLowerCase();
						const txTo = (tx.to?.hash || tx.to || '').toLowerCase();
						const value = tx.value || '0';

						// Check if this is a transfer from the escrow contract to the recipient
						if (txFrom === contractAddr && txTo === recipientAddr && value !== '0') {
							// Parse value
							let amountWei: bigint;
							if (typeof value === 'string' && value.startsWith('0x')) {
								amountWei = BigInt(value);
							} else {
								amountWei = BigInt(value);
							}

							if (amountWei > 0n) {
								// Found a payment - use the most recent one
								const timestamp = tx.timestamp
									? (typeof tx.timestamp === 'string' ? parseInt(tx.timestamp) : tx.timestamp) *
										1000
									: Date.now();

								// If we already found a payment, keep the most recent one
								if (!paymentFound || timestamp > (paymentFound.timestamp || 0)) {
									paymentFound = {
										recipient: recipientAddr === clientAddr ? 'client' : 'freelancer',
										recipientAddress: recipientAddr,
										amount: ethers.formatEther(amountWei),
										timestamp
									};
								}
							}
						}
					}
				} catch (error) {
					console.debug(
						`[escrow] Error checking internal transactions for ${recipientAddr}:`,
						error
					);
					// Continue checking other addresses
					continue;
				}
			}

			if (paymentFound) {
				return {
					paidOut: true,
					recipient: paymentFound.recipient,
					recipientAddress: paymentFound.recipientAddress,
					amount: paymentFound.amount,
					timestamp: paymentFound.timestamp
				};
			}

			return {
				paidOut: false,
				recipient: null,
				recipientAddress: null,
				amount: null,
				timestamp: null
			};
		} catch (error) {
			console.warn(`[escrow] Failed to check escrow payment for ${escrowId}:`, error);
			return null;
		}
	}

	// Fetch BTC price on mount and estimate gas once
	onMount(async () => {
		try {
			// Only fetch BTC price if not already set (service has caching, but avoid redundant calls)
			if (btcPrice === 0) {
				btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
			}

			// Check for payment transactions
			checkingPayment = true;
			try {
				const payment = await checkEscrowPayment(contract.id, contract);
				paymentInfo = payment;
			} catch {
				// Payment check failed
			} finally {
				checkingPayment = false;
			}

			// Estimate gas for all functions once
			if (!hasEstimatedGas && btcPrice > 0) {
				await estimateAllGasFees();
				hasEstimatedGas = true;
			}
		} catch (error) {
			console.error('Failed to fetch BTC price:', error);
		}
	});

	// Cleanup on unmount
	onDestroy(() => {
		// Cancel any pending gas estimations
		if (estimationAbortController) {
			estimationAbortController.abort();
			estimationAbortController = null;
		}
		// Clear timeout
		if (proposeResolutionTimeout) {
			clearTimeout(proposeResolutionTimeout);
			proposeResolutionTimeout = null;
		}
	});

	// Check if error is a contract revert (function blocked by contract state)
	function isContractRevertError(error: unknown): boolean {
		if (!error) return false;

		const ethersErr = isEthersError(error) ? error : null;
		if (!ethersErr) {
			// Check string message
			const errorMessage = (error instanceof Error ? error.message : String(error)).toLowerCase();
			if (errorMessage.includes('execution reverted')) {
				return true;
			}
			return false;
		}

		// Check the error itself and any nested cause/reason
		const errorsToCheck: EthersError[] = [ethersErr];
		if (ethersErr.cause && isEthersError(ethersErr.cause)) {
			errorsToCheck.push(ethersErr.cause);
		}
		if (ethersErr.reason && isEthersError(ethersErr.reason)) {
			errorsToCheck.push(ethersErr.reason);
		}

		for (const err of errorsToCheck) {
			// Check for CALL_EXCEPTION code (ethers.js error code for contract reverts)
			// This is the most reliable indicator
			if (err.code === 'CALL_EXCEPTION') {
				const errorMessage = (err.message || String(err)).toLowerCase();
				// Only treat as revert if it explicitly says "execution reverted"
				if (errorMessage.includes('execution reverted') || errorMessage.includes('revert')) {
					return true;
				}
			}
		}

		// Also check the message directly (in case error was wrapped and lost the code property)
		// The estimateContractGas function wraps errors with "Gas estimation failed: ...",
		// so we need to check the message for revert indicators
		const errorMessage = (ethersErr.message || String(error)).toLowerCase();

		// Explicit "execution reverted" in message is a reliable indicator
		// even if the code property was lost due to error wrapping
		if (errorMessage.includes('execution reverted')) {
			return true;
		}

		// Check for specific revert reasons that indicate contract state issues
		// These are common revert messages from the escrow contract
		const revertReasons = [
			'task not completed',
			'not in dispute',
			'invalid state',
			'must cancel',
			'only taskee',
			'only tasker',
			'not authorized',
			'not allowed',
			'cannot',
			'not available',
			'already',
			'only',
			'invalid',
			'required'
		];

		// If the error message contains "gas estimation failed" AND a known revert reason,
		// it's likely a contract revert (the error was wrapped but contains revert info)
		if (errorMessage.includes('gas estimation failed')) {
			// Check for revert reasons
			if (revertReasons.some((reason) => errorMessage.includes(reason))) {
				return true;
			}
			// Also check for "revert" keyword in gas estimation errors
			// This catches cases like "Gas estimation failed: revert: ..."
			if (errorMessage.includes('revert')) {
				return true;
			}
		}

		return false;
	}

	// Check if error is unpredictable gas limit (transaction might work but gas is hard to estimate)
	function isUnpredictableGasError(error: unknown): boolean {
		if (!error) return false;
		const ethersErr = isEthersError(error) ? error : null;
		if (ethersErr) {
			// UNPREDICTABLE_GAS_LIMIT means gas estimation is uncertain, not necessarily that it will fail
			if (ethersErr.code === 'UNPREDICTABLE_GAS_LIMIT') return true;
		}
		// Plain Error message fallback (e.g. when estimateWrite wraps and rethrows)
		const errorMessage = (error instanceof Error ? error.message : String(error)).toLowerCase();
		return (
			errorMessage.includes('unpredictable gas') ||
			errorMessage.includes('gas estimation failed')
		);
	}

	// Check if error is a network/provider error (not a contract block)
	function isNetworkError(error: unknown): boolean {
		if (!error) return false;
		const ethersErr = isEthersError(error) ? error : null;
		const errorMessage = (error instanceof Error ? error.message : String(error)).toLowerCase();

		// Network-related errors
		if (
			ethersErr?.code === 'NETWORK_ERROR' ||
			ethersErr?.code === 'TIMEOUT' ||
			errorMessage.includes('network') ||
			errorMessage.includes('connection') ||
			errorMessage.includes('timeout') ||
			errorMessage.includes('provider') ||
			errorMessage.includes('fetch')
		) {
			return true;
		}

		return false;
	}

	// Estimate gas for a specific function
	async function estimateGasFee(functionName: string, ...args: string[]): Promise<void> {
		if (estimatingGas.has(functionName)) return; // Already estimating

		estimatingGas.add(functionName); // Direct mutation
		// Create new Set instance to trigger reactivity (Svelte 5 needs new reference)
		estimatingGas = new Set(estimatingGas);

		try {
			// Build args for estimateWrite (contract ABI functions take escrowId as first arg)
			// proposeResolution takes (escrowId, freelancerAmountWei)
			let writeArgs: unknown[];
			if (functionName === 'proposeResolution' && args.length > 0) {
				const freelancerAmountWei = ethers.parseEther(String(args[0]));
				writeArgs = [contract.id, freelancerAmountWei];
			} else {
				writeArgs = [contract.id];
			}

			const contractAddress = getDefaultContractAddress();
			if (!contractAddress) {
				throw new Error('Contract address not configured, cannot estimate gas');
			}

			const gasEstimation = await estimateWrite({
				method: functionName,
				args: writeArgs,
				contractAddress
			});

			if (false) {
				throw new Error(gasEstimation.error);
			}

			const rbtcCost = 0;
			const usdCost = rbtcCost * btcPrice;
			gasEstimates.set(functionName, usdCost); // Direct mutation
			// Create new Map instance to trigger reactivity (Svelte 5 needs new reference)
			gasEstimates = new Map(gasEstimates);
			// Remove from blocked and unpredictable if estimation succeeded
			blockedFunctions.delete(functionName); // Direct mutation
			blockedFunctions = new Set(blockedFunctions); // Create new Set to trigger reactivity
			unpredictableFunctions.delete(functionName); // Direct mutation
			unpredictableFunctions = new Set(unpredictableFunctions); // Create new Set to trigger reactivity
		} catch (error) {
			// Only check abort if this was part of a batch estimation
			// Individual calls (like proposeResolution debounce) should not be blocked
			const wasAborted = estimationAbortController?.signal.aborted;
			if (wasAborted) {
				// If aborted, just return silently - this was a batch cancellation
				return;
			}

			// Check error type and handle accordingly
			// Note: estimateWrite wraps errors as { success: false, error: string }; thrown Error preserves the message
			const originalError = isEthersError(error) && error.cause ? error.cause : error;

			if (isContractRevertError(originalError) || isContractRevertError(error)) {
				// Contract will revert - function is blocked
				blockedFunctions.add(functionName); // Direct mutation
				blockedFunctions = new Set(blockedFunctions); // Create new Set to trigger reactivity
				// Remove from estimates and unpredictable
				gasEstimates.delete(functionName); // Direct mutation
				gasEstimates = new Map(gasEstimates); // Create new Map to trigger reactivity
				unpredictableFunctions.delete(functionName); // Direct mutation
				unpredictableFunctions = new Set(unpredictableFunctions); // Create new Set to trigger reactivity
			} else if (isUnpredictableGasError(originalError) || isUnpredictableGasError(error)) {
				// Gas estimation is uncertain, but transaction might still work
				unpredictableFunctions.add(functionName); // Direct mutation
				unpredictableFunctions = new Set(unpredictableFunctions); // Create new Set to trigger reactivity
				// Remove from estimates and blocked
				gasEstimates.delete(functionName); // Direct mutation
				gasEstimates = new Map(gasEstimates); // Create new Map to trigger reactivity
				blockedFunctions.delete(functionName); // Direct mutation
				blockedFunctions = new Set(blockedFunctions); // Create new Set to trigger reactivity
			} else if (isNetworkError(error)) {
				// Network error - don't mark as blocked, just show no estimate
				// Remove from all states, will show "Tx Fee: --"
				gasEstimates.delete(functionName); // Direct mutation
				gasEstimates = new Map(gasEstimates); // Create new Map to trigger reactivity
				blockedFunctions.delete(functionName); // Direct mutation
				blockedFunctions = new Set(blockedFunctions); // Create new Set to trigger reactivity
				unpredictableFunctions.delete(functionName); // Direct mutation
				unpredictableFunctions = new Set(unpredictableFunctions); // Create new Set to trigger reactivity
			} else {
				// Unknown error - treat conservatively, don't mark as blocked
				gasEstimates.delete(functionName); // Direct mutation
				gasEstimates = new Map(gasEstimates); // Create new Map to trigger reactivity
				blockedFunctions.delete(functionName); // Direct mutation
				blockedFunctions = new Set(blockedFunctions); // Create new Set to trigger reactivity
				unpredictableFunctions.delete(functionName); // Direct mutation
				unpredictableFunctions = new Set(unpredictableFunctions); // Create new Set to trigger reactivity
			}
		} finally {
			estimatingGas.delete(functionName); // Direct mutation
			estimatingGas = new Set(estimatingGas); // Create new Set to trigger reactivity
		}
	}

	// Estimate gas for all functions (only called once on mount)
	// When safety override is OFF, we need to estimate ALL functions to determine availability
	async function estimateAllGasFees(): Promise<void> {
		if (btcPrice === 0 || hasEstimatedGas) return; // Wait for BTC price or skip if already estimated

		// Cancel any previous estimation to prevent race conditions
		if (estimationAbortController) {
			estimationAbortController.abort();
		}

		// Create new abort controller for this estimation batch
		estimationAbortController = new AbortController();
		const signal = estimationAbortController.signal;

		const functionsToEstimate: Array<{ name: string; args: string[] }> = [];

		// Always estimate all functions to determine their actual availability
		// This allows us to show all buttons but disable based on contract state
		functionsToEstimate.push({ name: 'completeTask', args: [] });
		functionsToEstimate.push({ name: 'acceptTask', args: [] });
		functionsToEstimate.push({ name: 'cancelEscrow', args: [] });
		functionsToEstimate.push({ name: 'disputeTask', args: [] });
		// For proposeResolution, use a default value for initial estimate (0.0001 RBTC = 10,000 sats)
		functionsToEstimate.push({ name: 'proposeResolution', args: ['0.0001'] });
		functionsToEstimate.push({ name: 'acceptProposal', args: [] });
		functionsToEstimate.push({ name: 'resolveAfterTimelock', args: [] });

		// Estimate all in parallel, but check for abort signal
		try {
			await Promise.all(
				functionsToEstimate.map(async ({ name, args }) => {
					if (signal.aborted) return;
					try {
						await estimateGasFee(name, ...args);
					} catch (error) {
						// Ignore abort errors
						if (error instanceof Error && error.name === 'AbortError') {
							// Expected when estimation is cancelled
						}
					}
				})
			);
		} catch {
			// Ignore errors (including abort)
		}
	}

	// Re-estimate proposeResolution when amount changes (with debouncing)
	let proposeResolutionTimeout: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		if (showResolutionForm && proposedFreelancerAmount && btcPrice > 0) {
			// Clear existing timeout
			if (proposeResolutionTimeout) {
				clearTimeout(proposeResolutionTimeout);
			}

			// Debounce the estimation to avoid too many calls
			proposeResolutionTimeout = setTimeout(() => {
				const freelancerAmountSats = parseInt(proposedFreelancerAmount);
				if (!isNaN(freelancerAmountSats) && freelancerAmountSats > 0) {
					const freelancerAmountRBTC = (freelancerAmountSats / 100_000_000).toFixed(8);
					estimateGasFee('proposeResolution', freelancerAmountRBTC);
				}
			}, 500); // 500ms debounce
		}

		// Cleanup timeout on unmount
		return () => {
			if (proposeResolutionTimeout) {
				clearTimeout(proposeResolutionTimeout);
			}
		};
	});

	// Handle propose resolution
	async function handleProposeResolution() {
		if (!proposedFreelancerAmount) {
			return;
		}

		const freelancerAmountSats = parseInt(proposedFreelancerAmount);
		if (isNaN(freelancerAmountSats) || freelancerAmountSats <= 0) {
			return;
		}

		// Convert sats to RBTC (sats / 100,000,000)
		const freelancerAmountRBTC = (freelancerAmountSats / 100_000_000).toFixed(8);

		// Pass freelancerAmount as first argument after function name
		await handleExecuteFunction('proposeResolution', freelancerAmountRBTC);
		showResolutionForm = false;
		proposedFreelancerAmount = '';
	}

	// Format gas fee display
	function formatGasFee(functionName: string): string {
		// Check if function is blocked (contract will revert)
		if (blockedFunctions.has(functionName)) {
			return 'Tx Blocked';
		}
		// Check if gas is unpredictable (estimation uncertain, but might work)
		if (unpredictableFunctions.has(functionName)) {
			return 'Tx Fee: --';
		}
		// Check if we have a valid gas estimate
		const usdCost = gasEstimates.get(functionName);
		if (usdCost === undefined || usdCost === 0) {
			return 'Tx Fee: --';
		}
		return `Tx Fee: $${usdCost.toFixed(2)}`;
	}
</script>

<div class="bg-base-100 rounded-xl shadow-md transition-shadow hover:shadow-lg">
	<div class="card-body">
		<!-- Header -->
		<div class="flex items-center justify-between">
			<div class="flex-1">
				<h3 class="card-title text-lg">
					{$t('debug.smart_contract.contract_id')}: {contract.id}
				</h3>
				<div class="mt-2 flex flex-wrap gap-2">
					<div class="badge {getStatusColorClass(contract.status)} badge-sm">
						{$t(getStatusTranslationKey(contract.status))}
					</div>
					<div class="badge {isClient ? 'badge-primary' : 'badge-secondary'} badge-sm">
						{isClient
							? $t('debug.smart_contract.role_client')
							: $t('debug.smart_contract.role_freelancer')}
					</div>
				</div>
			</div>
			<div class="text-right">
				{#if checkingPayment}
					<div class="text-sm text-base-content/60">Checking payment...</div>
				{:else if paymentInfo?.paidOut}
					<div class="text-lg font-bold">0 sats</div>
					<div class="text-xs text-base-content/60">
						(was {formatSats(contract.baseAmount)} sats)
					</div>
					<div class="text-xs text-base-content/60 mt-1">
						Paid to: {paymentInfo.recipient === 'client' ? 'Client' : 'Taskee'}
					</div>
				{:else}
					<div class="text-lg font-bold">{formatSats(contract.baseAmount)} sats</div>
				{/if}
			</div>
		</div>

		<!-- Contract Details -->
		<div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
			<div>
				<div class="label-text text-xs text-base-content/60">
					{$t('debug.smart_contract.client')}
				</div>
				<div class="flex items-center gap-2">
					<a
						href={getExplorerUrl(contract.client, 'RSK')}
						target="_blank"
						rel="noopener noreferrer"
						class="font-mono text-sm link link-primary"
					>
						{formatAddress(contract.client)}
					</a>
					<IconOpenInNew class="h-4 w-4 text-base-content/60" />
				</div>
			</div>
			<div>
				<div class="label-text text-xs text-base-content/60">
					{$t('debug.smart_contract.freelancer')}
				</div>
				<div class="flex items-center gap-2">
					<a
						href={getExplorerUrl(contract.freelancer, 'RSK')}
						target="_blank"
						rel="noopener noreferrer"
						class="font-mono text-sm link link-primary"
					>
						{formatAddress(contract.freelancer)}
					</a>
					<IconOpenInNew class="h-4 w-4 text-base-content/60" />
				</div>
			</div>
			<div>
				<div class="label-text text-xs text-base-content/60">
					{$t('debug.smart_contract.created_at')}
				</div>
				<div class="text-sm">{formatTimestamp(contract.createdAt)}</div>
			</div>
			<div>
				<div class="label-text text-xs text-base-content/60">
					{$t('debug.smart_contract.estimated_start')}
				</div>
				<div class="text-sm">{formatTimestamp(contract.estimatedStartTime)}</div>
			</div>
			<div>
				<div class="label-text text-xs text-base-content/60">
					{$t('debug.smart_contract.estimated_completion')}
				</div>
				<div class="text-sm">{formatTimestamp(contract.estimatedCompletionTime)}</div>
			</div>
			<div>
				<div class="label-text text-xs text-base-content/60">
					{$t('debug.smart_contract.timelock_expiry')}
				</div>
				<div class="text-sm">{formatTimestamp(contract.timelockExpiry)}</div>
			</div>
		</div>

		<!-- Action Buttons -->
		<div class="mt-4 border-t border-base-300 pt-4">
			<h4 class="mb-3 text-sm font-semibold">{$t('debug.smart_contract.actions.title')}</h4>
			<div class="flex flex-wrap gap-2">
				<!-- Complete Task -->
				<div class="flex flex-col items-center gap-1">
					<button
						class="btn btn-success btn-sm"
						disabled={isFunctionDisabled('completeTask') || isExecuting}
						title={isFunctionDisabled('completeTask') ? getDisabledTooltip('completeTask') : ''}
						onclick={() => handleExecuteFunction('completeTask')}
					>
						{#if isExecuting}
							<span class="loading loading-spinner loading-xs"></span>
						{/if}
						{$t('debug.smart_contract.actions.complete_task')}
					</button>
					<span class="text-xs text-base-content/60">{formatGasFee('completeTask')}</span>
				</div>

				<!-- Accept Task -->
				<div class="flex flex-col items-center gap-1">
					<button
						class="btn btn-success btn-sm"
						disabled={isFunctionDisabled('acceptTask') || isExecuting}
						title={isFunctionDisabled('acceptTask') ? getDisabledTooltip('acceptTask') : ''}
						onclick={() => handleExecuteFunction('acceptTask')}
					>
						{#if isExecuting}
							<span class="loading loading-spinner loading-xs"></span>
						{/if}
						{$t('debug.smart_contract.actions.accept_task')}
					</button>
					<span class="text-xs text-base-content/60">{formatGasFee('acceptTask')}</span>
				</div>

				<!-- Cancel Escrow -->
				<div class="flex flex-col items-center gap-1">
					<button
						class="btn btn-error btn-sm"
						disabled={isFunctionDisabled('cancelEscrow') || isExecuting}
						title={isFunctionDisabled('cancelEscrow') ? getDisabledTooltip('cancelEscrow') : ''}
						onclick={() => handleExecuteFunction('cancelEscrow')}
					>
						{#if isExecuting}
							<span class="loading loading-spinner loading-xs"></span>
						{/if}
						{$t('debug.smart_contract.actions.cancel_contract')}
					</button>
					<span class="text-xs text-base-content/60">{formatGasFee('cancelEscrow')}</span>
				</div>

				<!-- Dispute Task -->
				<div class="flex flex-col items-center gap-1">
					<button
						class="btn btn-error btn-sm"
						disabled={isFunctionDisabled('disputeTask') || isExecuting}
						title={isFunctionDisabled('disputeTask') ? getDisabledTooltip('disputeTask') : ''}
						onclick={() => handleExecuteFunction('disputeTask')}
					>
						{#if isExecuting}
							<span class="loading loading-spinner loading-xs"></span>
						{/if}
						{$t('debug.smart_contract.actions.dispute_task')}
					</button>
					<span class="text-xs text-base-content/60">{formatGasFee('disputeTask')}</span>
				</div>

				<!-- Propose Resolution -->
				{#if !showResolutionForm}
					<div class="flex flex-col items-center gap-1">
						<button
							class="btn btn-warning btn-sm"
							disabled={isFunctionDisabled('proposeResolution') || isExecuting}
							title={isFunctionDisabled('proposeResolution')
								? getDisabledTooltip('proposeResolution')
								: ''}
							onclick={() => (showResolutionForm = true)}
						>
							{$t('debug.smart_contract.actions.propose_resolution')}
						</button>
						<span class="text-xs text-base-content/60">{formatGasFee('proposeResolution')}</span>
					</div>
				{:else}
					<div class="w-full space-y-2 rounded-lg bg-base-200 p-3">
						<div class="label-text text-xs">
							{$t('debug.smart_contract.actions.propose_resolution_form.freelancer_amount')}
						</div>
						<input
							type="number"
							step="1"
							bind:value={proposedFreelancerAmount}
							class="input input-bordered input-sm w-full"
							placeholder="0"
						/>
						<div class="flex gap-2">
							<button
								class="btn btn-warning btn-sm"
								onclick={handleProposeResolution}
								disabled={!proposedFreelancerAmount || isExecuting}
							>
								{$t('debug.smart_contract.actions.propose_resolution_form.submit')}
							</button>
							<button
								class="btn btn-ghost btn-sm"
								onclick={() => {
									showResolutionForm = false;
									proposedFreelancerAmount = '';
								}}
							>
								{$t('debug.smart_contract.actions.propose_resolution_form.cancel')}
							</button>
						</div>
						<span class="text-xs text-base-content/60">{formatGasFee('proposeResolution')}</span>
					</div>
				{/if}

				<!-- Accept Proposal -->
				<div class="flex flex-col items-center gap-1">
					<button
						class="btn btn-success btn-sm"
						disabled={isFunctionDisabled('acceptProposal') || isExecuting}
						title={isFunctionDisabled('acceptProposal') ? getDisabledTooltip('acceptProposal') : ''}
						onclick={() => handleExecuteFunction('acceptProposal')}
					>
						{#if isExecuting}
							<span class="loading loading-spinner loading-xs"></span>
						{/if}
						{$t('debug.smart_contract.actions.accept_proposal')}
					</button>
					<span class="text-xs text-base-content/60">{formatGasFee('acceptProposal')}</span>
				</div>

				<!-- Resolve After Timelock -->
				<div class="flex flex-col items-center gap-1">
					<button
						class="btn btn-info btn-sm"
						disabled={isFunctionDisabled('resolveAfterTimelock') || isExecuting}
						title={isFunctionDisabled('resolveAfterTimelock')
							? getDisabledTooltip('resolveAfterTimelock')
							: ''}
						onclick={() => handleExecuteFunction('resolveAfterTimelock')}
					>
						{#if isExecuting}
							<span class="loading loading-spinner loading-xs"></span>
						{/if}
						{$t('debug.smart_contract.actions.resolve_timelock')}
					</button>
					<span class="text-xs text-base-content/60">{formatGasFee('resolveAfterTimelock')}</span>
				</div>
			</div>
		</div>

		<!-- Raw Data Toggle -->
		<div class="mt-4 border-t border-base-300 pt-4">
			<button class="btn btn-ghost btn-sm w-full" onclick={onToggleRawData}>
				{$t('debug.smart_contract.raw_data')}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4 transition-transform {isExpanded ? 'rotate-180' : ''}"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M19 9l-7 7-7-7"
					/>
				</svg>
			</button>

			{#if isExpanded}
				<div class="mt-3 rounded-lg bg-base-200 p-4">
					<pre class="overflow-x-auto text-xs"><code
							>{JSON.stringify(
								{ contract, permissions },
								(key, value) => {
									// Handle BigInt serialization
									if (typeof value === 'bigint') {
										return value.toString();
									}
									return value;
								},
								2
							)}</code
						></pre>
				</div>
			{/if}
		</div>
	</div>
</div>

<!-- Confirmation Modal -->
<ConfirmModal
	isOpen={showConfirmModal}
	title={$t('debug.smart_contract.actions.confirm_execution', {
		values: { function: pendingFunction?.name || '' }
	})}
	message={$t('debug.smart_contract.actions.confirm_execution', {
		values: { function: pendingFunction?.name || '' }
	})}
	confirmText={$t('common.components.confirm_modal.confirm')}
	cancelText={$t('common.components.confirm_modal.cancel')}
	confirmButtonClass="btn-primary"
	onConfirm={confirmExecute}
	onCancel={() => {
		showConfirmModal = false;
		pendingFunction = null;
	}}
/>

