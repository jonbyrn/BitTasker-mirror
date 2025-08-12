<script lang="ts">
	import CreateWallet from '$lib/components/wallet/setup/CreateWallet.svelte';
	import ImportWallet from '$lib/components/wallet/setup/ImportWallet.svelte';

	let activeTab = $state('import'); // Default to import tab
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

	<div class="px-8 w-full">
		<button
			class="btn w-full"
			class:btn-primary={activeTab === 'import'}
			class:btn-outline={activeTab !== 'import'}
			class:hidden={activeTab === 'import'}
			aria-pressed={activeTab === 'import'}
			onclick={() => (activeTab = 'import')}>Import Wallet</button
		>
		<button
			class="btn w-full"
			class:btn-primary={activeTab === 'create'}
			class:btn-outline={activeTab !== 'create'}
			class:hidden={activeTab === 'create'}
			aria-pressed={activeTab === 'create'}
			onclick={() => (activeTab = 'create')}>Create Wallet</button
		>
	</div>
</div>
