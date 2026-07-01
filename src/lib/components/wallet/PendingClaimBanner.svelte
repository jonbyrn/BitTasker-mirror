<!--
  PendingClaimBanner — shows when a connected wallet reverse swap has
  received its Lightning payment and RBTC is ready to claim.

  Renders a daisyUI alert with the amount and a "Claim" button.
  The user taps Claim → confirms on their connected wallet → RBTC claimed.
-->
<script lang="ts">
	import { t } from 'svelte-i18n';
	import type { PendingConnectedSwap } from '$lib/services/connected-wallet-reverse-swap';
	import { claimPendingSwap } from '$lib/services/connected-wallet-reverse-swap';
	import { getHandle } from '$lib/stores/connected-wallets.store';
	import { appStore } from '$lib/stores/app.store';
	import IconLightning from '~icons/mdi/lightning-bolt';
	import IconClose from '~icons/mdi/close';
	import { formatSats } from '$lib/stores/wallet.store';

	let {
		claims,
		onDismiss
	}: {
		claims: PendingConnectedSwap[];
		onDismiss: (swapId: string) => void;
	} = $props();

	let claimingId = $state<string | null>(null);
	let claimError = $state<string | null>(null);

	async function handleClaim(swap: PendingConnectedSwap) {
		const handle = getHandle(swap.connectedWalletId);
		if (!handle?.evmSigner) {
			claimError = $t('wallet.receive.claim_wallet_not_connected');
			return;
		}

		claimingId = swap.swapId;
		claimError = null;

		try {
			await claimPendingSwap(swap, handle.evmSigner);
			appStore.showSuccessToast($t('wallet.receive.connected_claim_success'));
		} catch (err) {
			claimError = err instanceof Error ? err.message : String(err);
			appStore.showErrorToast(
				$t('wallet.receive.connected_claim_failed', { values: { error: claimError } })
			);
		} finally {
			claimingId = null;
		}
	}
</script>

{#if claims.length > 0}
	<div class="flex flex-col gap-2">
		{#each claims as claim (claim.swapId)}
			<div class="alert alert-outline border-warning gap-2 py-3" role="status" aria-live="polite">
				<div class="flex min-w-0 flex-1 items-center gap-2">
					<IconLightning class="text-warning h-5 w-5 shrink-0" />
					<div class="min-w-0 flex-1">
						<div class="text-sm font-semibold">
							{$t('wallet.receive.lightning_payment_received')}
						</div>
						<div class="text-base-content/70 text-xs">
							{formatSats(claim.expectedAmount)} → {claim.connectedWalletName}
						</div>
					</div>
				</div>
				<div class="flex items-center gap-2">
					<button
						class="btn btn-warning btn-sm min-h-[44px]"
						onclick={() => handleClaim(claim)}
						disabled={claimingId !== null}
					>
						{#if claimingId === claim.swapId}
							<span class="loading loading-spinner loading-xs"></span>
							{$t('wallet.receive.claiming')}
						{:else}
							{$t('wallet.receive.claim_rbtc')}
						{/if}
					</button>
					<button
						class="btn btn-ghost btn-sm btn-circle min-h-[44px] min-w-[44px]"
						onclick={() => onDismiss(claim.swapId)}
						aria-label={$t('wallet.receive.dismiss_claim')}
					>
						<IconClose class="h-4 w-4" />
					</button>
				</div>
			</div>
		{/each}
		{#if claimError}
			<div class="alert alert-error py-2 text-xs" role="alert">
				<span>{claimError}</span>
			</div>
		{/if}
	</div>
{/if}
