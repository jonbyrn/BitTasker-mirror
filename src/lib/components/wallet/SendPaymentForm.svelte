<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { walletManager } from '$lib/stores/wallet/wallet-manager';
	import { walletStore } from '$lib/stores/wallet/wallet-state';
	import { appStore } from '$lib/stores/app.store';
	import {
		formatUsdtBalance,
		formatUsdtUnits,
		soleIfaAsset,
		usdtBaseUnits,
		usdtInvoiceAsset,
		usdtPrecision
	} from '$lib/types/rgb-contract';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import { assetButtonTone, signetTxUrl } from '$lib/components/wallet/wallet-formatters';
	import {
		contractAssetId,
		decodeRgbInvoice,
		type DecodedRgbInvoice
	} from '$lib/stores/wallet/decode-rgb-invoice';
	import { FAUCET_IFA_ASSET, payEscrowLightning } from '$lib/stores/wallet/signet-lsp';
	import { ESCROW_LNUSDT } from '$lib/services/rgb/escrow-rail';
	import { describeThrown, sendEnabled } from '$lib/stores/wallet/wallet-send';
	import { formatSats } from '$lib/stores/wallet/wallet-utils';
	import { advancedWallet } from '$lib/stores/wallet/wallet-mode';
	import {
		detectPayment,
		feeEstimateSats,
		formatUsd,
		usdFromSats
	} from '$lib/stores/wallet/plain-wallet';

	type SendAsset = 'btc_onchain' | 'btc_lightning' | 'usdt_rgb' | 'usdt_ln';

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
	let reviewing = $state(false);
	let errorMessage = $state('');
	let sentTxid = $state('');
	let boundIfa = $state<{ assetId: string; units: number } | null>(null);
	let ifaLookup = $state<'idle' | 'pending' | 'ready' | 'missing'>('idle');
	let ifaRequest = 0;
	let spendableUnits = $state<number | null>(null);
	let pendingReceives = $state(0);
	let spendAsset = $state('');
	let spendRequest = 0;

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
		},
		{
			id: 'usdt_ln',
			labelKey: 'wallet.lightning_usdt_balance',
			placeholder: 'lnbc... or rgb:...'
		}
	];

	const walletSats = $derived($walletStore.rgb?.balanceSats ?? 0);
	const usdtAsset = $derived(
		($walletStore.rgb?.assets ?? []).find((item) => item.symbol?.toUpperCase() === 'USDT') ?? null
	);
	const usdtScale = $derived(usdtPrecision(usdtAsset?.symbol ?? 'USDT', usdtAsset?.precision));

	const amountSats = $derived.by(() => {
		const parsed = Number(amountInput);
		if (!Number.isFinite(parsed) || parsed <= 0) return null;
		if (asset === 'usdt_rgb' || asset === 'usdt_ln') return parsed;
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

	const rgbAmount = $derived.by(() => {
		if (asset !== 'usdt_rgb' || amountSats === null) return amountSats;
		try {
			return usdtBaseUnits(amountSats, usdtScale);
		} catch {
			return null;
		}
	});
	const invoiceMismatch = $derived(
		asset === 'usdt_rgb' &&
			lockedAmount !== null &&
			rgbAmount !== null &&
			rgbAmount !== lockedAmount
	);

	const usdtSpendable = $derived(spendableUnits ?? 0);

	const belowSpendable = $derived(
		asset === 'usdt_rgb' &&
			spendableUnits !== null &&
			rgbAmount !== null &&
			rgbAmount > 0 &&
			!sendEnabled(usdtSpendable, rgbAmount)
	);

	const hasInsufficientBalance = $derived.by(() => {
		if (amountSats === null) return false;
		if (asset === 'usdt_rgb') return belowSpendable;
		if (asset === 'usdt_ln') return false;
		return amountSats > walletSats;
	});

	const destinationValid = $derived.by(() => {
		const value = destination.trim();
		if (!value) return false;
		if (asset === 'btc_onchain') return /^(bc1|tb1|bcrt1)[a-z0-9]{10,}$/i.test(value);
		if (asset === 'btc_lightning') return value.toLowerCase().startsWith('ln');
		if (asset === 'usdt_ln') {
			return value.toLowerCase().startsWith('ln') || value.startsWith('rgb:');
		}
		if (!value.startsWith('rgb:')) return false;
		return decodedInvoice !== null && decodedInvoice.amount !== 0;
	});

	// Lightning invoices embed their own amount — only a valid invoice is required.
	const reviewAmount = $derived.by(() => {
		if (asset === 'usdt_rgb') {
			return rgbAmount === null ? '' : `${formatUsdtBalance(rgbAmount, usdtScale)} USDT`;
		}
		if (asset === 'btc_onchain') return amountSats === null ? '' : `${amountSats} sats`;
		return $t('wallet.networks.lightning');
	});
	const reviewFee = $derived(asset === 'usdt_rgb' ? 2 : feeRate);
	const simpleFee = $derived.by(() => {
		const dollars = usdFromSats(feeEstimateSats(reviewFee), btcPrice.price);
		return dollars === null ? null : formatUsd(dollars);
	});
	const canSubmit = $derived.by(() => {
		if (isSending || sentTxid) return false;
		if (asset === 'btc_lightning') return destinationValid;
		if (asset === 'usdt_ln') return destinationValid && amountSats !== null && amountSats > 0;
		if (asset === 'usdt_rgb') {
			if (invoiceMismatch) return false;
			if (spendableUnits === null) return false;
			if (!decodedInvoice || decodedInvoice.amount === 0) return false;
			if (!decodedInvoice.contract && !boundIfa) return false;
			if (rgbAmount === null || !sendEnabled(usdtSpendable, rgbAmount)) return false;
			return destinationValid;
		}
		return destinationValid && amountSats !== null && amountSats > 0 && !hasInsufficientBalance;
	});

	const blankMissingIfa = $derived(
		asset === 'usdt_rgb' &&
			decodedInvoice !== null &&
			!decodedInvoice.contract &&
			ifaLookup === 'missing'
	);

	async function spendAssetId(): Promise<string> {
		const named = contractAssetId(decodedInvoice?.contract ?? null);
		if (named) return named;
		try {
			const listed = await walletManager.listRgbAssets();
			const held = usdtInvoiceAsset(listed, null);
			if (held) return held;
		} catch {
			// The invoice asset and the faucet id remain available.
		}
		return usdtAsset?.assetId || FAUCET_IFA_ASSET;
	}

	function balanceMissing(error: unknown): boolean {
		const message = describeThrown(error);
		return /not found|memory access out of bounds|null pointer/i.test(message);
	}

	async function loadSpendable(): Promise<void> {
		const request = ++spendRequest;
		const assetId = await spendAssetId();
		if (request !== spendRequest) return;
		if (!assetId) {
			spendAsset = '';
			spendableUnits = 0;
			pendingReceives = 0;
			return;
		}
		try {
			const [quoted, pending] = await Promise.all([
				walletManager.quoteSpendable(assetId),
				walletManager.pendingReceives(assetId)
			]);
			if (request !== spendRequest) return;
			spendAsset = assetId;
			spendableUnits = quoted;
			pendingReceives = pending;
			if (errorMessage.toLowerCase().includes('not found')) errorMessage = '';
		} catch (error) {
			if (request !== spendRequest) return;
			if (balanceMissing(error)) {
				spendableUnits = 0;
				pendingReceives = 0;
				return;
			}
			spendableUnits = null;
			errorMessage = describeThrown(error);
		}
	}

	onMount(() => {
		if (!$advancedWallet) unit = 'usd';
		if (asset === 'usdt_rgb') void loadSpendable();
	});

	function applyInvoice(value: string): void {
		if (!value.startsWith('rgb:')) return;
		if (asset === 'usdt_ln') return;
		picked = 'usdt_rgb';
		sentTxid = '';
		try {
			const decoded = decodeRgbInvoice(value);
			if (decoded.amount !== null && decoded.amount > 0 && amountInput.trim() === '') {
				amountInput = formatUsdtUnits(decoded.amount, usdtScale);
			}
		} catch {
			errorMessage = '';
		}
	}

	function onDestinationInput(event: Event): void {
		const target = event.currentTarget;
		if (!(target instanceof HTMLTextAreaElement) && !(target instanceof HTMLInputElement)) return;
		destination = target.value;
		errorMessage = '';
		if (!$advancedWallet) {
			const rail = detectPayment(destination);
			if (rail) {
				picked = rail;
				if (rail === 'usdt_rgb') void loadSpendable();
			}
		}
		applyInvoice(destination.trim());
		void bindBlankIfa(destination.trim());
		if (asset === 'usdt_rgb') void loadSpendable();
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
		if (!reviewing) {
			reviewing = true;
			return;
		}
		if (asset === 'btc_onchain' && (amountSats === null || amountSats <= 0)) return;
		if (asset === 'usdt_rgb' && (rgbAmount === null || rgbAmount <= 0)) return;
		if (
			decodedInvoice?.amount &&
			decodedInvoice.amount > 0 &&
			rgbAmount !== null &&
			rgbAmount !== decodedInvoice.amount
		) {
			errorMessage = $t('wallet.send_amount_mismatch', {
				values: {
					invoice: formatUsdtUnits(decodedInvoice.amount, usdtScale),
					entered: amountInput
				}
			});
			reviewing = false;
			return;
		}
		isSending = true;
		errorMessage = '';
		try {
			let txid: string;
			if (asset === 'btc_lightning') {
				const result = await walletManager.payLightningInvoice({
					lnInvoice: destination.trim()
				});
				txid = result.txid;
			} else if (asset === 'usdt_ln') {
				if (amountSats === null || amountSats <= 0) throw new Error('USDT amount is zero');
				const units = usdtBaseUnits(amountSats, usdtScale);
				const dest = destination.trim();
				if (dest.toLowerCase().startsWith('ln')) {
					const result = await walletManager.payLightningInvoice({
						lnInvoice: dest,
						assetId: ESCROW_LNUSDT,
						assetAmount: units
					});
					txid = result.txid;
				} else {
					txid = await payEscrowLightning(dest, ESCROW_LNUSDT, units);
				}
			} else if (asset === 'usdt_rgb') {
				if (rgbAmount === null || rgbAmount <= 0) throw new Error('RGB invoice amount is zero');
				if (spendableUnits === null || !sendEnabled(spendableUnits, rgbAmount)) {
					throw new Error('USDT amount is larger than the spendable balance.');
				}
				const assetId = boundIfa?.assetId || spendAsset || (await spendAssetId());
				const sent = await walletManager.sendRgbAsset({
					invoice: destination.trim(),
					assetId,
					amount: rgbAmount
				});
				txid = sent.txid;
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
			onCancel();
		} catch (error) {
			console.error('[wallet-send] failed', error instanceof Error ? error.stack : error);
			errorMessage = describeThrown(error);
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
	{#if $advancedWallet}
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
						reviewing = false;
						if (option.id === 'usdt_rgb') void loadSpendable();
					}}
					data-testid={`asset-${option.id}`}
				>
					{$t(option.labelKey)}
				</button>
			{/each}
		</div>
	{/if}

	<!-- Destination -->
	<label class="form-control">
		<span class="label-text mb-1">
			{#if !$advancedWallet}
				{$t('wallet.simple.paste')}
			{:else if asset === 'btc_lightning'}
				{$t('wallet.send_form.network.lightning_bitcoin')}
			{:else if asset === 'usdt_rgb'}
				{$t('wallet.taproot.recipient_invoice')}
			{:else}
				{$t('wallet.taproot.recipient_address')}
			{/if}
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

		{#if asset === 'btc_onchain' && $advancedWallet}
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

	{#if decodedInvoice && $advancedWallet}
		<div class="bg-base-200 rounded-lg p-3 text-sm" data-testid="send-decoded">
			<p class="font-mono">{decodedInvoice.seal}</p>
			<p>
				{$t('wallet.amount')}:
				{decodedInvoice.amount === null ? '—' : formatUsdtUnits(decodedInvoice.amount, usdtScale)}
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

	{#if $advancedWallet}
		<div class="text-base-content/60 text-xs" data-testid="available-balance">
			{$t('dashboard.services.detail.book_now_drawer.available_balance')}:
			{asset === 'usdt_rgb'
				? spendableUnits === null
					? '…'
					: `${formatUsdtBalance(usdtSpendable, usdtScale)} USDT`
				: formatSats(walletSats)}
		</div>

		{#if pendingReceives > 0 && asset === 'usdt_rgb'}
			<div
				class="alert alert-outline alert-info text-sm"
				role="status"
				data-testid="send-pending-info"
			>
				{$t('wallet.send_pending_info')}
			</div>
		{/if}
		{#if belowSpendable}
			<div
				class="alert alert-outline alert-warning text-sm"
				role="status"
				data-testid="send-not-spendable"
			>
				{$t('wallet.send_below_spendable')}
			</div>
		{/if}
		{#if hasInsufficientBalance && asset !== 'usdt_rgb'}
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
	{/if}
	{#if invoiceMismatch}
		<div
			class="alert alert-outline alert-warning text-sm"
			role="status"
			data-testid="send-amount-mismatch"
		>
			{$t('wallet.send_amount_mismatch', {
				values: {
					invoice: formatUsdtUnits(lockedAmount ?? 0, usdtScale),
					entered: amountInput
				}
			})}
		</div>
	{/if}
	{#if !$advancedWallet && (belowSpendable || hasInsufficientBalance)}
		<div
			class="alert alert-outline alert-warning text-sm"
			role="status"
			data-testid="send-not-enough"
		>
			{$t('wallet.simple.not_enough')}
		</div>
	{/if}
	{#if asset === 'usdt_rgb' && (spendableUnits === null || ifaLookup === 'pending') && !errorMessage}
		<div class="alert alert-outline alert-info text-sm" role="status" data-testid="send-preparing">
			<span class="loading loading-spinner loading-xs"></span>
			{$t('wallet.simple.preparing')}
		</div>
	{/if}
	{#if errorMessage}
		<div class="alert alert-outline alert-error text-sm" role="alert" data-testid="send-error">
			{errorMessage}
		</div>
	{/if}

	{#if reviewing}
		<div class="bg-base-200 rounded-lg p-3 text-sm" data-testid="send-review">
			{#if !$advancedWallet}
				<p>{$t('wallet.simple.sending', { values: { amount: reviewAmount } })}</p>
				{#if simpleFee}
					<p>{$t('wallet.simple.fee', { values: { amount: simpleFee } })}</p>
				{/if}
			{:else}
				<p>{reviewAmount}</p>
				<p class="font-mono text-xs break-all">{destination.trim()}</p>
				{#if asset !== 'btc_lightning'}
					<p>{$t('wallet.send_fee_rate', { values: { rate: reviewFee } })}</p>
				{/if}
			{/if}
		</div>
	{/if}

	<div class="flex gap-3">
		<button
			type="button"
			class="btn btn-ghost flex-1"
			onclick={() => {
				if (reviewing) {
					reviewing = false;
					return;
				}
				onCancel();
			}}
			disabled={isSending}
			data-testid="send-cancel"
		>
			{$t(reviewing ? 'common.back' : 'common.cancel')}
		</button>
		<button
			type="submit"
			class="btn btn-primary flex-1"
			disabled={!canSubmit || errorMessage !== ''}
			data-testid={reviewing ? 'send-confirm' : 'send-submit'}
		>
			{#if isSending}
				<span class="loading loading-spinner loading-sm"></span>
			{/if}
			{$t(
				reviewing
					? $advancedWallet
						? 'wallet.send_confirm'
						: 'wallet.simple.send'
					: 'wallet.send.send'
			)}
		</button>
	</div>
</form>
