<script lang="ts">
	import { t } from 'svelte-i18n';
	import { walletManager } from '$lib/stores/wallet/wallet-manager';
	import { walletStore } from '$lib/stores/wallet/wallet-state';
	import { appStore } from '$lib/stores/app.store';
	import { getConfiguredRgbUsdtAssetId } from '$lib/types/rgb-contract';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import { formatSats } from '$lib/stores/wallet/wallet-utils';

	type SendAsset = 'btc_onchain' | 'btc_lightning' | 'usdt_rgb';

	let {
		initialAsset = 'btc_onchain',
		onSent = (_txid: string) => {},
		onCancel = () => {}
	}: {
		initialAsset?: SendAsset;
		onSent?: (txid: string) => void;
		onCancel?: () => void;
	} = $props();

	let asset = $state<SendAsset>('btc_onchain');
	let destination = $state('');

	// Sync initial asset exactly once when it differs from the default.
	let initialAssetApplied = false;
	$effect(() => {
		if (!initialAssetApplied && initialAsset !== 'btc_onchain') {
			asset = initialAsset;
			initialAssetApplied = true;
		}
	});
	let amountInput = $state('');
	let unit = $state<'sats' | 'usd'>('sats');
	let feeRate = $state(1);
	let isSending = $state(false);
	let errorMessage = $state('');

	const assets: Array<{ id: SendAsset; labelKey: string; placeholder: string }> = [
		{
			id: 'btc_onchain',
			labelKey: 'wallet.send_form.asset.bitcoin',
			placeholder: 'bc1q...'
		},
		{
			id: 'btc_lightning',
			labelKey: 'wallet.networks.lightning',
			placeholder: 'lnbc...'
		},
		{
			id: 'usdt_rgb',
			labelKey: 'wallet.taproot.tether_usd',
			placeholder: 'rgb1...'
		}
	];

	const walletSats = $derived($walletStore.rgb?.balanceSats ?? 0);

	const amountSats = $derived.by(() => {
		const parsed = Number(amountInput);
		if (!Number.isFinite(parsed) || parsed <= 0) return null;
		if (asset === 'usdt_rgb') return Math.round(parsed * 1_000_000);
		if (unit === 'usd') {
			if (btcPrice.price <= 0) return null;
			return Math.round((parsed / btcPrice.price) * 100_000_000);
		}
		return Math.round(parsed);
	});

	const hasInsufficientBalance = $derived(
		asset !== 'usdt_rgb' && amountSats !== null && amountSats > walletSats
	);

	const destinationValid = $derived.by(() => {
		const value = destination.trim();
		if (!value) return false;
		if (asset === 'btc_onchain') return /^(bc1|tb1|bcrt1)[a-z0-9]{10,}$/i.test(value);
		if (asset === 'btc_lightning') return value.toLowerCase().startsWith('ln');
		return value.length > 8;
	});

	// Lightning invoices embed their own amount — only a valid invoice is required.
	const canSubmit = $derived.by(() => {
		if (asset === 'btc_lightning') return destinationValid && !isSending;
		return (
			destinationValid &&
			amountSats !== null &&
			amountSats > 0 &&
			!hasInsufficientBalance &&
			!isSending
		);
	});

	async function handleSubmit(): Promise<void> {
		if (!canSubmit) return;
		if (asset !== 'btc_lightning' && amountSats === null) return;
		isSending = true;
		errorMessage = '';
		try {
			let txid: string;
			if (asset === 'btc_lightning') {
				const result = await walletManager.payLightningInvoice({
					lnInvoice: destination.trim()
				});
				txid = result.txid;
			} else if (asset === 'usdt_rgb') {
				const result = await walletManager.sendRgbAsset({
					invoice: destination.trim(),
					assetId: getConfiguredRgbUsdtAssetId(),
					amount: amountSats
				});
				txid = result.txid;
			} else {
				txid = await walletManager.sendBtc({
					address: destination.trim(),
					amountSats,
					feeRate
				});
			}
			appStore.showSuccessToast($t('wallet.sent_successfully'));
			onSent(txid);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Send failed';
			appStore.showErrorToast(errorMessage);
		} finally {
			isSending = false;
		}
	}
