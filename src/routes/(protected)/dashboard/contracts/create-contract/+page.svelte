<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { get } from 'svelte/store';
	import { createVaultSet } from '$lib/escrow/vault';
	import { apiCreateContract, apiSaveVaults } from '$lib/escrow/api';
	import type { NetworkName } from '$lib/escrow/types';

	let derivationPath = $state('');
	let csvBlocks = $state<number>(0);
	let freelancerPubkey = $state('');
	let clientPubkey = $state('');
	let error = $state('');
	let isCreating = $state(false);
	let vaultCreated = $state<{
		id: string;
		address?: string | null;
		descriptor?: string | null;
	} | null>(null);
	let contractId = $state<string | null>(null);
	let network: NetworkName = 'liquid';
	let escrowAddress = $state<string | null>(null);
	let fundedSats = $state<number>(0);
	let isPolling = $state(false);

	$effect(() => {
		const url = new URL(get(page).url);
		derivationPath = url.searchParams.get('derivationPath') || '';
		csvBlocks = Number(url.searchParams.get('csvBlocks') || '0');
		freelancerPubkey = url.searchParams.get('freelancerPubkey') || '';
		if (!derivationPath || !csvBlocks || !freelancerPubkey) {
			error = 'Missing contract parameters';
			return;
		}
		// kick off async derivation
		(async () => {
			try {
				const { getMnemonicPasskey } = await import('$lib/wallet/mnemonicBiometrics');
				const { derivePubkeyAtPath } = await import('$lib/wallet/helper');
				const mnemonic = await getMnemonicPasskey();
				clientPubkey = await derivePubkeyAtPath({ mnemonic, derivationPath });
			} catch (e) {
				console.error(e);
				error = 'Failed to derive client pubkey, try refreshing the page';
			}
		})();
	});

	async function createVault() {
		try {
			isCreating = true;
			// 1) Create server-side contract record
			const now = Date.now();
			const contract = await apiCreateContract({
				clientId: 'me', // TODO replace with actual user id
				freelancerId: 'peer', // TODO replace with actual freelancer id
				amountSat: 0, // unknown at contract setup; can be set later
				scheduledAt: now,
				derivationPath,
				clientPubkey,
				freelancerPubkey
			});
			contractId = contract.id;

			// 2) Create vault set (escrow, done, dispute, final)
			const vaults = await createVaultSet({
				clientPubkey,
				freelancerPubkey,
				network
			});

			// Save vaults to backend
			await apiSaveVaults(contract.id, vaults as any);

			// For UI success signal, surface escrow vault basics
			vaultCreated = {
				id: contract.id,
				address: vaults.escrow.address ?? null,
				descriptor: vaults.escrow.descriptor
			};
			escrowAddress = vaults.escrow.address ?? null;
		} catch (e) {
			console.error(e);
			error = 'Failed to create vault';
		} finally {
			isCreating = false;
		}
	}

	$effect(() => {
		if (!escrowAddress || isPolling) return;
		isPolling = true;
		let cancelled = false;
		const poll = async () => {
			try {
				const { getUtxos } = await import('$lib/escrow/psbt');
				const utxos = await getUtxos(escrowAddress!);
				const total = utxos.reduce((a, b) => a + (b.value || 0), 0);
				fundedSats = total;
			} catch (e) {
				console.error('Funding poll error', e);
			}
			if (!cancelled) setTimeout(poll, 5000);
		};
		poll();
		return () => {
			cancelled = true;
			isPolling = false;
		};
	});

	function goBack() {
		goto('/dashboard/messages');
	}
</script>

<div class="space-y-4 p-4">
	<h1 class="text-2xl font-bold">Create Contract</h1>

	{#if error}
		<div class="alert alert-error">{error}</div>
	{:else}
		<div class="grid gap-3">
			<div class="bg-base-200 rounded-xl p-3">
				<div class="text-sm opacity-70">Derivation Path</div>
				<div class="font-mono text-sm break-all">{derivationPath}</div>
			</div>
			<div class="bg-base-200 rounded-xl p-3">
				<div class="text-sm opacity-70">CSV Timelock (blocks)</div>
				<div class="font-mono text-sm">{csvBlocks}</div>
			</div>
			<div class="bg-base-200 rounded-xl p-3">
				<div class="text-sm opacity-70">Freelancer Pubkey</div>
				<div class="font-mono text-sm break-all">{freelancerPubkey}</div>
			</div>
			<div class="bg-base-200 rounded-xl p-3">
				<div class="text-sm opacity-70">Client Pubkey</div>
				<div class="font-mono text-sm break-all">{clientPubkey || 'Deriving...'}</div>
			</div>
		</div>

		<div class="flex gap-2 pt-4">
			<button class="btn" onclick={goBack}>Back</button>
			<button class="btn btn-primary" disabled={!clientPubkey || isCreating} onclick={createVault}>
				{#if isCreating}
					<span class="loading loading-spinner"></span>
					<span>Creating...</span>
				{:else}
					Create Vault
				{/if}
			</button>
		</div>
	{/if}

	{#if vaultCreated}
		<div class="alert alert-success mt-4">
			{#if vaultCreated.address}
				<p>Vault address: <span class="font-mono">{vaultCreated.address}</span></p>
			{:else}
				<p>Vault created successfully</p>
			{/if}
			{#if vaultCreated.descriptor}
				<p>Descriptor: <span class="font-mono break-all">{vaultCreated.descriptor}</span></p>
			{/if}
		</div>
	{/if}
</div>
