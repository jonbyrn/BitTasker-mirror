<script lang="ts">
	import { goto } from '$app/navigation';
	import { getMnemonic } from '$lib/wallet/helper';
	import CreateWallet from './_components/CreateWallet.svelte';
	import ImportWallet from './_components/ImportWallet.svelte';

	let activeTab = $state('import'); // Default to import tab

	$effect.pre(() => {
		getMnemonic()
			.then(() => {
				goto('/dashboard/wallet');
			})
			.catch(() => {
				console.log('No mnemonic found, staying on setup page');
			});
	});
</script>

<div class="bg-base-100 container mx-auto max-w-xl rounded-xl px-4 py-8 shadow-lg">
	<div class="mb-8">
		{#if activeTab === 'import'}
			<ImportWallet />
		{/if}

		{#if activeTab === 'create'}
			<CreateWallet />
		{/if}
	</div>

	<div class="h-16 rounded-xl p-0 px-6 shadow-lg">
		<div class="container mx-auto flex max-w-2xl justify-center gap-4">
			<button
				class="btn h-16 max-w-xs flex-1"
				class:btn-primary={activeTab === 'import'}
				class:btn-outline={activeTab !== 'import'}
				aria-pressed={activeTab === 'import'}
				onclick={() => (activeTab = 'import')}>Import Wallet</button
			>
			<button
				class="btn h-16 max-w-xs flex-1"
				class:btn-primary={activeTab === 'create'}
				class:btn-outline={activeTab !== 'create'}
				aria-pressed={activeTab === 'create'}
				onclick={() => (activeTab = 'create')}>Create Wallet</button
			>
		</div>
	</div>
</div>
