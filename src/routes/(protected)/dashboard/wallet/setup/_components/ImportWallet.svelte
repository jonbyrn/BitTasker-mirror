<script lang="ts">
	import { goto } from '$app/navigation';
	import { setMnemonic } from '$lib/wallet/helper';

	let mnemonic = $state('');
	let error = $state('');

	function handleImport() {
		const cleaned = mnemonic.trim().replace(/\s+/g, ' ');
		const wordCount = cleaned.split(' ').length;
		if (wordCount !== 12 && wordCount !== 24) {
			error = 'Please enter a valid 12 or 24-word recovery phrase';
			return;
		}
		setMnemonic(cleaned);
		goto('/dashboard/wallet');
	}
</script>

<div class="p-8">
	<h2 class="mb-6 text-center text-2xl font-bold">Import Existing Wallet</h2>

	<div class="form-control space-y-6">
		<div>
			<span class="label-text font-medium">Enter your seed phrase</span>
			<textarea
				class="textarea textarea-bordered focus:border-primary h-32 w-full rounded-lg"
				placeholder="Enter your 12 or 24 word seed phrase separated by spaces"
				bind:value={mnemonic}
			></textarea>
			<p class="text-base-content/70 mt-1 text-xs">
				Your seed phrase is the 12 or 24 words you received when creating your wallet
			</p>
			{#if error}
				<p class="text-error mt-1 text-xs overflow-ellipsis">{error}</p>
			{/if}
		</div>

		<button class="btn btn-primary w-full" onclick={handleImport}> Import Wallet </button>
	</div>
</div>
