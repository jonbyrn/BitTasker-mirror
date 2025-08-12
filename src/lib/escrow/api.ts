import { API_BASE } from '$lib/config';
import type { ContractCreateInput, ContractRecord, VaultInfo } from './types';

async function http<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(`${API_BASE}${path}`, {
		headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
		...init
	});
	if (!res.ok) {
		const text = await res.text().catch(() => '');
		throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
	}
	return (await res.json()) as T;
}

export async function apiCreateContract(input: ContractCreateInput): Promise<ContractRecord> {
	return http<ContractRecord>('/api/contracts', {
		method: 'POST',
		body: JSON.stringify({
			client_id: input.clientId,
			freelancer_id: input.freelancerId,
			amount_sat: input.amountSat,
			scheduled_at: input.scheduledAt,
			derivation_path: input.derivationPath,
			client_pubkey: input.clientPubkey,
			freelancer_pubkey: input.freelancerPubkey
		})
	});
}

export async function apiSaveVaults(
	contractId: string,
	vaults: Record<string, VaultInfo>
): Promise<void> {
	await http<void>(`/api/contracts/${contractId}/vaults`, {
		method: 'POST',
		body: JSON.stringify({ vaults })
	});
}
