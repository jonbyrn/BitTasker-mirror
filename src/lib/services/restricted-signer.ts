/**
 * RestrictedSigner — Phase 1.4
 *
 * A scoped signer wrapper that implements `ethers.AbstractSigner` but only
 * permits EIP-7702 authorization signing via `signTypedData`. All other
 * signing operations (`signMessage`, `signTransaction`) are explicitly
 * rejected.
 *
 * **Security properties:**
 * - The underlying `ethers.Wallet` (which holds the raw private key) is never
 *   exposed to third-party SDKs or calling code.
 * - `signMessage` and `signTransaction` always throw `RestrictedSignerError`.
 * - `signTypedData` validates chainId, nonce, and delegation contract address
 *   before delegating to the underlying wallet.
 *
 * **Usage with Candide AbstractionKit:**
 * ```ts
 * const signer = new RestrictedSigner(wallet, 56n, delegationContractAddress);
 * const signature = await signer.signTypedData(
 *   smartAccount.getUserOperationDomain(),
 *   smartAccount.getUserOperationTypes(),
 *   sponsoredOp
 * );
 * ```
 *
 * @see https://eips.ethereum.org/EIPS/eip-7702
 */

import { AbstractSigner, type Provider, type TransactionRequest } from 'ethers';
import type { TypedDataDomain, TypedDataField } from 'ethers';

// ---------------------------------------------------------------------------
// Custom error
// ---------------------------------------------------------------------------

export class RestrictedSignerError extends Error {
	public readonly code: string;

	constructor(message: string, code: string = 'RESTRICTED_SIGNER_REJECTED') {
		super(message);
		this.name = 'RestrictedSignerError';
		this.code = code;
	}
}

// ---------------------------------------------------------------------------
// Nonce validation helpers
// ---------------------------------------------------------------------------

/** Minimum reasonable nonce value (non-negative). */
const MIN_NONCE = 0n;

/** Maximum reasonable nonce value — far beyond any realistic account age. */
const MAX_NONCE = 1_000_000_000n;

/**
 * Validate that a nonce value is within acceptable bounds.
 * Pure function — deterministic for a given input.
 *
 * @param nonce - The nonce value to validate
 * @returns `true` if the nonce is a valid non-negative integer within bounds
 */
function isValidNonce(nonce: unknown): nonce is bigint | number {
	if (typeof nonce === 'bigint') {
		return nonce >= MIN_NONCE && nonce <= MAX_NONCE;
	}
	if (typeof nonce === 'number') {
		return Number.isInteger(nonce) && nonce >= MIN_NONCE && nonce <= Number(MAX_NONCE);
	}
	return false;
}

/**
 * Validate chainId equality.
 * Pure function — deterministic for a given input.
 *
 * @param actual - Chain ID from the signing domain
 * @param expected - Expected chain ID (from constructor)
 * @returns An error message string, or `null` if valid
 */
function validateChainId(
	actual: bigint | number | string | null | undefined,
	expected: bigint
): string | null {
	if (actual === undefined || actual === null) {
		return 'EIP-712 domain chainId is missing';
	}

	const actualBigInt = typeof actual === 'bigint' ? actual : BigInt(actual);

	if (actualBigInt !== expected) {
		return `Chain ID mismatch: domain has ${actualBigInt} but signer is configured for ${expected}`;
	}

	return null;
}

// ---------------------------------------------------------------------------
// RestrictedSigner
// ---------------------------------------------------------------------------

/**
 * A signer that only permits EIP-7702 authorization signing.
 *
 * Wraps an `ethers.Wallet` but never exposes the private key. All signing
 * requests are validated against the expected chainId, nonce, and delegation
 * contract address before being forwarded.
 */
export class RestrictedSigner extends AbstractSigner {
	/** Underlying wallet — NEVER exposed to external code */
	#wallet: import('ethers').Wallet;

	/** The EVM chain ID this signer is authorised for */
	#expectedChainId: bigint;

	/** The EIP-7702 delegation contract address to validate against */
	#delegationContractAddress: string;

	/**
	 * @param wallet - An ethers Wallet (holds the private key). The wallet is
	 *   retained privately and never exposed.
	 * @param expectedChainId - The EVM chain ID that this signer will accept
	 *   (e.g. 56n for BSC mainnet).
	 * @param delegationContractAddress - The expected EIP-7702 delegation
	 *   contract address (checksummed). Must match the registry's value.
	 */
	constructor(
		wallet: import('ethers').Wallet,
		expectedChainId: bigint,
		delegationContractAddress: string
	) {
		super();

		if (expectedChainId < 0n) {
			throw new RestrictedSignerError('expectedChainId must not be negative');
		}
		if (delegationContractAddress.length === 0) {
			throw new RestrictedSignerError('delegationContractAddress must not be empty');
		}

		this.#wallet = wallet;
		this.#expectedChainId = expectedChainId;
		this.#delegationContractAddress = delegationContractAddress.toLowerCase();
	}

	// -----------------------------------------------------------------------
	// Public accessors (safe — do not expose private key)
	// -----------------------------------------------------------------------

	/**
	 * Get the signer's address.
	 * Safe: only returns the address, not the private key.
	 */
	async getAddress(): Promise<string> {
		return this.#wallet.getAddress();
	}

