<script lang="ts">
	import { page } from '$app/stores';
	import { get } from 'svelte/store';
	import { rpcClient } from '$lib/escrow/rpc';
	import type { VaultSummary } from '$lib/escrow/types';
	import { apiGetNostrChallenge } from '$lib/escrow/api';
	import { getSignedEvent } from '$lib/utils/nostr';

	// Un-typed Hono client
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const rpc: any = rpcClient as any;

	let loading = $state(true);
	let error = $state('');
	let contractId = $state<string>('');

	let contract = $state<any>(null);
	let vaults = $state<VaultSummary[]>([]);
	let psbts = $state<any[]>([]);
	let disputes = $state<any[]>([]);
	let proposals = $state<any[]>([]);
	let currentRole = $state<'client' | 'freelancer' | null>(null);

	$effect(() => {
		const id = get(page).params.id as string;
		contractId = id;
		loadAll(id);
	});

	async function loadAll(id: string) {
		loading = true;
		error = '';
		try {
			// Identify user via Nostr to compute role for this contract
			let signerForRole: string | null = null;
			try {
				const challenge = await apiGetNostrChallenge();
				const signedEvent = await getSignedEvent({ kind: 1, content: challenge });
				signerForRole = signedEvent.pubkey;
				currentRole = null; // will be set once contract is fetched
			} catch (e) {
				console.warn('Could not determine Nostr role', e);
				currentRole = null;
			}
			const [ctrRes, vRes, pRes, dRes] = await Promise.all([
				rpc.api.contracts[id].$get(),
				rpc.api.contracts[id].vaults.$get(),
				rpc.api.contracts[id].psbts.$get(),
				rpc.api.contracts[id].disputes.$get()
			]);
			if (!ctrRes.ok) throw new Error('Failed to load contract');
			if (!vRes.ok) throw new Error('Failed to load vaults');
			if (!pRes.ok) throw new Error('Failed to load PSBTs');
			if (!dRes.ok) throw new Error('Failed to load disputes');
			contract = await ctrRes.json();
			if (typeof signerForRole === 'string' && signerForRole) {
				if (contract.clientNostrPubkey === signerForRole) currentRole = 'client';
				else if (contract.freelancerNostrPubkey === signerForRole) currentRole = 'freelancer';
			}
			const vBody = await vRes.json();
			vaults = vBody.vaults || [];
			const pBody = await pRes.json();
			psbts = pBody.psbts || [];
			const dBody = await dRes.json();
			disputes = dBody.disputes || [];
			// proposals depend on disputes; load if any
			if ((disputes?.length || 0) > 0) {
				const propRes = await rpc.api.contracts[id].proposals.$get();
				if (propRes.ok) {
					const pb = await propRes.json();
					proposals = pb.proposals || [];
				}
			}
		} catch (e) {
			console.error(e);
			error = (e as Error)?.message || 'Load failed';
		} finally {
			loading = false;
		}
	}

	function roleBadge(role: string) {
		return role === 'client' ? 'badge-primary' : 'badge-secondary';
	}

	// Placeholder action buttons based on role; to be wired to PSBT flows in future
	function availableActionsFor(role: 'client' | 'freelancer') {
		if (role === 'client') {
			return [
				{ key: 'approve', label: 'Approve payment', intent: 'primary' },
				{ key: 'dispute', label: 'Open dispute', intent: 'outline' },
				{ key: 'cancel', label: 'Cancel booking', intent: '' }
			];
		}
		return [
			{ key: 'submit', label: 'Submit work', intent: 'primary' },
			{ key: 'remind', label: 'Remind client', intent: 'outline' }
		];
	}
</script>

<div class="space-y-4 p-4">
	<h1 class="text-2xl font-bold">Escrow Details</h1>

	{#if loading}
		<div class="alert"><span class="loading loading-spinner"></span><span>Loading…</span></div>
	{:else if error}
		<div class="alert alert-error">{error}</div>
	{:else if contract}
		<div class="border-base-300 bg-base-100 space-y-2 rounded-xl border p-3">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<div>
					<div class="font-semibold">Contract {contract.id}</div>
					<div class="text-xs opacity-70">Status: {contract.status}</div>
				</div>
				<div class="text-xs opacity-70">
					Path: <span class="font-mono">{contract.derivationPath}</span>
				</div>
			</div>

			<div class="mt-2 grid gap-3 md:grid-cols-2">
				<div class="bg-base-200 rounded-lg p-3">
					<div class="mb-2 font-semibold">Vaults</div>
					<div class="grid gap-2">
						{#each vaults as v}
							<div class="bg-base-100 border-base-300 rounded-lg border p-2">
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

				<div class="bg-base-200 rounded-lg p-3">
					<div class="mb-2 font-semibold">PSBTs</div>
					{#if psbts.length === 0}
						<div class="text-sm opacity-70">No PSBTs yet.</div>
					{:else}
						<div class="overflow-x-auto">
							<table class="table-sm table">
								<thead>
									<tr>
										<th>Scenario</th>
										<th>Status</th>
										<th>Amount</th>
										<th>Fee</th>
									</tr>
								</thead>
								<tbody>
									{#each psbts as p}
										<tr>
											<td>{p.scenario}</td>
											<td>{p.status}</td>
											<td>{p.amountSat || '-'}</td>
											<td>{p.feeSat || '-'}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</div>
			</div>

			<div class="bg-base-200 rounded-lg p-3">
				<div class="mb-1 font-semibold">Disputes & Proposals</div>
				{#if disputes.length === 0}
					<div class="text-sm opacity-70">No disputes.</div>
				{:else}
					<div class="grid gap-2">
						{#each disputes as d}
							<div class="bg-base-100 border-base-300 rounded-lg border p-2">
								<div class="text-sm">Dispute {d.id} • stage {d.stage}</div>
							</div>
						{/each}
						{#if proposals.length > 0}
							<div class="mt-2">
								<div class="text-sm font-medium">Proposals</div>
								<ul class="list-inside list-disc text-sm">
									{#each proposals as pr}
										<li>Proposal {pr.id} • {pr.status} • vault {pr.vaultId}</li>
									{/each}
								</ul>
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<div class="bg-base-200 rounded-lg p-3">
				<div class="mb-1 font-semibold">Actions</div>
				<div class="mb-2 text-xs opacity-70">
					Shown actions vary by role. Full signing will be implemented next.
				</div>
				{#if currentRole}
					<div class="flex flex-wrap gap-2">
						{#each availableActionsFor(currentRole) as a}
							<button class={`btn btn-sm ${a.intent ? 'btn-' + a.intent : ''}`}>{a.label}</button>
						{/each}
					</div>
				{:else}
					<div class="text-sm opacity-70">Sign in with Nostr to see available actions.</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
