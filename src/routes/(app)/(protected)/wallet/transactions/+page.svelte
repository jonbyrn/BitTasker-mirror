<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import WalletTransactions from '$lib/components/wallet/WalletTransactions.svelte';
	import { refreshIncomingTransfers } from '$lib/stores/wallet/wallet-balances';
	import { walletManager } from '$lib/stores/wallet/wallet-manager';
	import { loadAdvancedMode } from '$lib/stores/wallet/wallet-mode';
	import { walletStore } from '$lib/stores/wallet/wallet-state';

	let refreshing = $state(false);
	let refreshError = $state('');

	async function refreshTransfers(): Promise<void> {
		if (refreshing) return;
		refreshing = true;
		refreshError = '';
		try {
			const result = await refreshIncomingTransfers();
			if (!result.syncing) await walletManager.loadAssets();
			if (result.syncing || result.ok) refreshError = '';
			else refreshError = result.detail ?? '';
		} catch (error) {
			refreshError = error instanceof Error ? error.message : '';
			console.error('[wallet-transactions] refresh failed', error);
		} finally {
			refreshing = false;
		}
	}

	onMount(() => {
		loadAdvancedMode();
		walletManager
			.initialize()
			.then(async () => {
				if ($walletStore.locked) return;
				await refreshTransfers();
			})
			.catch((error: unknown) => {
				console.error('[wallet-transactions] init failed', error);
			});
	});
</script>

<svelte:head>
	<title>{$t('wallet.transactions.title')}</title>
</svelte:head>

{#if refreshError}
	<p class="text-error px-3 pt-3 text-sm" data-testid="transactions-refresh-error">
		{$t('wallet.refresh_transfers_failed')}
		<span class="block">{refreshError}</span>
	</p>
{/if}
<WalletTransactions onRefresh={refreshTransfers} />
