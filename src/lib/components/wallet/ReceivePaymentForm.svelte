<script lang="ts">
	import { t } from 'svelte-i18n';
	import { walletManager } from '$lib/stores/wallet/wallet-manager';
	import { walletStore } from '$lib/stores/wallet/wallet-state';
	import { appStore } from '$lib/stores/app.store';
	import { getConfiguredRgbUsdtAssetId } from '$lib/types/rgb-contract';
	import { assetButtonTone } from '$lib/components/wallet/wallet-formatters';
	import { receiveUsdtInvoice } from '$lib/stores/wallet/wallet-balances';
	import { lightningStore, requestLspInbound } from '$lib/stores/wallet/signet-lsp';

	type ReceiveAsset = 'btc_onchain' | 'btc_lightning' | 'usdt_rgb';

	let {
		onClose = () => {},
		onchainLocked = false
	}: { onClose?: () => void; onchainLocked?: boolean } = $props();

	let asset = $state<ReceiveAsset>('btc_onchain');
	let amountSats = $state('');
	let isGenerating = $state(false);
	let receiveValue = $state('');
	let errorMessage = $state('');
	let usedBlank = $state(false);

	const assets: Array<{ id: ReceiveAsset; labelKey: string }> = [
		{ id: 'btc_onchain', labelKey: 'wallet.send_form.asset.bitcoin' },
		{ id: 'btc_lightning', labelKey: 'wallet.networks.lightning' },
		{ id: 'usdt_rgb', labelKey: 'wallet.taproot.tether_usd' }
	];

	const onchainAddress = $derived(
		$walletStore.rgb?.address ?? $walletStore.wdk?.btcOnchain?.address ?? ''
	);

	const requiresAmount = $derived(asset !== 'btc_onchain');
	const parsedAmount = $derived.by(() => {
		if (!requiresAmount) return 0;
		const parsed = Number(amountSats);
		return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
	});
	const usdtAssetId = getConfiguredRgbUsdtAssetId();
	const usdtUnconfigured = $derived(asset === 'usdt_rgb' && !usdtAssetId);
	const rgbReceiveLocked = $derived(asset === 'usdt_rgb' && onchainLocked);
	const canGenerate = $derived(
		isGenerating || rgbReceiveLocked
			? false
			: asset === 'btc_onchain'
				? onchainAddress !== ''
				: usdtUnconfigured
					? true
					: parsedAmount !== null
	);

	async function handleGenerate(): Promise<void> {
		errorMessage = '';
		if (asset === 'btc_onchain') {
			receiveValue = onchainAddress || (await walletManager.getRgbAddress());
			return;
		}
		if (asset === 'usdt_rgb') {
			isGenerating = true;
			usedBlank = false;
			try {
				const result = await receiveUsdtInvoice(parsedAmount ?? undefined);
				receiveValue = result.invoice;
				usedBlank = result.blank;
			} catch (err) {
				errorMessage = err instanceof Error ? err.message : 'Failed to generate RGB invoice';
				console.error('[receive-modal] RGB invoice error:', err);
			} finally {
				isGenerating = false;
			}
			return;
		}
		isGenerating = true;
		try {
			const invoice = await requestLspInbound();
			if (!invoice) throw new Error('Lightning invoice was not created');
			receiveValue = invoice;
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Failed to generate Lightning invoice';
			console.error('[receive-modal] Lightning invoice error:', err);
		} finally {
			isGenerating = false;
		}
	}

	async function handleCopy(): Promise<void> {
		if (!receiveValue) return;
		try {
			await navigator.clipboard.writeText(receiveValue);
			appStore.showSuccessToast($t('wallet.taproot.hash_copied'));
		} catch {
			appStore.showErrorToast($t('common.error'));
		}
	}
</script>

<div class="flex flex-col gap-4" data-testid="receive-payment-form">
	<!-- Asset selector -->
	<div class="join w-full" role="group" aria-label={$t('wallet.taproot.token')}>
		{#each assets as option (option.id)}
			<button
				type="button"
				class="btn btn-sm join-item flex-1 {assetButtonTone(option.id)}"
				class:ring-2={asset === option.id}
				class:ring-base-content={asset === option.id}
				onclick={() => {
					asset = option.id;
					receiveValue = '';
					errorMessage = '';
					usedBlank = false;
				}}
				data-testid={`receive-asset-${option.id}`}
			>
				{$t(option.labelKey)}
			</button>
		{/each}
	</div>

	{#if requiresAmount && !usdtUnconfigured}
		<label class="form-control">
			<span class="label-text mb-1"
				>{$t('wallet.taproot.amount')} ({asset === 'usdt_rgb' ? 'USDT' : 'sats'})</span
			>
			<input
				class="input input-bordered w-full"
				inputmode="numeric"
				placeholder="0"
				bind:value={amountSats}
				data-testid="receive-amount"
			/>
		</label>
	{/if}

	{#if rgbReceiveLocked}
		<div
			class="alert alert-outline alert-warning text-sm"
			role="status"
			data-testid="receive-onchain-locked"
		>
			{$t('wallet.receive_waiting')}
		</div>
	{/if}
	{#if asset === 'btc_lightning' && $lightningStore.rgbInvoice}
		<p class="text-xs">{$t('wallet.lightning_rgb_invoice')}</p>
		<p class="font-mono text-xs break-all" data-testid="receive-rgb-invoice">
			{$lightningStore.rgbInvoice}
		</p>
	{/if}
	{#if usdtUnconfigured}
		<div
			class="alert alert-outline alert-warning text-sm"
			role="status"
			data-testid="receive-usdt-unconfigured"
		>
			<span>{$t('wallet.taproot.usdt_not_configured')}</span>
		</div>
	{/if}
	{#if usdtUnconfigured || usedBlank}
		<p class="text-base-content/70 text-sm" data-testid="receive-usdt-blank-hint">
			{$t('wallet.taproot.utexo_bot_hint')}
		</p>
	{/if}

	{#if !receiveValue}
		<button
			type="button"
			class="btn btn-primary w-full"
			onclick={handleGenerate}
			disabled={!canGenerate}
			data-testid="receive-generate"
		>
			{#if isGenerating}
				<span class="loading loading-spinner loading-sm"></span>
			{/if}
			{asset === 'btc_onchain'
				? $t('wallet.taproot.receive_btc')
				: asset === 'btc_lightning'
					? $t('wallet.invoice.share_title')
					: $t('wallet.taproot.receive_usdt')}
		</button>
	{:else}
		<div class="bg-base-200 rounded-lg p-3 font-mono text-xs break-all" data-testid="receive-value">
			{receiveValue}
		</div>
		<button
			type="button"
			class="btn btn-outline w-full"
			onclick={handleCopy}
			data-testid="receive-copy"
		>
			{$t('wallet.taproot.copy_address')}
		</button>
	{/if}

	{#if errorMessage}
		<div class="alert alert-error text-sm" role="alert" data-testid="receive-error">
			{errorMessage}
		</div>
	{/if}

	<p class="text-base-content/60 text-xs">
		{$t('wallet.taproot.make_sure_network')}
	</p>

	<button type="button" class="btn btn-ghost w-full" onclick={onClose} data-testid="receive-close">
		{$t('common.close')}
	</button>
</div>
