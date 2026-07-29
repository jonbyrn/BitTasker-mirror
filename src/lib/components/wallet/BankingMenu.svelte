<script lang="ts">
	import { t } from 'svelte-i18n';
	import {
		isChangeallySwapsEnabled,
		isChangeallyFiatEnabled,
		isSymbiosisEnabled,
		isLifiEnabled
	} from '$lib/services/kill-switch';
	import IconClose from '~icons/mdi/close';
	import IconSend from '~icons/mdi/send';
	import IconDownload from '~icons/mdi/download';
	import IconPlus from '~icons/mdi/plus';
	import IconMinus from '~icons/mdi/minus';
	import IconSwapVertical from '~icons/mdi/swap-vertical';

	// -----------------------------------------------------------------------
	// Feature flags
	// -----------------------------------------------------------------------
	let swapsEnabled = $state(isChangeallySwapsEnabled() || isSymbiosisEnabled() || isLifiEnabled());
	let fiatEnabled = $state(isChangeallyFiatEnabled());

	// -----------------------------------------------------------------------
	// Props
	// -----------------------------------------------------------------------
	let { onclose }: { onclose?: () => void } = $props();

	// -----------------------------------------------------------------------
	// Actions
	// -----------------------------------------------------------------------
	function handleSend() {
		onclose?.();
		// Navigate or emit event — parent handles routing to send form
		dispatchCustomEvent('banking:send');
	}

	function handleReceive() {
		onclose?.();
		dispatchCustomEvent('banking:receive');
	}

	function handleBuy() {
		onclose?.();
		dispatchCustomEvent('banking:buy');
	}

	function handleSell() {
		onclose?.();
		dispatchCustomEvent('banking:sell');
	}

	/**
	 * Dispatch a custom event on the nearest dialog ancestor so the parent
	 * can react (e.g. switch tabs, open a sub-form).
	 */
	function dispatchCustomEvent(eventName: string) {
		const el = document.querySelector(`#banking-menu-modal`) as HTMLElement | null;
		if (el) {
			el.dispatchEvent(new CustomEvent(eventName, { bubbles: true }));
		}
	}
</script>

<!-- daisyUI modal for Banking Menu -->
<dialog id="banking-menu-modal" class="modal">
	<div class="modal-box max-w-md p-0">
		<!-- Header -->
		<div class="bg-base-200 flex items-center justify-between rounded-t-2xl px-6 py-4">
			<h2 class="text-lg font-semibold md:text-xl">{$t('wallet.title')}</h2>
			<form method="dialog">
				<button
					class="btn btn-ghost btn-sm btn-circle"
					onclick={onclose}
					aria-label={$t('wallet.buy_sell.cancel')}
				>
					<IconClose class="h-5 w-5" />
				</button>
			</form>
		</div>

		<!-- Action Cards -->
		<div class="grid grid-cols-2 gap-4 p-6">
			<!-- Send -->
			<button
				class="card bg-base-100 border-base-200 hover:border-primary focus:ring-primary cursor-pointer border p-4 text-center shadow-md transition-shadow hover:shadow-lg focus:ring-2 focus:outline-none active:scale-[0.97]"
				onclick={handleSend}
			>
				<div class="flex flex-col items-center gap-2">
					<div class="bg-primary/10 rounded-full p-3">
						<IconSend class="text-primary h-6 w-6" />
					</div>
					<span class="text-sm font-medium">{$t('wallet.send_button')}</span>
					<span class="text-base-content/60 text-xs">
						{$t('wallet.send.title')}
					</span>
				</div>
			</button>

			<!-- Receive -->
			<button
				class="card bg-base-100 border-base-200 hover:border-primary focus:ring-primary cursor-pointer border p-4 text-center shadow-md transition-shadow hover:shadow-lg focus:ring-2 focus:outline-none active:scale-[0.97]"
				onclick={handleReceive}
			>
				<div class="flex flex-col items-center gap-2">
					<div class="bg-secondary/10 rounded-full p-3">
						<IconDownload class="text-secondary h-6 w-6" />
					</div>
					<span class="text-sm font-medium">{$t('wallet.tab_receive')}</span>
					<span class="text-base-content/60 text-xs">
						{$t('wallet.receive.title')}
					</span>
				</div>
			</button>

			{#if fiatEnabled}
				<!-- Buy (fiat on-ramp) -->
				<button
					class="card bg-base-100 border-base-200 hover:border-success focus:ring-success cursor-pointer border p-4 text-center shadow-md transition-shadow hover:shadow-lg focus:ring-2 focus:outline-none active:scale-[0.97]"
					onclick={handleBuy}
				>
					<div class="flex flex-col items-center gap-2">
						<div class="bg-success/10 rounded-full p-3">
							<IconPlus class="text-success h-6 w-6" />
						</div>
						<span class="text-sm font-medium">{$t('wallet.buy_sell.buy')}</span>
						<span class="text-base-content/60 text-xs">
							{$t('wallet.buy_sell.buy_with_fiat')}
						</span>
					</div>
				</button>

				<!-- Sell (fiat off-ramp) -->
				<button
					class="card bg-base-100 border-base-200 hover:border-warning focus:ring-warning cursor-pointer border p-4 text-center shadow-md transition-shadow hover:shadow-lg focus:ring-2 focus:outline-none active:scale-[0.97]"
					onclick={handleSell}
				>
					<div class="flex flex-col items-center gap-2">
						<div class="bg-warning/10 rounded-full p-3">
							<IconMinus class="text-warning h-6 w-6" />
						</div>
						<span class="text-sm font-medium">{$t('wallet.buy_sell.sell')}</span>
						<span class="text-base-content/60 text-xs">
							{$t('wallet.buy_sell.sell_to_fiat')}
						</span>
					</div>
				</button>
			{/if}

			<!-- Swap (only when swaps are enabled) -->
			{#if swapsEnabled}
				<button
					class="card bg-base-100 border-base-200 hover:border-info focus:ring-info cursor-pointer border p-4 text-center shadow-md transition-shadow hover:shadow-lg focus:ring-2 focus:outline-none active:scale-[0.97]"
					onclick={() => {
						onclose?.();
						dispatchCustomEvent('banking:swap');
					}}
				>
					<div class="flex flex-col items-center gap-2">
						<div class="bg-info/10 rounded-full p-3">
							<IconSwapVertical class="text-info h-6 w-6" />
						</div>
						<span class="text-sm font-medium">{$t('wallet.swap.swap_crypto')}</span>
						<span class="text-base-content/60 text-xs">
							{$t('wallet.swap.title')}
						</span>
					</div>
				</button>
			{/if}
		</div>

		<!-- Close button at bottom -->
		<div class="border-base-300 border-t px-6 py-3">
			<form method="dialog" class="flex justify-center">
				<button class="btn btn-ghost btn-sm w-full" onclick={onclose}>
					{$t('wallet.buy_sell.cancel')}
				</button>
			</form>
		</div>
	</div>

	<!-- Backdrop click closes modal (daisyUI default) -->
	<form method="dialog" class="modal-backdrop">
		<button onclick={onclose}>{$t('wallet.connected.close')}</button>
	</form>
</dialog>