	/**
	 * Returns the expected chain ID that this signer validates against.
	 */
	getExpectedChainId(): bigint {
		return this.#expectedChainId;
	}

	/**
	 * Returns the delegation contract address that this signer validates against.
	 */
	getDelegationContractAddress(): string {
		return this.#delegationContractAddress;
	}

	// -----------------------------------------------------------------------
	// Provider connection
	// -----------------------------------------------------------------------

	/**
	 * Connect to a provider, returning a new RestrictedSigner instance
	 * (preserving the same security constraints).
	 */
	connect(provider: Provider | null): RestrictedSigner {
		const connectedWallet = this.#wallet.connect(provider);
		return new RestrictedSigner(
			connectedWallet,
			this.#expectedChainId,
			this.#delegationContractAddress
		);
	}

	// -----------------------------------------------------------------------
	// Explicitly rejected operations
	// -----------------------------------------------------------------------

	/**
	 * REJECTED. Throws `RestrictedSignerError`.
	 * This signer only permits EIP-7702 typed data signing.
	 */
	async signMessage(_message: string | Uint8Array): Promise<string> {
		throw new RestrictedSignerError(
			'signMessage is not permitted. This signer only supports EIP-7702 authorization signing via signTypedData.',
			'RESTRICTED_SIGNER_REJECTED'
		);
	}

	/**
	 * REJECTED. Throws `RestrictedSignerError`.
	 * This signer only permits EIP-7702 typed data signing.
	 */
	async signTransaction(_tx: TransactionRequest): Promise<string> {
		throw new RestrictedSignerError(
			'signTransaction is not permitted. This signer only supports EIP-7702 authorization signing via signTypedData.',
			'RESTRICTED_SIGNER_REJECTED'
		);
	}

	// -----------------------------------------------------------------------
	// EIP-7702 authorization signing (with validation)
	// -----------------------------------------------------------------------

	/**
	 * Sign typed data (EIP-712) with **strict validation** for EIP-7702
	 * authorization structures.
	 *
	 * Validates before signing:
	 * 1. `domain.chainId` matches the expected chain ID
	 * 2. `value.nonce` is present and within valid bounds
	 * 3. `value.delegateTo` or similar delegation contract address field
	 *    matches the expected delegation contract (best-effort, present in
	 *    EIP-7702 auth structures)
	 *
	 * If validation fails, throws `RestrictedSignerError` without signing.
	 *
	 * @param domain - EIP-712 domain (must include chainId)
	 * @param types - EIP-712 type definitions
	 * @param value - The typed data value to sign
	 * @returns The EIP-712 signature as a hex string
	 */
	async signTypedData(
		domain: TypedDataDomain,
		types: Record<string, TypedDataField[]>,
		value: Record<string, unknown>
	): Promise<string> {
		// 1. Validate chainId in domain
		const chainIdError = validateChainId(domain.chainId, this.#expectedChainId);
		if (chainIdError !== null) {
			throw new RestrictedSignerError(chainIdError, 'RESTRICTED_SIGNER_CHAIN_ID_MISMATCH');
		}

		// 2. Validate nonce is present and within reasonable bounds
		if (!isValidNonce(value.nonce)) {
			throw new RestrictedSignerError(
				'nonce is required and must be a non-negative integer ≤ 1,000,000,000',
				'RESTRICTED_SIGNER_INVALID_NONCE'
			);
		}

		// 3. Validate delegation contract address (best-effort)
		//    EIP-7702 authorization structures have the delegation address as
		//    the first field. We check if it matches our expected address.
		const delegationAddressError = this.#validateDelegationAddress(value);
		if (delegationAddressError !== null) {
			throw new RestrictedSignerError(
				delegationAddressError,
				'RESTRICTED_SIGNER_DELEGATION_MISMATCH'
			);
		}

		// 4. Delegate signing to the underlying wallet
		return this.#wallet.signTypedData(domain, types, value);
	}

	// -----------------------------------------------------------------------
	// Private helpers
	// -----------------------------------------------------------------------

	/**
	 * Best-effort validation of the delegation contract address.
	 *
	 * Scans the typed data value for fields that resemble delegation contract
	 * addresses (common names: `delegateTo`, `implementation`, or the first
	 * address-typed field). If any such field is found and its value does not
	 * match the expected address, the validation fails.
	 *
	 * @param value - The typed data value to inspect
	 * @returns An error message string, or `null` if the check passes
	 */
	#validateDelegationAddress(value: Record<string, unknown>): string | null {
		for (const key of Object.keys(value)) {
			const val = value[key];

			// Only check string-typed values that look like addresses (0x-prefixed)
			if (typeof val !== 'string' || !val.startsWith('0x')) {
				continue;
			}

			// Skip the sender address (that's the EOA, not the delegation contract)
			if (key === 'sender' || key === 'from' || key === 'to') {
				continue;
			}

			const normalizedVal = val.toLowerCase();

			// If this looks like an address field and doesn't match, reject
			if (
				normalizedVal !== this.#delegationContractAddress &&
				normalizedVal !== '0x0000000000000000000000000000000000000000'
			) {
				return (
					`Delegation contract mismatch in field "${key}": expected ` +
					`${this.#delegationContractAddress}, got ${normalizedVal}`
				);
			}
		}

		return null;
	}
}
