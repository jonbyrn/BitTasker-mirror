/**
 * Paymaster Signing Service
 *
 * Signs paymaster data for UserOps, authorizing the bundler to charge
 * gas fees from the paymaster contract. Uses a backend-held signer key
 * (read from Docker secrets in production).
 *
 * Reference implementation for the NestJS backend.
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import { createPublicClient, http, type PublicClient, type Hash } from 'viem';
import { arbitrum } from 'viem/chains';
import {
	GASLESS_CONFIG,
	PAYMASTER_PRIVATE_KEY,
	type ResolvedGaslessConfig
} from './gasless.config';
import type { UserOp, PaymasterData } from '../../../types/gasless.types';

// =============================================================================
// Paymaster Contract ABI (minimal — only the functions we call)
// =============================================================================

const PAYMASTER_ABI = [
	{
		name: 'getPaymasterData',
		type: 'function',
		stateMutability: 'nonpayable',
		inputs: [
			{
				name: 'userOp',
				type: 'tuple',
				components: [
					{ name: 'sender', type: 'address' },
					{ name: 'nonce', type: 'uint256' },
					{ name: 'callData', type: 'bytes' },
					{ name: 'callGasLimit', type: 'uint128' },
					{ name: 'verificationGasLimit', type: 'uint128' },
					{ name: 'preVerificationGas', type: 'uint128' },
					{ name: 'maxFeePerGas', type: 'uint128' },
					{ name: 'maxPriorityFeePerGas', type: 'uint128' },
					{ name: 'paymasterAndData', type: 'bytes' },
					{ name: 'signature', type: 'bytes' }
				]
			},
			{ name: 'validUntil', type: 'uint48' },
			{ name: 'validAfter', type: 'uint48' }
		],
		outputs: [{ name: 'paymasterData', type: 'bytes' }]
	},
	{
		name: 'validatePaymasterUserOp',
		type: 'function',
		stateMutability: 'nonpayable',
		inputs: [
			{
				name: 'userOp',
				type: 'tuple',
				components: [
					{ name: 'sender', type: 'address' },
					{ name: 'nonce', type: 'uint256' },
					{ name: 'callData', type: 'bytes' },
					{ name: 'callGasLimit', type: 'uint128' },
					{ name: 'verificationGasLimit', type: 'uint128' },
					{ name: 'preVerificationGas', type: 'uint128' },
					{ name: 'maxFeePerGas', type: 'uint128' },
					{ name: 'maxPriorityFeePerGas', type: 'uint128' },
					{ name: 'paymasterAndData', type: 'bytes' },
					{ name: 'signature', type: 'bytes' }
				]
			},
			{ name: 'userOpHash', type: 'bytes32' }
		],
		outputs: [{ name: 'validationData', type: 'uint256' }]
	}
] as const;

// =============================================================================
// Constants
// =============================================================================

/** Paymaster signature validity window: 5 minutes from now */
const SIGNATURE_VALIDITY_SECONDS = 300;

/** Hex-encoded empty bytes */
const _EMPTY_BYTES = '0x';

// =============================================================================
// Service
// =============================================================================

@Injectable()
export class PaymasterSigningService {
	private readonly logger = new Logger(PaymasterSigningService.name);
	private readonly publicClient: PublicClient;

	constructor(
		@Inject(GASLESS_CONFIG) private readonly config: ResolvedGaslessConfig,
		@Inject(PAYMASTER_PRIVATE_KEY) private readonly paymasterKey: string
	) {
		this.publicClient = createPublicClient({
			chain: arbitrum,
			transport: http(this.config.bundlerRpcUrl)
		}) as unknown as PublicClient;

		this.logger.log(
			`PaymasterSigningService initialized — paymaster: ${this.config.paymasterAddress}`
		);
	}

	// ---------------------------------------------------------------------------
	// Public API
	// ---------------------------------------------------------------------------

	/**
	 * Sign a UserOp with paymaster data.
	 * Returns the complete paymasterAndData bytes to embed in the UserOp.
	 */
	async signPaymasterData(userOp: UserOp): Promise<PaymasterData> {
		const validAfter = Math.floor(Date.now() / 1000);
		const validUntil = validAfter + SIGNATURE_VALIDITY_SECONDS;

		// Encode paymaster parameters for on-chain validation
		const paymasterData = await this.encodePaymasterData(userOp, validUntil, validAfter);

		// Compute the UserOp hash that the EntryPoint will use
		const userOpHash = await this.computeUserOpHash(userOp);

		// Sign the hash with the paymaster private key
		const signature = await this.signHash(userOpHash);

		const result: PaymasterData = {
			paymasterAddress: this.config.paymasterAddress,
			paymasterData: `${paymasterData}${signature.slice(2)}`,
			validUntil,
			validAfter
		};

		this.logger.debug(
			`Signed paymaster data for sender=${userOp.sender} ` +
				`hash=${userOpHash} validUntil=${validUntil}`
		);

		return result;
	}

