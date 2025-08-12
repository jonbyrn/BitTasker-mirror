export type Party = 'client' | 'freelancer';
export type VaultType = 'escrow' | 'done' | 'dispute' | 'final' | 'proposal';
export type NetworkName = 'liquid' | 'testnet';

export interface VaultCreateInput {
	type: VaultType;
	privileged: Party;
	csvBlocks: number;
	clientPubkey: string; // hex
	freelancerPubkey: string; // hex
	network: NetworkName;
}

export interface VaultInfo {
	id?: string; // server id once persisted
	type: VaultType;
	privileged: Party;
	csvBlocks: number;
	miniscriptPolicy: string;
	miniscriptResolved: string;
	descriptor: string;
	address?: string | null;
	scriptPubKey?: string | null; // hex
	witnessScript?: string | null; // hex
}

export interface ContractCreateInput {
	clientId: string;
	freelancerId: string;
	amountSat: number;
	scheduledAt: number; // epoch ms
	derivationPath: string;
	clientPubkey: string;
	freelancerPubkey: string;
}

export interface ContractRecord {
	id: string;
}
