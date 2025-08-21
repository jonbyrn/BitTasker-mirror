<script lang="ts">
	import { goto } from '$app/navigation';
	import { apiGetNostrChallenge, apiListContractsByNostr } from '$lib/escrow/api';
	import type { ContractsByNostrResponse } from '$lib/escrow/types';
	import { getSignedEvent } from '$lib/utils/nostr';
	import { nip19 } from 'nostr-tools';
    import { rpcClient } from '$lib/escrow/rpc';

	let loading = $state(true);
	let error = $state('');
	let data = $state<ContractsByNostrResponse | null>(null);
	let setupStatus = $state<Record<string, { can_fund: boolean; missing: string[] }>>({});

	let signerNostrNpub = $state<string>('');
	let signerNostrHex = $state<string>('');

	// Un-typed Hono client
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const rpc: any = rpcClient as any;

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
			// fetch setup status for each contract to gate funding display
			setupStatus = {};
			if (data?.contracts?.length) {
				const results = await Promise.all(
					data.contracts.map(async (ctr) => {
						const res = await rpc.api.contracts[ctr.id].psbts['setup_status'].$get();
						if (!res.ok) return [ctr.id, { can_fund: false, missing: ['error'] }];
						const body = await res.json();
						return [ctr.id, body];
					})
				);
				setupStatus = Object.fromEntries(results as any);
			}
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
					<div class="flex items-center gap-2">
						{#if setupStatus[ctr.id]?.can_fund}
							<span class="badge badge-success">Ready to fund</span>
						{:else}
							<span class="badge">Setup pending</span>
							{#if ctr.role === 'client'}
								<span class="text-xs opacity-70">Waiting for freelancer signature</span>
							{:else}
								<button class="btn btn-xs" onclick={() => openDetails(ctr.id)}>Sign PSBTs</button>
							{/if}
						{/if}
						<button class="btn btn-sm" onclick={() => openDetails(ctr.id)}>Open</button>
					</div>
					</div>

					<div class="mt-3 grid gap-2">
						{#each ctr.vaults as v}
							<div class="bg-base-200 rounded-lg p-2 text-sm">
								<div class="flex flex-wrap items-center gap-2">
									<span class="badge">{v.type}</span>
									<span class="badge badge-outline">privileged: {v.privileged_party}</span>
									<span class="badge badge-outline">CSV: {v.csv_blocks}</span>
								</div>
							{#if v.type === 'escrow'}
								{#if setupStatus[ctr.id]?.can_fund && v.address}
									<div class="mt-1 font-mono text-xs break-all">{v.address}</div>
								{:else}
									<div class="mt-1 text-xs opacity-70">Funding address will appear after both parties sign required PSBTs.</div>
								{/if}
							{:else if v.address}
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
