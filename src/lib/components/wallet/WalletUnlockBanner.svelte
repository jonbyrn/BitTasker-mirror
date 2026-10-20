<script lang="ts">
	import { t } from 'svelte-i18n';
	import { appStore } from '$lib/stores/app.store';
	import { walletManager } from '$lib/stores/wallet.store';
	import { walletNeedsPasskeyUnlock } from '$lib/utils/wallet/wallet-unlock';

	let needsUnlock = $derived(walletNeedsPasskeyUnlock($appStore.nostrKeys?.mnemonic));
	let unlocking = $state(false);

	async function unlockWallet() {
		if (unlocking) return;
		unlocking = true;
		try {
			await walletManager.initialize({ prompt: 'unlock' });
			await walletManager.loadAssets();
		} catch (error) {
			console.error('Failed to unlock wallet:', error);
		} finally {
			unlocking = false;
		}
	}
</script>

{#if needsUnlock}
	<div
		class="alert alert-outline border-primary flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between"
		role="status"
	>
		<p class="text-sm sm:text-base">{$t('wallet.page.unlock_with_passkey_hint')}</p>
		<button type="button" class="btn btn-primary" onclick={unlockWallet} disabled={unlocking}>
			{unlocking ? $t('wallet.page.unlocking_with_passkey') : $t('wallet.page.unlock_with_passkey')}
		</button>
	</div>
{/if}