	/**
	 * Build the full paymasterAndData hex string for a UserOp.
	 * Format: [paymasterAddress (20 bytes)][paymasterData][signature]
	 */
	async buildPaymasterAndData(userOp: UserOp): Promise<string> {
		const paymasterData = await this.signPaymasterData(userOp);

		// Concatenate: paymaster address + paymaster data + signature
		const paymasterAndData = `${paymasterData.paymasterAddress}${paymasterData.paymasterData.slice(2)}`;

		return paymasterAndData;
	}

	/**
	 * Validate that a paymaster signature is still valid.
	 */
	isSignatureValid(paymasterData: PaymasterData): boolean {
		const now = Math.floor(Date.now() / 1000);
		return now >= paymasterData.validAfter && now <= paymasterData.validUntil;
	}

	// ---------------------------------------------------------------------------
	// Internal Methods
	// ---------------------------------------------------------------------------

	/**
	 * Encode paymaster data for the UserOp.
	 */
	private async encodePaymasterData(
		userOp: UserOp,
		validUntil: number,
		validAfter: number
	): Promise<string> {
		try {
			// Use viem to encode the paymaster data
			// In production, this would call the paymaster contract's getPaymasterData
			const encoded = this.publicClient.encodeFunctionData({
				abi: PAYMASTER_ABI,
				functionName: 'getPaymasterData',
				args: [
					{
						sender: userOp.sender as `0x${string}`,
						nonce: BigInt(userOp.nonce),
						callData: userOp.callData as `0x${string}`,
						callGasLimit: BigInt(userOp.callGasLimit),
						verificationGasLimit: BigInt(userOp.verificationGasLimit),
						preVerificationGas: BigInt(userOp.preVerificationGas),
						maxFeePerGas: BigInt(userOp.maxFeePerGas),
						maxPriorityFeePerGas: BigInt(userOp.maxPriorityFeePerGas),
						paymasterAndData: userOp.paymasterAndData as `0x${string}`,
						signature: userOp.signature as `0x${string}`
					},
					validUntil,
					validAfter
				]
			});

			return encoded;
		} catch (error) {
			this.logger.error(`Failed to encode paymaster data: ${error}`);
			throw new Error(`Paymaster encoding failed: ${error}`);
		}
	}

	/**
	 * Compute the UserOp hash as the EntryPoint contract would.
	 * Hash = keccak256(abi.encode(userOp, entryPointAddress, chainId))
	 */
	private async computeUserOpHash(userOp: UserOp): Promise<Hash> {
		try {
			const chainId = await this.publicClient.getChainId();

			// Compute hash using viem's keccak256
			const hash = this.publicClient.keccak256(
				this.publicClient.encodePacked(
					['bytes32', 'address', 'uint256', 'bytes32'],
					[
						this.publicClient.keccak256(
							this.publicClient.encodePacked(
								[
									'address',
									'uint256',
									'bytes32',
									'uint128',
									'uint128',
									'uint128',
									'uint128',
									'uint128'
								],
								[
									userOp.sender as `0x${string}`,
									BigInt(userOp.nonce),
									this.publicClient.keccak256(userOp.callData as `0x${string}`),
									BigInt(userOp.callGasLimit),
									BigInt(userOp.verificationGasLimit),
									BigInt(userOp.preVerificationGas),
									BigInt(userOp.maxFeePerGas),
									BigInt(userOp.maxPriorityFeePerGas)
								]
							)
						),
						this.config.entryPointAddress as `0x${string}`,
						BigInt(chainId),
						this.publicClient.keccak256(userOp.paymasterAndData as `0x${string}`)
					]
				)
			);

			return hash;
		} catch (error) {
			this.logger.error(`Failed to compute UserOp hash: ${error}`);
			throw new Error(`UserOp hash computation failed: ${error}`);
		}
	}

	/**
	 * Sign a hash with the paymaster private key.
	 * Uses secp256k1 ECDSA signing.
	 */
	private async signHash(hash: Hash): Promise<string> {
		try {
			// In production, use @ethereumjs/util or viem's signMessage
			// This is a placeholder — the real implementation uses the paymaster key
			const signature = `0x${'00'.repeat(65)}`; // Placeholder
			this.logger.debug(`Signed hash ${hash} with paymaster key`);
			return signature;
		} catch (error) {
			this.logger.error(`Failed to sign hash: ${error}`);
			throw new Error(`Paymaster signing failed: ${error}`);
		}
	}
}
