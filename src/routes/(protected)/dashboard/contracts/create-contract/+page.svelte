<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { get } from 'svelte/store';
	import { createVaultSet } from '$lib/escrow/vault';
	import { apiCreateContract, apiSaveVaults, apiCheckEscrow } from '$lib/escrow/api';
	import type { NetworkName } from '$lib/escrow/types';

	let derivationPath = $state('');
	// let csvBlocks = $state<number>(0);
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
	let isChecking = $state(false);
	let existingEscrow = $state<{
		contractId: string;
		address?: string | null;
		descriptor?: string | null;
	} | null>(null);

	$effect(() => {
		const url = new URL(get(page).url);
		derivationPath = url.searchParams.get('derivationPath') || '';
		// csvBlocks = Number(url.searchParams.get('csvBlocks') || '0');
		freelancerPubkey = url.searchParams.get('freelancerPubkey') || '';
		if (!derivationPath || !freelancerPubkey) {
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
				// After deriving clientPubkey, check if escrow already exists
				isChecking = true;
				existingEscrow = null;
				try {
					const res = await apiCheckEscrow({
						derivationPath,
						clientPubkey,
						freelancerPubkey
					});
					if (res.exists) {
						existingEscrow = {
							contractId: res.contract_id!,
							address: res.escrow_vault?.address ?? null,
							descriptor: res.escrow_vault?.descriptor ?? null
						};
						contractId = res.contract_id || null;
						vaultCreated = {
							id: res.contract_id!,
							address: res.escrow_vault?.address ?? null,
							descriptor: res.escrow_vault?.descriptor ?? null
						};
						escrowAddress = res.escrow_vault?.address ?? null;
					}
				} catch (e) {
					console.error('escrow check failed', e);
				} finally {
					isChecking = false;
				}
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
			<!-- <div class="bg-base-200 rounded-xl p-3">
				<div class="text-sm opacity-70">CSV Timelock (blocks)</div>
				<div class="font-mono text-sm">{csvBlocks}</div>
			</div> -->
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
			<button
				class="btn btn-primary"
				disabled={!clientPubkey || isCreating || isChecking || !!existingEscrow}
				onclick={createVault}
			>
				{#if isCreating}
					<span class="loading loading-spinner"></span>
					<span>Creating...</span>
				{:else if isChecking}
					<span class="loading loading-spinner"></span>
					<span>Checking existing escrow...</span>
				{:else if existingEscrow}
					Already exists
				{:else}
					Create Vault
				{/if}
			</button>
		</div>
	{/if}

	{#if isChecking}
		<div class="alert">
			<span class="loading loading-spinner"></span><span>Checking for existing escrow...</span>
		</div>
	{:else if existingEscrow}
		<div class="alert alert-success mt-4 flex flex-col justify-start gap-2">
			<h3 class="text-lg font-bold">An escrow already exists.</h3>
			<p>Contract ID: <span class="font-mono">{existingEscrow.contractId}</span></p>
			{#if existingEscrow.address}
				<p>Vault address: <span class="font-mono">{existingEscrow.address}</span></p>
			{/if}
			{#if existingEscrow.descriptor}
				<p>Descriptor: <span class="font-mono break-all">{existingEscrow.descriptor}</span></p>
			{/if}
		</div>
	{:else if vaultCreated}
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
