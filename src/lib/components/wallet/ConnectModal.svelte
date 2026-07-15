<script lang="ts">
	import { t } from 'svelte-i18n';
	import { FeatureFlagService, FEATURE_FLAGS } from '$lib/services/kill-switch';

	let {
		show = false,
		onClose = () => {},
		connectingType = null as string | null,
		showLedgerConnect = false,
		showLedgerBtcStep = false,
		showLedgerBtcSuccess = false,
		ledgerConnectError = '',
		ledgerBtcError = '',
		ledgerBtcConnecting = false,
		showTrezorBtcStep = false,
		showTrezorBtcSuccess = false,
		trezorBtcError = '',
		trezorBtcConnecting = false,
		onConnectMetaMask = () => {},
		onConnectWC = () => {},
		onConnectTrezor = () => {},
		onConnectLedger = () => {},
		onAddLedgerBitcoin = () => {},
		onAddTrezorBitcoin = () => {},
		onLedgerSkip = () => {},
		onTrezorSkip = () => {}
	}: {
		show?: boolean;
		onClose?: () => void;
		connectingType?: string | null;
		showLedgerConnect?: boolean;
		showLedgerBtcStep?: boolean;
		showLedgerBtcSuccess?: boolean;
		ledgerConnectError?: string;
		ledgerBtcError?: string;
		ledgerBtcConnecting?: boolean;
		showTrezorBtcStep?: boolean;
		showTrezorBtcSuccess?: boolean;
		trezorBtcError?: string;
		trezorBtcConnecting?: boolean;
		onConnectMetaMask?: () => void;
		onConnectWC?: () => void;
		onConnectTrezor?: () => void;
		onConnectLedger?: () => void;
		onAddLedgerBitcoin?: () => void;
		onAddTrezorBitcoin?: () => void;
		onLedgerSkip?: () => void;
		onTrezorSkip?: () => void;
	} = $props();

	let dialogEl = $state<HTMLDialogElement>();

	$effect(() => {
		if (!dialogEl) return;
		if (show && !dialogEl.open) {
			dialogEl.showModal();
		} else if (!show && dialogEl.open) {
			dialogEl.close();
		}
		return () => {
			if (dialogEl?.open) dialogEl.close();
		};
	});
</script>

