<script lang="ts">
	import { t } from 'svelte-i18n';
	import { walletManager } from '$lib/stores/wallet/wallet-manager';
	import { walletStore } from '$lib/stores/wallet/wallet-state';
	import { appStore } from '$lib/stores/app.store';
	import { getConfiguredRgbUsdtAssetId, soleIfaAsset } from '$lib/types/rgb-contract';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import { assetButtonTone, signetTxUrl } from '$lib/components/wallet/wallet-formatters';
	import { decodeRgbInvoice, type DecodedRgbInvoice } from '$lib/stores/wallet/decode-rgb-invoice';
	import { readRefreshFailure } from '$lib/stores/wallet/wallet-balances';
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

	let picked = $state<SendAsset | null>(null);
	const asset = $derived(picked ?? initialAsset);
	let destination = $state('');
	let amountInput = $state('');
	let unit = $state<'sats' | 'usd'>('sats');
	let feeRate = $state(1);
	let isSending = $state(false);
	let errorMessage = $state('');
	let sentTxid = $state('');
	let boundIfa = $state<{ assetId: string; units: number } | null>(null);
	let ifaLookup = $state<'idle' | 'pending' | 'ready' | 'missing'>('idle');
	let ifaRequest = 0;

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
			placeholder: 'rgb:~/~/nWca/sb:utxob:...'
		}
	];

	const walletSats = $derived($walletStore.rgb?.balanceSats ?? 0);
	const usdtAsset = $derived(
		($walletStore.rgb?.assets ?? []).find((item) => item.symbol?.toUpperCase() === 'USDT') ?? null
	);

	const amountSats = $derived.by(() => {
		const parsed = Number(amountInput);
		if (!Number.isFinite(parsed) || parsed <= 0) return null;
		if (asset === 'usdt_rgb') return Math.round(parsed);
		if (unit === 'usd') {
			if (btcPrice.price <= 0) return null;
			return Math.round((parsed / btcPrice.price) * 100_000_000);
		}
		return Math.round(parsed);
	});

	const decodedInvoice = $derived.by((): DecodedRgbInvoice | null => {
		if (asset !== 'usdt_rgb') return null;
		const value = destination.trim();
		if (!value.startsWith('rgb:')) return null;
		try {
			return decodeRgbInvoice(value);
		} catch {
			return null;
		}
	});

	const lockedAmount = $derived(
		decodedInvoice && decodedInvoice.amount !== null && decodedInvoice.amount > 0
			? decodedInvoice.amount
			: null
	);

	const rgbAmount = $derived(lockedAmount ?? amountSats);

	const rgbBalance = $derived(
		decodedInvoice && !decodedInvoice.contract ? (boundIfa?.units ?? 0) : (usdtAsset?.balance ?? 0)
	);

	const hasInsufficientBalance = $derived.by(() => {
		if (amountSats === null) return false;
		if (asset === 'usdt_rgb') return rgbBalance > 0 && amountSats > rgbBalance;
		return amountSats > walletSats;
	});

	const destinationValid = $derived.by(() => {
		const value = destination.trim();
		if (!value) return false;
		if (asset === 'btc_onchain') return /^(bc1|tb1|bcrt1)[a-z0-9]{10,}$/i.test(value);
		if (asset === 'btc_lightning') return value.toLowerCase().startsWith('ln');
		if (!value.startsWith('rgb:')) return false;
		return decodedInvoice !== null && decodedInvoice.amount !== 0;
	});

	// Lightning invoices embed their own amount — only a valid invoice is required.
	const canSubmit = $derived.by(() => {
		if (isSending || sentTxid) return false;
		if (asset === 'btc_lightning') return destinationValid;
		if (asset === 'usdt_rgb') {
			if (!decodedInvoice || decodedInvoice.amount === 0) return false;
			if (!decodedInvoice.contract && !boundIfa) return false;
			const balance = decodedInvoice.contract ? (usdtAsset?.balance ?? 0) : rgbBalance;
			return (
				destinationValid &&
				rgbAmount !== null &&
				rgbAmount > 0 &&
				balance > 0 &&
				rgbAmount <= balance
			);
		}
		return destinationValid && amountSats !== null && amountSats > 0 && !hasInsufficientBalance;
	});

	const blankMissingIfa = $derived(
		asset === 'usdt_rgb' &&
			decodedInvoice !== null &&
			!decodedInvoice.contract &&
			ifaLookup === 'missing'
	);

	function applyInvoice(value: string): void {
		if (!value.startsWith('rgb:')) return;
		picked = 'usdt_rgb';
		sentTxid = '';
		try {
			const decoded = decodeRgbInvoice(value);
			if (decoded.amount !== null && decoded.amount > 0) amountInput = String(decoded.amount);
		} catch {
			errorMessage = '';
		}
	}

	function onDestinationInput(event: Event): void {
		const target = event.currentTarget;
		if (!(target instanceof HTMLTextAreaElement) && !(target instanceof HTMLInputElement)) return;
		destination = target.value;
		errorMessage = '';
		applyInvoice(destination.trim());
		void bindBlankIfa(destination.trim());
	}

	async function bindBlankIfa(value: string): Promise<void> {
		const request = ++ifaRequest;
		boundIfa = null;
		if (!value.startsWith('rgb:')) {
			ifaLookup = 'idle';
			return;
		}
		let decoded: DecodedRgbInvoice;
		try {
			decoded = decodeRgbInvoice(value);
		} catch {
			ifaLookup = 'idle';
			return;
		}
		if (decoded.contract) {
			ifaLookup = 'idle';
			return;
		}
		ifaLookup = 'pending';
		const listed = await walletManager.listRgbAssets();
		if (request !== ifaRequest || destination.trim() !== value) return;
		const sole = soleIfaAsset(listed.ifa);
		boundIfa = sole;
		ifaLookup = sole ? 'ready' : 'missing';
	}

	async function copyTxid(): Promise<void> {
		if (!sentTxid) return;
		try {
			await navigator.clipboard.writeText(sentTxid);
		} catch {
			appStore.showErrorToast($t('common.error'));
		}
	}

	async function handleSubmit(): Promise<void> {
		if (!canSubmit) return;
		if (asset === 'btc_onchain' && (amountSats === null || amountSats <= 0)) return;
		if (asset === 'usdt_rgb' && (rgbAmount === null || rgbAmount <= 0)) return;
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
				if (rgbAmount === null || rgbAmount <= 0) throw new Error('RGB invoice amount is zero');
				const result = await walletManager.sendRgbAsset({
					invoice: destination.trim(),
					assetId: boundIfa?.assetId || usdtAsset?.assetId || getConfiguredRgbUsdtAssetId() || '',
					amount: rgbAmount
				});
				txid = result.txid;
				if (!/^[0-9a-f]{64}$/i.test(txid)) throw new Error('sendEnd did not return a txid');
			} else {
				const sats = amountSats;
				if (sats === null) return;
				txid = await walletManager.sendBtc({
					address: destination.trim(),
					amountSats: sats,
					feeRate
				});
			}
			if (!txid) throw new Error('Send did not return a txid');
			sentTxid = txid;
			appStore.showSuccessToast($t('wallet.toast.sent_successfully', { values: { txid } }));
			onSent(txid);
		} catch (error) {
			const named = readRefreshFailure(error);
			errorMessage =
				error instanceof Error && error.message
					? error.message
					: named
						? named
						: typeof error === 'string' && error
							? error
							: 'Send failed';
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
				class="btn btn-sm join-item flex-1 {assetButtonTone(option.id)}"
				class:ring-2={asset === option.id}
				class:ring-base-content={asset === option.id}
				onclick={() => {
					picked = option.id;
					destination = '';
					errorMessage = '';
					sentTxid = '';
					amountInput = '';
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
		{#if asset === 'usdt_rgb'}
			<textarea
				class="textarea textarea-bordered min-h-24 w-full font-mono text-xs break-all"
				class:textarea-error={destination.trim() !== '' && !destinationValid}
				rows="4"
				placeholder={assets.find((item) => item.id === asset)?.placeholder}
				value={destination}
				oninput={onDestinationInput}
				data-testid="send-destination"
			></textarea>
		{:else}
			<input
				class="input input-bordered w-full font-mono text-sm"
				class:input-error={destination.trim() !== '' && !destinationValid}
				placeholder={assets.find((item) => item.id === asset)?.placeholder}
				value={destination}
				oninput={onDestinationInput}
				data-testid="send-destination"
			/>
		{/if}
	</label>

	<!-- Amount (Lightning reads the invoice amount; USDT uses the balance units) -->
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
					disabled={lockedAmount !== null}
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

	{#if decodedInvoice}
		<div class="bg-base-200 rounded-lg p-3 text-sm" data-testid="send-decoded">
			<p class="font-mono">{decodedInvoice.seal}</p>
			<p>
				{$t('wallet.amount')}:
				{decodedInvoice.amount === null ? '—' : decodedInvoice.amount}
			</p>
			<p>
				{decodedInvoice.contract ?? $t('wallet.send_unspecified')}
			</p>
			{#if !decodedInvoice.contract && boundIfa}
				<p class="font-mono text-xs break-all" data-testid="send-ifa-asset">{boundIfa.assetId}</p>
			{/if}
			{#if decodedInvoice.expiry}
				<p class="font-mono text-xs">{decodedInvoice.expiry}</p>
			{/if}
		</div>
	{/if}

	{#if sentTxid}
		<div class="flex flex-col gap-2" data-testid="send-txid">
			<p class="font-mono text-xs break-all">{sentTxid}</p>
			{#if signetTxUrl(sentTxid)}
				<a
					class="link text-sm"
					href={signetTxUrl(sentTxid)}
					target="_blank"
					rel="noopener noreferrer"
				>
					{$t('wallet.toast.view_explorer')}
				</a>
			{/if}
			<button type="button" class="btn btn-outline btn-sm" onclick={copyTxid}>
				{$t('wallet.toast.copy_tx')}
			</button>
		</div>
	{/if}

	<div class="text-base-content/60 text-xs" data-testid="available-balance">
		{$t('dashboard.services.detail.book_now_drawer.available_balance')}:
		{asset === 'usdt_rgb'
			? `${new Intl.NumberFormat().format(usdtAsset?.balance ?? 0)} USDT`
			: formatSats(walletSats)}
	</div>

	{#if hasInsufficientBalance}
		<div class="alert alert-error text-sm" role="alert" data-testid="send-insufficient">
			{$t('wallet.insufficient_balance')}
		</div>
	{/if}
	{#if blankMissingIfa}
		<div
			class="alert alert-outline alert-error text-sm"
			role="alert"
			data-testid="send-ifa-missing"
		>
			{$t('wallet.send_select_ifa')}
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
			disabled={!canSubmit || errorMessage !== ''}
			data-testid="send-submit"
		>
			{#if isSending}
				<span class="loading loading-spinner loading-sm"></span>
			{/if}
			{$t('wallet.send.send')}
		</button>
	</div>
</form>
