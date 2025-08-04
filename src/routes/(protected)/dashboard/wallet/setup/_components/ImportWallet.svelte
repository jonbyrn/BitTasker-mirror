<script lang="ts">
	// TODO: Add globally to all wallet pages
	// Import polyfills FIRST before any other imports that might use Buffer/bitcoinjs-lib
	import '$lib/polyfills';

	import { goto } from '$app/navigation';
	import { setupMnemonicPasskey } from '$lib/wallet/mnemonicBiometrics';

	let mnemonic = $state('pause bird left palm train twenty about talk avoid cruel portion cancel');
	let error = $state('');

	function handleImport() {
		const cleaned = mnemonic.trim().replace(/\s+/g, ' ');
		const wordCount = cleaned.split(' ').length;
		if (wordCount !== 12 && wordCount !== 24) {
			error = 'Please enter a valid 12 or 24-word recovery phrase';
			return;
		}

		setupMnemonicPasskey(cleaned)
			.then(() => {
				goto('/dashboard/wallet');
			})
			.catch((err) => {
				error = err instanceof Error ? err.message : 'An unknown error occurred';
			});
	}
</script>

<div class="p-8 pb-0">
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
