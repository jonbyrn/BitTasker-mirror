<script lang="ts">
	import { t } from 'svelte-i18n';
	import { allAssets } from '$lib/stores/wallet.store';
	import { isLoanFlowEnabled } from '$lib/services/kill-switch';

	// Derived state from wallet store for potentially stuck tokens
	let docBalance = $derived($allAssets.find((a) => a.assetId === 'doc-rsk')?.balance ?? 0);
	let usdt0RskBalance = $derived($allAssets.find((a) => a.assetId === 'usdt0-rsk')?.balance ?? 0);

	let showActionSheet = $state(false);

	let hasStuckFunds = $derived(isLoanFlowEnabled() && (docBalance > 0 || usdt0RskBalance > 0));

	function handleDismiss() {
		showActionSheet = false;
	}

	function handleRetrySwap() {
		showActionSheet = false;
		// Dispatch event for parent to handle
		dispatchCustomEvent('loan:retry-swap');
	}

	function handleRetryBridge() {
		showActionSheet = false;
		dispatchCustomEvent('loan:retry-bridge');
	}

	function handleRedeemDoc() {
		showActionSheet = false;
		dispatchCustomEvent('loan:redeem-doc');
	}

	function handleKeep() {
		showActionSheet = false;
	}

	function handleGetHelp() {
		showActionSheet = false;
		dispatchCustomEvent('loan:get-help');
	}

	function dispatchCustomEvent(eventName: string) {
		const el = document.querySelector('[data-loan-banner]') as HTMLElement | null;
		if (el) {
			el.dispatchEvent(new CustomEvent(eventName, { bubbles: true }));
		}
	}
</script>

{#if hasStuckFunds}
	<div data-loan-banner>
		<!-- Blue info banner -->
		<button
			class="alert alert-soft alert-info w-full cursor-pointer text-left text-xs sm:text-sm"
			onclick={() => (showActionSheet = !showActionSheet)}
		>
			<svg class="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<div class="flex-1">
				{#if docBalance > 0}
					{$t('wallet.loan.paused_doc_desc', { values: { amount: docBalance.toFixed(2) } })}
				{:else if usdt0RskBalance > 0}
					{$t('wallet.loan.paused_usdt0_title')}
				{/if}
			</div>
			<span class="text-primary text-xs font-medium sm:text-sm">
				{$t('wallet.loan.paused_retry_swap')}
			</span>
		</button>

		<!-- Action sheet (overlay) -->
		{#if showActionSheet}
			<!-- backdrop click handler -->
			<div
				class="fixed inset-0 z-50 bg-black/50"
				onclick={handleDismiss}
				onkeydown={(e) => {
					if (e.key === 'Escape') showActionSheet = false;
				}}
				role="presentation"
			></div>

			<div
				class="bg-base-100 fixed right-0 bottom-0 left-0 z-60 rounded-t-2xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] shadow-xl"
			>
				<div class="mb-3 flex items-center justify-between">
					<h3 class="text-lg font-bold">
						{#if docBalance > 0}
							{$t('wallet.loan.paused_doc_title')}
						{:else}
							{$t('wallet.loan.paused_usdt0_title')}
						{/if}
					</h3>
					<button
						class="btn btn-ghost btn-sm btn-circle"
						onclick={handleDismiss}
						aria-label={$t('wallet.loan.paused_dismiss')}
					>
						<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					</button>
				</div>

				<div class="text-base-content/70 mb-4 text-sm leading-relaxed">
					{#if docBalance > 0}
						{$t('wallet.loan.paused_doc_desc', { values: { amount: docBalance.toFixed(2) } })}
					{:else}
						{$t('wallet.loan.paused_doc_desc', { values: { amount: usdt0RskBalance.toFixed(2) } })}
					{/if}
				</div>

				<div class="space-y-2">
					{#if docBalance > 0}
						<button class="btn btn-primary min-h-[44px] w-full text-sm" onclick={handleRetrySwap}>
							{$t('wallet.loan.paused_retry_swap')}
						</button>
						<button class="btn btn-outline min-h-[44px] w-full text-sm" onclick={handleRetryBridge}>
							{$t('wallet.loan.paused_retry_bridge')}
						</button>
						<button class="btn btn-outline min-h-[44px] w-full text-sm" onclick={handleRedeemDoc}>
							{$t('wallet.loan.paused_redeem_rbtc')}
						</button>
					{:else}
						<button class="btn btn-primary min-h-[44px] w-full text-sm" onclick={handleRetryBridge}>
							{$t('wallet.loan.paused_retry_bridge')}
						</button>
						<button class="btn btn-ghost min-h-[44px] w-full text-sm" onclick={handleKeep}>
							{$t('wallet.loan.paused_keep')}
						</button>
					{/if}
					<button class="btn btn-ghost min-h-[44px] w-full text-sm" onclick={handleGetHelp}>
						{$t('wallet.loan.paused_get_help')}
					</button>
				</div>

				<div class="mt-3 text-center">
					<button class="btn btn-ghost btn-sm w-full" onclick={handleDismiss}>
						{$t('wallet.loan.paused_dismiss')}
					</button>
				</div>
			</div>
		{/if}
	</div>
{/if}
