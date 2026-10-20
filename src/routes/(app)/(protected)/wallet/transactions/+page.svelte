<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import WalletTransactions from '$lib/components/wallet/WalletTransactions.svelte';
	import { scheduleRgbRefresh } from '$lib/stores/wallet/wallet-balances';
	import { getUtexoWallet } from '$lib/stores/wallet/wallet-init';
	import { walletManager } from '$lib/stores/wallet/wallet-manager';
	import { loadAdvancedMode } from '$lib/stores/wallet/wallet-mode';
	import { walletStore } from '$lib/stores/wallet/wallet-state';

	let refreshing = $state(false);

	async function refreshTransfers(): Promise<void> {
		if (refreshing) return;
		refreshing = true;
		try {
			const wallet = getUtexoWallet();
			if (wallet) await scheduleRgbRefresh(wallet);
			await walletManager.loadAssets();
		} catch (error) {
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

<WalletTransactions onRefresh={refreshTransfers} />
