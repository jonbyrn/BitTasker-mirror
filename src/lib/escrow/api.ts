import type { ContractCreateInput, ContractRecord, VaultInfo } from './types';
import { rpcClient } from './rpc';

export async function apiCreateContract(input: ContractCreateInput): Promise<ContractRecord> {
	const res = await rpcClient.api.contracts.$post({
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
	vaults: Record<string, VaultInfo>
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
	const res = await rpcClient.api.contracts[contractId].vaults.$post({
		json: { vaults: vaultArray }
	});
	if (!res.ok) throw new Error('Failed to save vaults');
}
