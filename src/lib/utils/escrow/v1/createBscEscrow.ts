import { ethers, parseUnits, type ContractInterface, type Signer } from 'ethers';
import type { BscEscrowCreationParams } from '$lib/types/escrow';
import { createDebug } from '$lib/utils/debug';
import { getWallet } from '$lib/stores/wallet.store';

const d = createDebug('escrow:createBsc');

/**
 * USDT token contract address on BSC (same on testnet and mainnet)
 * This is the canonical USDT contract on Binance Smart Chain
 */
const USDT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';

/**
 * USDT token decimals (always 6 on BSC)
 */
const USDT_DECIMALS = 6;

/**
 * Estimate gas for USDT approval
 */
const USDT_APPROVE_GAS_ESTIMATE = 60000n;

/**
 * Estimate gas for createEscrow call
 */
const CREATE_ESCROW_GAS_ESTIMATE = 150000n;

/**
 * Error type for ABI validation
 */
export class AbiNotAvailableError extends Error {
	constructor(chainId: number) {
		super(`Escrow contract ABI not available for chain ${chainId}`);
		this.name = 'AbiNotAvailableError';
	}
}

/**
 * Error type for contract operations
 */
export class EscrowCreationError extends Error {
	constructor(message: string, public originalError?: Error) {
		super(message);
		this.name = 'EscrowCreationError';
	}
}

/**
 * Check if signer has sufficient USDT balance and allowance for the transfer
 *
 * @param usdt - USDT contract instance
 * @param signer - Transaction signer
 * @param amount - USDT amount to transfer (in atomic units)
 * @param routerAddress - Router contract address that will need the allowance
 * @returns Object with balance and allowance information
 */
async function checkUsdtAllowance(
	usdt: ethers.Contract,
	signer: Signer,
	amount: bigint,
	routerAddress: string
): Promise<{ hasBalance: boolean; hasAllowance: boolean; balance: bigint; allowance: bigint }> {
	const signerAddress = await signer.getAddress();

	try {
		// Get balance
		const balance = (await usdt.balanceOf(signerAddress)) as bigint;
		const hasBalance = balance >= amount;

		// Get allowance
		const allowance = (await usdt.allowance(signerAddress, routerAddress)) as bigint;
		const hasAllowance = allowance >= amount;

		return { hasBalance, hasAllowance, balance, allowance };
	} catch (error) {
		d.error('Error checking USDT allowance', {}, error);
		throw new EscrowCreationError('Failed to check USDT balance and allowance', error as Error);
	}
}

/**
 * Approve USDT spending by the escrow contract if needed
 *
 * @param usdt - USDT contract instance
 * @param signer - Transaction signer
 * @param escrowAddress - Escrow contract address to approve
 * @param amount - USDT amount to approve (in atomic units)
 * @returns Transaction hash if approval was needed, null if already approved
 */
async function approveUsdtIfNeeded(
	usdt: ethers.Contract,
	signer: Signer,
	escrowAddress: string,
	amount: bigint
): Promise<string | null> {
	const signerAddress = await signer.getAddress();

	try {
		// Check current allowance
		const allowance = (await usdt.allowance(signerAddress, escrowAddress)) as bigint;

		if (allowance >= amount) {
			d.log('USDT already approved', { escrowAddress, signerAddress });
			return null; // Already approved
		}

		d.log('Approving USDT for escrow contract', { escrowAddress, amount: amount.toString() });

		// Approve with unlimited allowance (type(uint256).max) for better UX
		const approveTx = await usdt.connect(signer).approve(escrowAddress, ethers.MaxUint256);
		const receipt = await approveTx.wait();

		if (!receipt) {
			throw new EscrowCreationError('USDT approval transaction failed');
		}

		d.log('USDT approved successfully', { escrowAddress, hash: receipt.hash });
		return receipt.hash;
	} catch (error) {
		d.error('Error approving USDT', { escrowAddress }, error);
		throw new EscrowCreationError('Failed to approve USDT spending', error as Error);
	}
}

