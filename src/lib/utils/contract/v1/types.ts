import type { ethers } from 'ethers';

// Output for getEscrow function
export type V1PaymentContractRaw = {
	client: string;
	freelancer: string;
	amount: string;
	estimatedStartTime: number;
	estimatedCompletionTime: number;
	timelockEnd: number;
	createdAt: number;
	clientFeeTier: number;
	freelancerFeeTier: number;
	state: number;
	reserved: number;
};

export type InitializedContract = {
	contract: ethers.Contract;
	wallet: ethers.Wallet;
	provider: ethers.JsonRpcProvider;
};
