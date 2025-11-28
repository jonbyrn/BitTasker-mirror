import { ethers } from 'ethers';

/**
 * Configuration for RPC call retry logic
 */
export interface RetryConfig {
	maxRetries?: number;
	initialDelayMs?: number;
	maxDelayMs?: number;
	backoffMultiplier?: number;
	timeoutMs?: number;
}

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
	maxRetries: 3,
	initialDelayMs: 1000, // 1 second
	maxDelayMs: 10000, // 10 seconds
	backoffMultiplier: 2,
	timeoutMs: 30000 // 30 seconds
};

/**
 * Check if an error is transient and should be retried
 */
function isTransientError(error: any): boolean {
	if (!error) return false;

	const errorMessage = error.message?.toLowerCase() || '';
	const errorCode = error.code || '';

	// Network-related errors
	if (
		errorMessage.includes('network') ||
		errorMessage.includes('connection') ||
		errorMessage.includes('timeout') ||
		errorMessage.includes('econnreset') ||
		errorMessage.includes('econnrefused') ||
		errorMessage.includes('fetch failed') ||
		errorCode === 'NETWORK_ERROR' ||
		errorCode === 'TIMEOUT'
	) {
		return true;
	}

	// Rate limiting errors
	if (
		errorMessage.includes('rate limit') ||
		errorMessage.includes('too many requests') ||
		errorCode === '429' ||
		error.status === 429
	) {
		return true;
	}

	// Provider destroyed errors (can be retried with fresh provider)
	if (
		errorCode === 'UNSUPPORTED_OPERATION' &&
		errorMessage.includes('provider destroyed')
	) {
		return true;
	}

	// Server errors (5xx)
	if (errorCode === 'SERVER_ERROR' || (error.status >= 500 && error.status < 600)) {
		return true;
	}

	// Ethers-specific transient errors
	if (
		errorCode === 'TIMEOUT' ||
		errorCode === 'NETWORK_ERROR' ||
		errorCode === 'UNKNOWN_ERROR'
	) {
		return true;
	}

	return false;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay
 */
function calculateBackoffDelay(attempt: number, config: Required<RetryConfig>): number {
	const delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);
	return Math.min(delay, config.maxDelayMs);
}

/**
 * Execute a contract call with timeout
 */
async function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
	operation: string
): Promise<T> {
	return Promise.race([
		promise,
		new Promise<T>((_, reject) => {
			setTimeout(() => {
				reject(new Error(`RPC call timeout after ${timeoutMs}ms: ${operation}`));
			}, timeoutMs);
		})
	]);
}

/**
 * Execute an RPC call with retry logic and timeout
 * 
 * @param operation - Function that performs the RPC call
 * @param operationName - Name of the operation for logging
 * @param config - Retry configuration
 * @returns Result of the RPC call
 */
export async function executeWithRetry<T>(
	operation: () => Promise<T>,
	operationName: string,
	config: RetryConfig = {}
): Promise<T> {
	const finalConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
	let lastError: any;

	for (let attempt = 0; attempt <= finalConfig.maxRetries; attempt++) {
		try {
			// Execute with timeout
			const result = await withTimeout(
				operation(),
				finalConfig.timeoutMs,
				operationName
			);

			// Success - log if retried
			if (attempt > 0) {
				console.log(`[RPC] ${operationName} succeeded after ${attempt} retry(ies)`);
			}

			return result;
		} catch (error: any) {
			lastError = error;

			// Check if error is transient and should be retried
			if (!isTransientError(error)) {
				// Non-transient error - don't retry
				console.warn(`[RPC] ${operationName} failed with non-transient error:`, error.message);
				throw error;
			}

			// If this was the last attempt, throw the error
			if (attempt === finalConfig.maxRetries) {
				console.error(
					`[RPC] ${operationName} failed after ${finalConfig.maxRetries} retries:`,
					error.message
				);
				throw error;
			}

			// Calculate backoff delay
			const delay = calculateBackoffDelay(attempt, finalConfig);
			console.warn(
				`[RPC] ${operationName} failed (attempt ${attempt + 1}/${finalConfig.maxRetries + 1}), retrying in ${delay}ms:`,
				error.message
			);

			// Wait before retrying
			await sleep(delay);
		}
	}

	// This should never be reached, but TypeScript needs it
	throw lastError || new Error(`Failed to execute ${operationName}`);
}

/**
 * Execute a contract method call with retry and timeout
 * 
 * @param contract - The ethers Contract instance
 * @param methodName - Name of the contract method to call
 * @param args - Arguments to pass to the method
 * @param config - Retry configuration
 * @returns Result of the contract call
 */
export async function callContractMethod<T = any>(
	contract: ethers.Contract,
	methodName: string,
	args: any[] = [],
	config: RetryConfig = {}
): Promise<T> {
	return executeWithRetry(
		() => contract[methodName](...args) as Promise<T>,
		`contract.${methodName}(${args.join(', ')})`,
		config
	);
}

