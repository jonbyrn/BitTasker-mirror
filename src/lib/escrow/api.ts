import type {
	ContractCreateInput,
	ContractRecord,
	VaultInfo,
	EscrowCheckInput,
	EscrowCheckResponse,
	ContractsByNostrResponse,
	NostrAuthPayload
} from './types';
import { rpcClient } from './rpc';

// The generated Hono client is untyped here; treat as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc: any = rpcClient as any;

export async function apiCreateContract(input: ContractCreateInput): Promise<ContractRecord> {
	const res = await rpc.api.contracts.$post({
		json: {
			client_id: input.clientId,
			freelancer_id: input.freelancerId,
			amount_sat: input.amountSat,
			scheduled_at: input.scheduledAt,
			derivation_path: input.derivationPath,
			client_pubkey: input.clientPubkey,
			freelancer_pubkey: input.freelancerPubkey
		}
	});
	return await res.json();
}

export async function apiSaveVaults(
	contractId: string,
	vaults: Record<string, VaultInfo>,
	opts: {
		clientNostrPubkey: string;
		freelancerNostrPubkey: string;
		nostrAuth: {
			challenge: string;
			signedEvent: import('nostr-tools').Event;
		};
	}
): Promise<void> {
	const vaultArray = Object.values(vaults).map((v) => ({
		id: v.id,
		type: v.type,
		privileged_party: v.privileged,
		csv_blocks: v.csvBlocks,
		miniscript_policy: v.miniscriptPolicy,
		miniscript_resolved: v.miniscriptResolved,
		descriptor: v.descriptor,
		address: v.address ?? undefined,
		script_pubkey: v.scriptPubKey ?? undefined,
		witness_script: v.witnessScript ?? undefined
	}));

	// Use direct id segment to avoid param substitution issues in untyped client
	const res = await rpc.api.contracts[contractId].vaults.$post({
		json: {
			client_nostr_pubkey: opts.clientNostrPubkey,
			freelancer_nostr_pubkey: opts.freelancerNostrPubkey,
			nostr_auth: {
				challenge: opts.nostrAuth.challenge,
				signed_event: opts.nostrAuth.signedEvent
			},
			vaults: vaultArray
		}
	});
	if (!res.ok) {
		try {
			const body = await res.json();
			throw new Error(body?.error || 'Failed to save vaults');
		} catch {
			throw new Error('Failed to save vaults');
		}
	}
}

export async function apiCheckEscrow(input: EscrowCheckInput): Promise<EscrowCheckResponse> {
	const res = await rpc.api.contracts['check_escrow'].$post({
		json: {
			derivation_path: input.derivationPath,
			client_pubkey: input.clientPubkey,
			freelancer_pubkey: input.freelancerPubkey
		}
	});
	if (!res.ok) throw new Error('Failed to check escrow');
	return await res.json();
}

export async function apiGetNostrChallenge(): Promise<string> {
	const res = await rpc.api.contracts['challenge'].$get();
	if (!res.ok) throw new Error('Failed to get challenge');
	const body = await res.json();
	return body.challenge as string;
}

export async function apiListContractsByNostr(
	auth: NostrAuthPayload
): Promise<ContractsByNostrResponse> {
	const res = await rpc.api.contracts['by_nostr'].$post({
		json: {
			nostr_auth: {
				challenge: auth.challenge,
				signed_event: auth.signedEvent
			}
		}
	});
	if (!res.ok) {
		try {
			const body = await res.json();
			throw new Error(body?.error || 'Auth failed');
		} catch {
			throw new Error('Auth failed');
		}
	}
	return await res.json();
}
