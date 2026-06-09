// Preflight Simulation Service — Validates UserOps before submission
// Based on plan Section 4.10

import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { ENTRY_POINT_ADDRESS } from './gasless.config';
import { UserOperation } from './gasless.service';

// ABI for EntryPoint.simulateValidation
const ENTRY_POINT_ABI = [
	'function simulateValidation(UserOperation calldata userOp) external returns (uint256 preOpGas, uint256 prefund, bool sigFailed, address paymaster, uint256 validationData)'
];

// ABI for decoding revert reasons
const REVERT_REASON_ABI = ['function Error(string reason)'];

@Injectable()
export class PreflightSimulationService {
	private readonly logger = new Logger(PreflightSimulationService.name);
	private readonly provider: ethers.JsonRpcProvider;
	private readonly entryPoint: ethers.Contract;

	constructor() {
		const rpcUrl = process.env['ARBITRUM_RPC_URL'] || 'https://arb1.arbitrum.io/rpc';
		this.provider = new ethers.JsonRpcProvider(rpcUrl);
		this.entryPoint = new ethers.Contract(ENTRY_POINT_ADDRESS, ENTRY_POINT_ABI, this.provider);
	}

	async simulate(userOp: UserOperation): Promise<void> {
		try {
			this.logger.log(`Simulating UserOp for sender ${userOp.sender}`);

			// Convert UserOp strings to ethers format
			const ethersUserOp = {
				sender: userOp.sender,
				nonce: BigInt(userOp.nonce),
				callData: userOp.callData,
				callGasLimit: BigInt(userOp.callGasLimit),
				verificationGasLimit: BigInt(userOp.verificationGasLimit),
				preVerificationGas: BigInt(userOp.preVerificationGas),
				maxFeePerGas: BigInt(userOp.maxFeePerGas),
				maxPriorityFeePerGas: BigInt(userOp.maxPriorityFeePerGas),
				paymasterAndData: userOp.paymasterAndData,
				signature: userOp.signature
			};

			// Call EntryPoint's simulateValidation via eth_call
			// Note: simulateValidation may revert if the UserOp would fail on-chain
			await this.entryPoint.simulateValidation.staticCall(ethersUserOp);

			this.logger.log(`UserOp simulation successful for sender ${userOp.sender}`);
		} catch (e) {
			// Parse revert reason if available
			const reason = this.parseRevertReason(e);
			this.logger.error(`UserOp simulation failed: ${reason}`);
			throw new BadRequestException(`UserOp simulation failed: ${reason}`);
		}
	}

	private parseRevertReason(error: any): string {
		try {
			if (error.data) {
				// Try to decode as Error(string reason)
				const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
					['string'],
					'0x' + error.data.slice(10) // Remove function selector
				);
				return decoded[0];
			}
			if (error.reason) {
				return error.reason;
			}
			if (error.message) {
				// Extract from message if it contains 'revert reason'
				const match = error.message.match(/reverted with reason string '(.+?)'/);
				if (match) return match[1];
			}
			return 'Unknown error';
		} catch {
			return 'Failed to parse revert reason';
		}
	}
}
