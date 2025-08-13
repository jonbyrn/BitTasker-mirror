<script lang="ts">
	import { goto } from '$app/navigation';
	import { apiGetNostrChallenge, apiListContractsByNostr } from '$lib/escrow/api';
	import type { ContractsByNostrResponse } from '$lib/escrow/types';
	import { getSignedEvent } from '$lib/utils/nostr';
	import { nip19 } from 'nostr-tools';

	let loading = $state(true);
	let error = $state('');
	let data = $state<ContractsByNostrResponse | null>(null);

	let signerNostrNpub = $state<string>('');
	let signerNostrHex = $state<string>('');

	async function authenticateAndLoad() {
		loading = true;
		error = '';
		try {
			const challenge = await apiGetNostrChallenge();
			const signedEvent = await getSignedEvent({ kind: 1, content: challenge });
			// normalize npub/hex for UI purposes
			signerNostrHex = signedEvent.pubkey;
			try {
				signerNostrNpub = nip19.npubEncode(signerNostrHex);
			} catch {
				signerNostrNpub = signerNostrHex;
			}
			data = await apiListContractsByNostr({ challenge, signedEvent });
		} catch (e) {
			console.error(e);
			error = (e as Error)?.message || 'Failed to authenticate';
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		authenticateAndLoad();
	});

	function openDetails(contractId: string) {
		goto(`/dashboard/contracts/${contractId}`);
	}
</script>

<div class="space-y-4 p-4">
	<h1 class="text-2xl font-bold">Your Escrows</h1>

	{#if loading}
		<div class="alert">
			<span class="loading loading-spinner"></span>
			<span>Authenticating with Nostr and loading your escrows…</span>
		</div>
	{:else if error}
		<div class="alert alert-error">{error}</div>
	{:else if data && data.contracts.length === 0}
		<div class="alert">No escrows found for your Nostr identity.</div>
	{:else if data}
		<div class="bg-base-200 rounded-xl p-3">
			<div class="text-sm opacity-70">Signed in as</div>
			<div class="font-mono text-sm break-all">{signerNostrNpub}</div>
		</div>

		<div class="grid gap-3">
			{#each data.contracts as ctr}
				<div class="border-base-300 bg-base-100 rounded-xl border p-3">
					<div class="flex items-center justify-between">
						<div class="space-y-1">
							<div class="font-semibold">Contract {ctr.id}</div>
							<div class="text-xs opacity-70">Status: {ctr.status} • Your role: {ctr.role}</div>
							<div class="text-xs opacity-70">
								Path: <span class="font-mono">{ctr.derivation_path}</span>
							</div>
						</div>
						<button class="btn btn-sm" onclick={() => openDetails(ctr.id)}>Open</button>
					</div>

					<div class="mt-3 grid gap-2">
						{#each ctr.vaults as v}
							<div class="bg-base-200 rounded-lg p-2 text-sm">
								<div class="flex flex-wrap items-center gap-2">
									<span class="badge">{v.type}</span>
									<span class="badge badge-outline">privileged: {v.privileged_party}</span>
									<span class="badge badge-outline">CSV: {v.csv_blocks}</span>
								</div>
								{#if v.address}
									<div class="mt-1 font-mono text-xs break-all">{v.address}</div>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
