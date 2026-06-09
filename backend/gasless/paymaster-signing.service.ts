// Paymaster Signing Service — Server-side ECDSA signer for paymaster data
// Based on plan Section 4.6

import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { ENTRY_POINT_ADDRESS, PAYMASTER_SIGNER_KEY_FILE } from './gasless.config';
import { UserOperation } from './gasless.service';
import * as fs from 'fs';

@Injectable()
export class PaymasterSigningService {
	private readonly logger = new Logger(PaymasterSigningService.name);
	private readonly wallet: ethers.Wallet;
	private readonly chainId: bigint;

	constructor() {
		// Load paymaster signer key from Docker secret or environment
		let privateKey: string;

		try {
			// Try reading from Docker secret file first
			if (fs.existsSync(PAYMASTER_SIGNER_KEY_FILE)) {
				privateKey = fs.readFileSync(PAYMASTER_SIGNER_KEY_FILE, 'utf8').trim();
				this.logger.log('Loaded paymaster signer key from Docker secret file');
			} else if (process.env['PAYMASTER_SIGNER_KEY']) {
				// Fall back to environment variable (for development)
				privateKey = process.env['PAYMASTER_SIGNER_KEY'];
				this.logger.log('Loaded paymaster signer key from environment variable');
			} else {
				throw new Error('No paymaster signer key available');
			}
		} catch (error) {
			this.logger.error(`Failed to load paymaster signer key: ${error.message}`);
			throw new Error(
				'FATAL: Cannot load paymaster signer key. ' +
					'Ensure PAYMASTER_SIGNER_KEY_FILE Docker secret is mounted. ' +
					'Service refuses to start without a valid signer key.'
			);
		}

		this.wallet = new ethers.Wallet(privateKey);
		this.chainId = BigInt(process.env['CHAIN_ID'] || '42161'); // Default to Arbitrum One

		this.logger.log(`Paymaster signing service initialized with address: ${this.wallet.address}`);
	}

	async signPaymasterData(userOp: UserOperation, entryPointAddress: string): Promise<string> {
		// Compute the hash that the Coinbase VerifyingPaymaster contract expects
		const hash = this.computePaymasterHash(userOp, entryPointAddress, this.chainId);

		// Sign with ECDSA
		// Note: ethers.js signMessage() prepends "\x19Ethereum Signed Message:\n32"
		// If the contract uses raw ECDSA.recover, we need to use signingKey.signDigest
		const signature = this.wallet.signingKey.signDigest(hash);

		// Return compact signature (r + s + v)
		return ethers.Signature.from(signature).serialized;
	}

	private computePaymasterHash(
		userOp: UserOperation,
		entryPointAddress: string,
		chainId: bigint
	): string {
		// Hash computation matches the Coinbase VerifyingPaymaster contract
		// keccak256(abi.encode(sender, nonce, keccak256(callData), entryPoint, chainId))
		return ethers.keccak256(
			ethers.AbiCoder.defaultAbiCoder().encode(
				['address', 'uint256', 'bytes32', 'address', 'uint256'],
				[
					userOp.sender,
					BigInt(userOp.nonce),
					ethers.keccak256(ethers.getBytes(userOp.callData)),
					entryPointAddress,
					chainId
				]
			)
		);
	}

	getSignerAddress(): string {
		return this.wallet.address;
	}
}
