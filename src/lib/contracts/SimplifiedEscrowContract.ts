// Simplified Escrow Contract ABI and Configuration
// This file contains the test ABI and configuration for the escrow contract
// Replace TEST_CONTRACT_ADDRESS and TEST_CONTRACT_ABI with actual values when available

import { ethers } from 'ethers';

// Test contract address - replace with actual deployed contract address
export const TEST_CONTRACT_ADDRESS = '0x1234567890123456789012345678901234567890';

// Test contract ABI - replace with actual contract ABI
export const TEST_CONTRACT_ABI = [
	// Constructor
	{
		"inputs": [],
		"stateMutability": "nonpayable",
		"type": "constructor"
	},

	// Core Escrow Functions
	{
		"inputs": [
			{ "internalType": "address", "name": "freelancer", "type": "address" },
			{ "internalType": "uint256", "name": "estimatedStartTime", "type": "uint256" },
			{ "internalType": "uint256", "name": "estimatedCompletionTime", "type": "uint256" },
			{ "internalType": "uint256", "name": "clientFeeTier", "type": "uint256" },
			{ "internalType": "uint256", "name": "freelancerFeeTier", "type": "uint256" }
		],
		"name": "createEscrow",
		"outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
		"stateMutability": "payable",
		"type": "function"
	},

	{
		"inputs": [{ "internalType": "uint256", "name": "escrowId", "type": "uint256" }],
		"name": "completeTask",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},

	{
		"inputs": [{ "internalType": "uint256", "name": "escrowId", "type": "uint256" }],
		"name": "acceptTask",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},

	{
		"inputs": [{ "internalType": "uint256", "name": "escrowId", "type": "uint256" }],
		"name": "cancelEscrow",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},

	// Dispute Functions
	{
		"inputs": [{ "internalType": "uint256", "name": "escrowId", "type": "uint256" }],
		"name": "disputeTask",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},

	{
		"inputs": [
			{ "internalType": "uint256", "name": "escrowId", "type": "uint256" },
			{ "internalType": "uint256", "name": "clientAmount", "type": "uint256" },
			{ "internalType": "uint256", "name": "freelancerAmount", "type": "uint256" }
		],
		"name": "proposeResolution",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},

	{
		"inputs": [{ "internalType": "uint256", "name": "escrowId", "type": "uint256" }],
		"name": "acceptProposal",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},

	{
		"inputs": [{ "internalType": "uint256", "name": "escrowId", "type": "uint256" }],
		"name": "resolveAfterTimelock",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},

	// View Functions
	{
		"inputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
		"name": "escrows",
		"outputs": [
			{ "internalType": "address", "name": "client", "type": "address" },
			{ "internalType": "address", "name": "freelancer", "type": "address" },
			{ "internalType": "uint256", "name": "baseAmount", "type": "uint256" },
			{ "internalType": "uint256", "name": "clientFee", "type": "uint256" },
			{ "internalType": "uint256", "name": "freelancerFee", "type": "uint256" },
			{ "internalType": "uint256", "name": "estimatedStartTime", "type": "uint256" },
			{ "internalType": "uint256", "name": "estimatedCompletionTime", "type": "uint256" },
			{ "internalType": "uint256", "name": "completionTime", "type": "uint256" },
			{ "internalType": "uint256", "name": "timelockExpiry", "type": "uint256" },
			{ "internalType": "uint8", "name": "status", "type": "uint8" }
		],
		"stateMutability": "view",
		"type": "function"
	},

	{
		"inputs": [{ "internalType": "uint256", "name": "escrowId", "type": "uint256" }],
		"name": "getDisputeProposal",
		"outputs": [
			{ "internalType": "address", "name": "proposer", "type": "address" },
			{ "internalType": "uint256", "name": "clientAmount", "type": "uint256" },
			{ "internalType": "uint256", "name": "freelancerAmount", "type": "uint256" },
			{ "internalType": "uint256", "name": "timestamp", "type": "uint256" },
			{ "internalType": "bool", "name": "accepted", "type": "bool" }
		],
		"stateMutability": "view",
		"type": "function"
	},

	{
		"inputs": [],
		"name": "nextEscrowId",
		"outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
		"stateMutability": "view",
		"type": "function"
	},

	{
		"inputs": [],
		"name": "platformFees",
		"outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
		"stateMutability": "view",
		"type": "function"
	},

	// Admin Functions
	{
		"inputs": [],
		"name": "pause",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},

	{
		"inputs": [],
		"name": "unpause",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},

	{
		"inputs": [],
		"name": "withdrawFees",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},

	{
		"inputs": [],
		"name": "paused",
		"outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
		"stateMutability": "view",
		"type": "function"
	},

	{
		"inputs": [],
		"name": "owner",
		"outputs": [{ "internalType": "address", "name": "", "type": "address" }],
		"stateMutability": "view",
		"type": "function"
	},

	// Events
	{
		"anonymous": false,
		"inputs": [
			{ "indexed": true, "internalType": "uint256", "name": "escrowId", "type": "uint256" },
			{ "indexed": true, "internalType": "address", "name": "client", "type": "address" },
			{ "indexed": true, "internalType": "address", "name": "freelancer", "type": "address" },
			{ "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }
		],
		"name": "EscrowCreated",
		"type": "event"
	},

	{
		"anonymous": false,
		"inputs": [
			{ "indexed": true, "internalType": "uint256", "name": "escrowId", "type": "uint256" }
		],
		"name": "TaskCompleted",
		"type": "event"
	},

	{
		"anonymous": false,
		"inputs": [
			{ "indexed": true, "internalType": "uint256", "name": "escrowId", "type": "uint256" }
		],
		"name": "TaskAccepted",
		"type": "event"
	},

	{
		"anonymous": false,
		"inputs": [
			{ "indexed": true, "internalType": "uint256", "name": "escrowId", "type": "uint256" },
			{ "indexed": true, "internalType": "address", "name": "disputer", "type": "address" }
		],
		"name": "TaskDisputed",
		"type": "event"
	},

	{
		"anonymous": false,
		"inputs": [
			{ "indexed": true, "internalType": "uint256", "name": "escrowId", "type": "uint256" },
			{ "indexed": true, "internalType": "address", "name": "proposer", "type": "address" },
			{ "indexed": false, "internalType": "uint256", "name": "clientAmount", "type": "uint256" },
			{ "indexed": false, "internalType": "uint256", "name": "freelancerAmount", "type": "uint256" }
		],
		"name": "DisputeProposed",
		"type": "event"
	},

	{
		"anonymous": false,
		"inputs": [
			{ "indexed": true, "internalType": "uint256", "name": "escrowId", "type": "uint256" },
			{ "indexed": false, "internalType": "uint256", "name": "clientAmount", "type": "uint256" },
			{ "indexed": false, "internalType": "uint256", "name": "freelancerAmount", "type": "uint256" }
		],
		"name": "DisputeResolved",
		"type": "event"
	},

	{
		"anonymous": false,
		"inputs": [
			{ "indexed": true, "internalType": "uint256", "name": "escrowId", "type": "uint256" },
			{ "indexed": false, "internalType": "uint256", "name": "clientAmount", "type": "uint256" },
			{ "indexed": false, "internalType": "uint256", "name": "freelancerAmount", "type": "uint256" }
		],
		"name": "EscrowCancelled",
		"type": "event"
	},

	{
		"anonymous": false,
		"inputs": [
			{ "indexed": true, "internalType": "uint256", "name": "escrowId", "type": "uint256" },
			{ "indexed": false, "internalType": "uint256", "name": "freelancerAmount", "type": "uint256" },
			{ "indexed": false, "internalType": "uint256", "name": "platformFee", "type": "uint256" }
		],
		"name": "EscrowResolved",
		"type": "event"
	}
];

// Fee tier configurations
export const FEE_TIERS = {
	1: { percentage: 250, label: '2.5%' }, // Tier 1: 2.5%
	2: { percentage: 200, label: '2.0%' }, // Tier 2: 2.0%
	3: { percentage: 150, label: '1.5%' }  // Tier 3: 1.5%
} as const;

export type FeeTier = keyof typeof FEE_TIERS;

// Escrow status enum
export enum EscrowStatus {
	Funded = 0,
	Completed = 1,
	InDispute = 2,
	Resolved = 3,
	Cancelled = 4
}

// Contract configuration interface
export interface ContractConfig {
	address: string;
	abi: any[];
	network: 'mainnet' | 'testnet';
}

// Utility function to calculate fee amount
export function calculateFeeAmount(baseAmount: bigint, feeTier: FeeTier): bigint {
	const feePercentage = BigInt(FEE_TIERS[feeTier].percentage);
	return (baseAmount * feePercentage) / 10000n;
}

// Utility function to calculate total payment (base amount + client fee)
export function calculateTotalPayment(baseAmount: bigint, clientFeeTier: FeeTier): bigint {
	const clientFee = calculateFeeAmount(baseAmount, clientFeeTier);
	return baseAmount + clientFee;
}

// Utility function to calculate freelancer payout (base amount - freelancer fee)
export function calculateFreelancerPayout(baseAmount: bigint, freelancerFeeTier: FeeTier): bigint {
	const freelancerFee = calculateFeeAmount(baseAmount, freelancerFeeTier);
	return baseAmount - freelancerFee;
}

// Timelock constants (in seconds)
export const TIMELOCK_PERIODS = {
	COMPLETION: 7 * 24 * 60 * 60, // 7 days
	DISPUTE: 14 * 24 * 60 * 60    // 14 days
} as const;