</script>

<form
	class="flex flex-col gap-4"
	data-testid="send-payment-form"
	onsubmit={(e) => {
		e.preventDefault();
		void handleSubmit();
	}}
>
	<!-- Asset selector: BTC on-chain / Lightning / USDT RGB -->
	<div class="join w-full" role="group" aria-label={$t('wallet.taproot.token')}>
		{#each assets as option (option.id)}
			<button
				type="button"
				class="btn btn-sm join-item flex-1"
				class:btn-primary={asset === option.id}
				class:btn-outline={asset !== option.id}
				onclick={() => {
					asset = option.id;
					destination = '';
					errorMessage = '';
				}}
				data-testid={`asset-${option.id}`}
			>
				{$t(option.labelKey)}
			</button>
		{/each}
	</div>

	<!-- Destination -->
	<label class="form-control">
		<span class="label-text mb-1">
			{asset === 'btc_lightning'
				? $t('wallet.send_form.network.lightning_bitcoin')
				: asset === 'usdt_rgb'
					? $t('wallet.taproot.recipient_invoice')
					: $t('wallet.taproot.recipient_address')}
		</span>
		<input
			class="input input-bordered w-full font-mono text-sm"
			class:input-error={destination.trim() !== '' && !destinationValid}
			placeholder={assets.find((a) => a.id === asset)?.placeholder}
			bind:value={destination}
			data-testid="send-destination"
		/>
	</label>

	<!-- Amount (Lightning reads the invoice amount; RGB uses USD decimals) -->
	{#if asset !== 'btc_lightning'}
		<label class="form-control">
			<span class="label-text mb-1">{$t('wallet.taproot.amount')}</span>
			<div class="join w-full">
				<input
					class="input input-bordered join-item w-full"
					class:input-error={hasInsufficientBalance}
					inputmode="decimal"
					placeholder="0"
					bind:value={amountInput}
					data-testid="send-amount"
				/>
				{#if asset === 'btc_onchain'}
					<button
						type="button"
						class="btn btn-outline join-item"
						onclick={() => (unit = unit === 'sats' ? 'usd' : 'sats')}
						data-testid="unit-toggle"
					>
						{unit === 'sats' ? 'sats' : 'USD'}
					</button>
				{:else}
					<span class="btn btn-outline join-item no-animation">USDT</span>
				{/if}
			</div>
		</label>

		{#if asset === 'btc_onchain'}
			<label class="form-control">
				<span class="label-text mb-1">{$t('wallet.taproot.fee_rate')}</span>
				<input
					class="input input-bordered w-full"
					type="number"
					min="1"
					bind:value={feeRate}
					data-testid="fee-rate"
				/>
			</label>
		{/if}
	{/if}

	<div class="text-base-content/60 text-xs" data-testid="available-balance">
		{$t('dashboard.services.detail.book_now_drawer.available_balance')}: {formatSats(walletSats)}
	</div>

	{#if hasInsufficientBalance}
		<div class="alert alert-error text-sm" role="alert" data-testid="send-insufficient">
			{$t('wallet.taproot.insufficient_balance')}
		</div>
	{/if}
	{#if errorMessage}
		<div class="alert alert-error text-sm" role="alert" data-testid="send-error">
			{errorMessage}
		</div>
	{/if}

	<div class="flex gap-3">
		<button
			type="button"
			class="btn btn-ghost flex-1"
			onclick={onCancel}
			disabled={isSending}
			data-testid="send-cancel"
		>
			{$t('common.cancel')}
		</button>
		<button
			type="submit"
			class="btn btn-primary flex-1"
			disabled={!canSubmit}
			data-testid="send-submit"
		>
			{#if isSending}
				<span class="loading loading-spinner loading-sm"></span>
			{/if}
			{$t('wallet.send.send')}
		</button>
	</div>
</form>