/**
 * Create an escrow on BSC by calling the smart contract
 *
 * FAIL-CLOSED: This function requires the ABI to be available and valid.
 * If the ABI is not available or invalid, it will throw an error rather than
 * attempting to bypass or fallback to another method.
 *
 * Flow:
 * 1. Validate that ABI is available (fail-closed)
 * 2. Create contract instance
 * 3. Get signer (use provided or default from wallet)
 * 4. Approve USDT spending if needed
 * 5. Call createEscrow() method on the contract
 * 6. Wait for transaction confirmation
 * 7. Return transaction hash
 *
 * @param params - Escrow creation parameters
 * @returns Transaction hash if successful
 * @throws AbiNotAvailableError if ABI is not available
 * @throws EscrowCreationError if contract call fails
 *
 * @example
 * try {
 *   const txHash = await createEscrowOnBsc({
 *     contractAddress: '0x...',
 *     escrowContractAbi: abi,
 *     senderAddress: userAddress,
 *     recipientAddress: freelancerAddress,
 *     amountUSDT: '100.5'
 *   });
 *   console.log('Escrow created:', txHash);
 * } catch (error) {
 *   if (error instanceof AbiNotAvailableError) {
 *     console.error('ABI not available - escrow creation blocked');
 *   } else {
 *     console.error('Escrow creation failed:', error.message);
 *   }
 * }
 */
export async function createEscrowOnBsc(params: BscEscrowCreationParams): Promise<string> {
	const {
		contractAddress,
		escrowContractAbi,
		signer: providedSigner,
		senderAddress,
		recipientAddress,
		amountUSDT,
		escrowId,
		taskId
	} = params;

	d.log('Starting escrow creation', { escrowId, taskId, contractAddress });

	// FAIL-CLOSED: Require ABI to be available
	if (!escrowContractAbi) {
		throw new AbiNotAvailableError(97); // Assume BSC for error message
	}

	try {
		// Get signer (use provided or default from wallet)
		let signer: Signer;
		if (providedSigner) {
			signer = providedSigner;
		} else {
			const walletFromStore = getWallet('bsc');
			if (!walletFromStore) {
				throw new EscrowCreationError('No BSC wallet available');
			}
			signer = walletFromStore;
		}

		// Create contract instance
		const escrowContract = new ethers.Contract(
			contractAddress,
			escrowContractAbi,
			signer
		);

		// Convert USDT amount to atomic units (6 decimals)
		const amountAtomic = parseUnits(amountUSDT, USDT_DECIMALS);

		d.log('Creating escrow parameters', {
			recipientAddress,
			amountAtomic: amountAtomic.toString(),
			escrowId
		});

		// Call createEscrow method
		// Note: The exact method signature depends on your contract
		// This is a typical pattern for token-based escrows
		const createTx = await escrowContract.createEscrow(recipientAddress, amountAtomic);

		d.log('Escrow creation transaction submitted', { hash: createTx.hash });

		// Wait for confirmation
		const receipt = await createTx.wait();

		if (!receipt) {
			throw new EscrowCreationError('Escrow creation transaction failed - no receipt');
		}

		d.log('Escrow creation confirmed', {
			hash: receipt.hash,
			blockNumber: receipt.blockNumber,
			escrowId
		});

		return receipt.hash;
	} catch (error) {
		// Don't wrap AbiNotAvailableError
		if (error instanceof AbiNotAvailableError) {
			throw error;
		}

		// Wrap other errors
		if (error instanceof EscrowCreationError) {
			throw error;
		}

		d.error('Escrow creation failed', { escrowId, taskId }, error);

		// Extract meaningful error message
		let errorMessage = 'Failed to create escrow';
		if (error instanceof Error) {
			if (error.message.includes('insufficient balance')) {
				errorMessage = 'Insufficient USDT balance for escrow creation';
			} else if (error.message.includes('allowance')) {
				errorMessage = 'USDT approval failed - insufficient allowance';
			} else if (error.message.includes('gas')) {
				errorMessage = 'Transaction failed - insufficient gas';
			} else {
				errorMessage = error.message;
			}
		}

		throw new EscrowCreationError(errorMessage, error as Error);
	}
}

/**
 * Validate escrow creation parameters
 *
 * @param params - Parameters to validate
 * @returns Validation result with errors array
 */
export function validateEscrowCreationParams(params: BscEscrowCreationParams): {
	valid: boolean;
	errors: string[];
} {
	const errors: string[] = [];

	// Validate contract address
	if (!ethers.isAddress(params.contractAddress)) {
		errors.push('Invalid contract address');
	}

	// Validate sender address
	if (!ethers.isAddress(params.senderAddress)) {
		errors.push('Invalid sender address');
	}

	// Validate recipient address
	if (!ethers.isAddress(params.recipientAddress)) {
		errors.push('Invalid recipient address');
	}

	// Validate amount
	try {
		const amount = parseUnits(params.amountUSDT, USDT_DECIMALS);
		if (amount <= 0n) {
			errors.push('Amount must be greater than 0');
		}
	} catch {
		errors.push('Invalid amount - cannot parse as USDT decimal amount');
	}

	// Validate ABI
	if (!params.escrowContractAbi) {
		errors.push('Escrow contract ABI is not available');
	}

	return {
		valid: errors.length === 0,
		errors
	};
}
