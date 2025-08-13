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

export interface EscrowCheckInput {
	derivationPath: string;
	clientPubkey: string;
	freelancerPubkey: string;
}

export interface EscrowCheckResponse {
	exists: boolean;
	contract_id?: string;
	escrow_vault?: {
		id: string;
		address: string | null;
		descriptor: string | null;
	};
	challenge: string;
}

export interface NostrAuthPayload {
	challenge: string;
	signedEvent: import('nostr-tools').Event;
}

export interface ContractsByNostrResponse {
	contracts: Array<ContractSummary & { vaults: Array<VaultSummary> }>;
}

export interface ContractSummary {
	id: string;
	status: string;
	role: Party;
	created_at?: number | null;
	derivation_path: string;
	client_pubkey: string;
	freelancer_pubkey: string;
}

export interface VaultSummary {
	id: string;
	type: VaultType;
	privileged_party: Party;
	csv_blocks: number;
	descriptor: string;
	address?: string | null;
}