<dialog bind:this={dialogEl} class="modal" onclose={() => onClose()}>
	<div class="modal-box max-w-sm" role="dialog" aria-modal="true">
	{#if connectingType === 'metamask'}
		<!-- MetaMask Connecting State -->
		<div class="flex flex-col items-center gap-4 py-8 text-center">
			<div class="bg-warning/10 rounded-full p-6">
				<span class="loading loading-spinner loading-lg text-warning"></span>
			</div>
			<h3 class="text-lg font-bold">{$t('wallet.connected.metamask_connecting_title', { default: 'Connecting to MetaMask' })}</h3>
			<p class="text-base-content/70 text-sm leading-relaxed">
				{$t('wallet.connected.metamask_connecting_desc', { default: 'Check your browser for the MetaMask popup. If you don\'t see it, click the MetaMask extension icon in your browser toolbar.' })}
			</p>
		</div>
	{:else if connectingType === 'trezor'}
		<!-- Trezor Connecting State -->
			<div class="flex flex-col items-center gap-4 py-8 text-center">
				<div class="bg-info/10 rounded-full p-6">
					<span class="loading loading-spinner loading-lg text-info"></span>
				</div>
				<h3 class="text-lg font-bold">{$t('wallet.connected.trezor_connecting_title')}</h3>
				<p class="text-base-content/70 text-sm leading-relaxed">
					{$t('wallet.connected.trezor_connecting_desc')}
				</p>
				<div class="text-base-content/50 text-xs">
					{$t('wallet.connected.hardware_tx_confirm_note')}
				</div>
			</div>
		{:else if showLedgerBtcSuccess}
			<!-- Ledger Step 3: Success -->
			<div class="flex flex-col items-center gap-4 py-4 text-center">
				<div class="bg-success/10 rounded-full p-4">
					<svg
						class="text-success h-10 w-10"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						aria-hidden="true"
						><path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
						/></svg
					>
				</div>
				<h3 class="text-lg font-bold">{$t('wallet.connected.ledger.step3_title')}</h3>
				<p class="text-base-content/70 text-sm">
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html $t('wallet.connected.ledger.step3_message')}
				</p>
			</div>
		{:else if showTrezorBtcSuccess}
			<!-- Trezor BTC Step: Success -->
			<div class="flex flex-col items-center gap-4 py-4 text-center">
				<div class="bg-success/10 rounded-full p-4">
					<svg
						class="text-success h-10 w-10"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						aria-hidden="true"
						><path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
						/></svg
					>
				</div>
				<h3 class="text-lg font-bold">{$t('wallet.connected.trezor.btc_success_title')}</h3>
				<p class="text-base-content/70 text-sm">
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html $t('wallet.connected.trezor.btc_success_message')}
				</p>
			</div>
		{:else if showLedgerConnect && !showLedgerBtcStep}
			<!-- Ledger Step 1: Connect Ethereum App -->
			<div class="flex flex-col items-center gap-4 py-4 text-center">
				<div class="bg-info/10 rounded-full p-4">
					<img src="/images/wallets/ledger.svg" alt="Ledger" class="h-12 w-12" />
				</div>
				<h3 class="text-lg font-bold">{$t('wallet.connected.ledger.step1_title')}</h3>
				{#if ledgerConnectError}
					<div class="alert alert-outline alert-warning py-2 text-xs leading-relaxed">
						{ledgerConnectError}
					</div>
					<button class="btn btn-primary btn-sm min-h-[44px]" onclick={onConnectLedger}>
						{$t('wallet.connected.ledger.try_again')}
					</button>
				{:else}
					<p class="text-base-content/70 text-sm leading-relaxed">
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						{@html $t('wallet.connected.ledger.step1_instructions')}
					</p>
					<div class="flex items-center gap-2">
						<span class="loading loading-spinner loading-sm text-info"></span>
						<span class="text-base-content/50 text-xs">{$t('wallet.connected.ledger.waiting')}</span
						>
					</div>
				{/if}
				<button class="btn btn-ghost btn-sm mt-2 min-h-[44px]" onclick={onLedgerSkip}>
					{$t('common.cancel')}
				</button>
			</div>
		{:else if showLedgerBtcStep}
			<!-- Ledger Step 2: Optional Bitcoin -->
			<div class="flex flex-col items-center gap-4 py-4 text-center">
				<div class="bg-success/10 rounded-full p-4">
					<svg
						class="text-success h-8 w-8"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						aria-hidden="true"
						><path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M5 13l4 4L19 7"
						/></svg
					>
				</div>
				<h3 class="text-lg font-bold">{$t('wallet.connected.ledger.step2_title')}</h3>
				<p class="text-base-content/70 text-sm leading-relaxed">
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html $t('wallet.connected.ledger.step2_prompt')}
				</p>
				<p class="text-info text-xs leading-relaxed">
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html $t('wallet.connected.ledger.step2_instructions')}
				</p>
				<div class="flex w-full flex-col gap-2">
					{#if ledgerBtcError}
						<div class="alert alert-outline alert-warning py-2 text-xs leading-relaxed">
							{ledgerBtcError}
						</div>
					{/if}
					<button
						class="btn btn-primary btn-block min-h-[44px]"
						disabled={ledgerBtcConnecting}
						onclick={onAddLedgerBitcoin}
					>
						{#if ledgerBtcConnecting}
							<span class="loading loading-spinner loading-sm"></span>
							{$t('wallet.connected.ledger.connecting')}
						{:else if ledgerBtcError}
							{$t('wallet.connected.ledger.try_again')}
						{:else}
							<img src="/images/chains/Bitcoin.svg" alt="BTC" class="h-5 w-5" />
							{$t('wallet.connected.ledger.connect_btc')}
						{/if}
					</button>
					<button
						class="btn btn-ghost btn-block min-h-[44px]"
						disabled={ledgerBtcConnecting}
						onclick={onLedgerSkip}
					>
						{$t('wallet.connected.ledger.skip_evm')}
					</button>
				</div>
			</div>
		{:else if showTrezorBtcStep}
			<!-- Trezor BTC Step: Optional Bitcoin -->
			<div class="flex flex-col items-center gap-4 py-4 text-center">
				<div class="bg-success/10 rounded-full p-4">
					<svg
						class="text-success h-8 w-8"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						aria-hidden="true"
						><path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M5 13l4 4L19 7"
						/></svg
					>
				</div>
				<h3 class="text-lg font-bold">{$t('wallet.connected.trezor.btc_step_title')}</h3>
				<p class="text-base-content/70 text-sm leading-relaxed">
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html $t('wallet.connected.trezor.btc_step_prompt')}
				</p>
				<p class="text-info text-xs leading-relaxed">
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html $t('wallet.connected.trezor.btc_step_instructions')}
				</p>
				<div class="flex w-full flex-col gap-2">
					{#if trezorBtcError}
						<div class="alert alert-outline alert-warning py-2 text-xs leading-relaxed">
							{trezorBtcError}
						</div>
					{/if}
					<button
						class="btn btn-primary btn-block min-h-[44px]"
						disabled={trezorBtcConnecting}
						onclick={onAddTrezorBitcoin}
					>
						{#if trezorBtcConnecting}
							<span class="loading loading-spinner loading-sm"></span>
							{$t('wallet.connected.trezor.connecting')}
						{:else if trezorBtcError}
							{$t('wallet.connected.trezor.try_again')}
						{:else}
							<img src="/images/chains/Bitcoin.svg" alt="BTC" class="h-5 w-5" />
							{$t('wallet.connected.trezor.connect_btc')}
						{/if}
					</button>
					<button
						class="btn btn-ghost btn-block min-h-[44px]"
						disabled={trezorBtcConnecting}
						onclick={onTrezorSkip}
					>
						{$t('wallet.connected.trezor.skip')}
					</button>
				</div>
			</div>
		{:else}
			<h3 class="mb-3 text-lg font-bold">{$t('wallet.connected.connect_modal_title')}</h3>

			<div class="flex flex-col gap-2">
				{#if FeatureFlagService.isEnabled(FEATURE_FLAGS.CONNECTED_METAMASK)}
					<button
						class="hover:bg-base-200 focus-visible:ring-primary flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40"
						disabled={connectingType !== null}
						onclick={onConnectMetaMask}
					>
						<img
							src="/images/wallets/metamask.svg"
							alt="MetaMask"
							class="h-8 w-8"
							aria-hidden="true"
						/>
						<div>
							<div class="font-medium">{$t('wallet.connected.metamask_name')}</div>
							<div class="text-xs opacity-60">{$t('wallet.connected.metamask_desc')}</div>
						</div>
					</button>
				{/if}

				{#if FeatureFlagService.isEnabled(FEATURE_FLAGS.CONNECTED_WALLETCONNECT)}
					<button
						class="hover:bg-base-200 focus-visible:ring-primary flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40"
						disabled={connectingType !== null}
						onclick={onConnectWC}
					>
						<img
							src="/images/wallets/walletconnect.svg"
							alt="WalletConnect"
							class="h-8 w-8"
							aria-hidden="true"
						/>
						<div>
							<div class="font-medium">{$t('wallet.connected.walletconnect_name')}</div>
							<div class="text-xs opacity-60">
								{$t('wallet.connected.walletconnect_desc')}
							</div>
						</div>
					</button>
				{/if}

				{#if FeatureFlagService.isEnabled(FEATURE_FLAGS.CONNECTED_TREZOR)}
					<button
						class="hover:bg-base-200 focus-visible:ring-primary flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40"
						disabled={connectingType !== null}
						onclick={onConnectTrezor}
					>
						<img src="/images/wallets/trezor.svg" alt="Trezor" class="h-8 w-8" aria-hidden="true" />
						<div>
							<div class="font-medium">{$t('wallet.connected.trezor_name')}</div>
							<div class="text-xs opacity-60">{$t('wallet.connected.hardware_wallet')}</div>
						</div>
					</button>
				{/if}

				{#if FeatureFlagService.isEnabled(FEATURE_FLAGS.CONNECTED_LEDGER)}
					<button
						class="hover:bg-base-200 focus-visible:ring-primary flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40"
						disabled={connectingType !== null}
						onclick={onConnectLedger}
					>
						<img src="/images/wallets/ledger.svg" alt="Ledger" class="h-8 w-8" aria-hidden="true" />
						<div>
							<div class="font-medium">{$t('wallet.connected.ledger_name')}</div>
							<div class="text-xs opacity-60">{$t('wallet.connected.hardware_wallet')}</div>
						</div>
					</button>
				{/if}
			</div>

			<div class="mt-4">
				<button class="btn btn-ghost btn-sm min-h-[44px] w-full" onclick={onClose}
					>{$t('common.cancel')}</button
				>
			</div>
		{/if}
	</div>
	<form method="dialog" class="modal-backdrop">
		<button>{$t('wallet.connected.close')}</button>
	</form>
</dialog>
