<script lang="ts">
	// TODO: Add globally to all wallet pages
	// Import polyfills FIRST before any other imports that might use Buffer/bitcoinjs-lib
	import '$lib/polyfills';

	import { goto } from '$app/navigation';
	import { setupMnemonicPasskey } from '$lib/wallet/mnemonicBiometrics';
	import { t } from 'svelte-i18n';

	let mnemonic = $state('');
	let error = $state('');

	function handleImport() {
		const cleaned = mnemonic.trim().replace(/\s+/g, ' ');
		const wordCount = cleaned.split(' ').length;
		if (wordCount !== 12 && wordCount !== 24) {
			error = $t('common.components.wallet.import_wallet.invalid_phrase');
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
	<h2 class="mb-6 text-center text-2xl font-bold">{$t('common.components.wallet.import_wallet.title')}</h2>

	<div class="form-control space-y-6">
		<div>
			<span class="label-text font-medium">{$t('common.components.wallet.import_wallet.enter_seed')}</span>
			<textarea
				class="textarea textarea-bordered focus:border-primary h-32 w-full rounded-lg"
				placeholder={$t('common.components.wallet.import_wallet.placeholder')}
				bind:value={mnemonic}
			></textarea>
			<p class="text-base-content/70 mt-1 text-xs">
				{$t('common.components.wallet.import_wallet.description')}
			</p>
			{#if error}
				<p class="text-error mt-1 text-xs overflow-ellipsis">{error}</p>
			{/if}
		</div>

		<button class="btn btn-primary w-full" onclick={handleImport}> {$t('common.components.wallet.import_wallet.import')} </button>
	</div>
</div>
