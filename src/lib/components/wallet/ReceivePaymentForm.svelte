<script lang="ts" module>
	let heldInvoice = '';

	export function resetHeldInvoice(): void {
		heldInvoice = '';
	}

	export function rememberOpenReceive(invoice: string): void {
		heldInvoice = invoice;
	}
</script>

<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { t } from 'svelte-i18n';
	import { walletManager } from '$lib/stores/wallet/wallet-manager';
	import { walletStore } from '$lib/stores/wallet/wallet-state';
	import { appStore } from '$lib/stores/app.store';
	import {
		formatUsdtBalance,
		formatUsdtUnits,
		usdtBaseUnits,
		usdtPrecision
	} from '$lib/types/rgb-contract';
	import { decodeRgbInvoice } from '$lib/stores/wallet/decode-rgb-invoice';
	import { assetButtonTone } from '$lib/components/wallet/wallet-formatters';
	import {
		cancelUnpaidInvoices,
		receiveUsdtInvoice,
		UsdtUnregisteredError
	} from '$lib/stores/wallet/wallet-balances';
	import { WASM_CRASH_MESSAGE } from '$lib/stores/wallet/wasm-lock';
	import { callWithDeadline } from '$lib/stores/wallet/wallet-send';
	import { lightningStore } from '$lib/stores/wallet/signet-lsp';
	import { ESCROW_LNUSDT } from '$lib/services/rgb/escrow-rail';
	import { advancedWallet } from '$lib/stores/wallet/wallet-mode';
	import { expiryHours } from '$lib/stores/wallet/plain-wallet';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import generateQrCodeUrl from '$lib/utils/helpers/generateQrCodeUrl';

	type ReceiveAsset = 'btc_onchain' | 'btc_lightning' | 'usdt_rgb' | 'usdt_ln';

	let {
		onClose = () => {},
		onchainLocked = false,
		lightningReady = false,
		lightningUsdtReady = false
	}: {
		onClose?: () => void;
		onchainLocked?: boolean;
		lightningReady?: boolean;
		lightningUsdtReady?: boolean;
	} = $props();

	let shownDollars = $state('');
	let simpleKind = $state<'dollars' | 'bitcoin' | null>(null);
	let simpleStep = $state<'choose' | 'amount' | 'ready'>('choose');
	let openInvoice = $state(heldInvoice);
	let qrUrl = $state('');
	const testMoney = $derived(
		((import.meta.env.VITE_BITCOIN_NETWORK as string | undefined) ?? 'testnet') !== 'bitcoin'
	);

	let asset = $state<ReceiveAsset>('btc_onchain');
	let amountSats = $state('');
	let isGenerating = $state(false);
	let receiveValue = $state('');
	let invoiceAmount = $state('');
	let errorMessage = $state('');
	let usedBlank = $state(false);
	let confirmCancel = $state(false);
	let cancelling = $state(false);

	const assets: Array<{ id: ReceiveAsset; labelKey: string }> = [
		{ id: 'btc_onchain', labelKey: 'wallet.send_form.asset.bitcoin' },
		{ id: 'btc_lightning', labelKey: 'wallet.networks.lightning' },
		{ id: 'usdt_rgb', labelKey: 'wallet.taproot.tether_usd' },
		{ id: 'usdt_ln', labelKey: 'wallet.lightning_usdt_balance' }
	];

	const onchainAddress = $derived(
		$walletStore.rgb?.address ?? $walletStore.wdk?.btcOnchain?.address ?? ''
	);

	const requiresAmount = $derived(asset !== 'btc_onchain');
	const parsedAmount = $derived.by(() => {
		if (!requiresAmount) return 0;
		const parsed = Number(amountSats.trim());
		if (!Number.isFinite(parsed) || parsed <= 0) return null;
		if (asset === 'usdt_rgb') return parsed;
		return Number.isSafeInteger(parsed) ? parsed : null;
	});
	const heldUsdt = $derived(
		($walletStore.rgb?.assets ?? []).find((item) => item.symbol?.toUpperCase() === 'USDT') ?? null
	);
	const usdtScale = $derived(usdtPrecision(heldUsdt?.symbol ?? 'USDT', heldUsdt?.precision));
	const shownAmount = $derived.by(() => {
		if (invoiceAmount) return invoiceAmount;
		if (!receiveValue.startsWith('rgb:')) return '';
		try {
			const decoded = decodeRgbInvoice(receiveValue);
			if (decoded.amount === null || decoded.amount <= 0) return '';
			return formatUsdtUnits(decoded.amount, usdtScale);
		} catch {
			return '';
		}
	});
	const previewRaw = $derived.by(() => {
		if ((asset !== 'usdt_rgb' && asset !== 'usdt_ln') || parsedAmount === null) return null;
		try {
			return usdtBaseUnits(parsedAmount, usdtScale);
		} catch {
			return null;
		}
	});
	const walletListsUsdt = $derived(
		($walletStore.rgb?.assets ?? []).some(
			(item) => (item.symbol ?? '').toUpperCase() === 'USDT' && Boolean(item.assetId)
		)
	);

	function invoiceFailure(err: unknown): string {
		const message = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
		console.error('[receive-modal] invoice failed', message);
		if (
			message.startsWith('Add a little bitcoin') ||
			/insufficient bitcoin|needed ['"]?6000/i.test(message)
		) {
			return $t('wallet.simple.need_bitcoin');
		}
		if (
			err instanceof UsdtUnregisteredError ||
			message === WASM_CRASH_MESSAGE ||
			/asset with id|unknown rgb schema|not registered usdt/i.test(message)
		) {
			return $t('wallet.taproot.usdt_not_configured');
		}
		if (!$advancedWallet) return $t('wallet.simple.request_failed');
		if (message.trim()) return message;
		return 'Failed to generate RGB invoice';
	}
	const codeExpiry = $derived.by(() => {
		if (!receiveValue.startsWith('rgb:')) return null;
		try {
			return decodeRgbInvoice(receiveValue).expiry;
		} catch {
			return null;
		}
	});
	const hoursLeft = $derived(expiryHours(codeExpiry));
	const needBitcoin = $derived(errorMessage === $t('wallet.simple.need_bitcoin'));
	const usdtUnconfigured = $derived(
		asset === 'usdt_rgb' && $walletStore.isConnected === true && !walletListsUsdt
	);
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
			await paintQr(receiveValue);
			return;
		}
		if (asset === 'usdt_rgb') {
			isGenerating = true;
			await tick();
			usedBlank = false;
			receiveValue = '';
			invoiceAmount = '';
			try {
				const result = await callWithDeadline(
					receiveUsdtInvoice(parsedAmount ?? undefined),
					45_000,
					'The invoice timed out before it was created.'
				);
				if (!result.blank && result.invoice.startsWith('rgb:')) {
					const decoded = decodeRgbInvoice(result.invoice);
					if (decoded.amount !== result.units) {
						throw new Error('Invoice amount does not match the amount entered');
					}
				}
				receiveValue = result.invoice;
				heldInvoice = result.invoice;
				void paintQr(receiveValue);
				usedBlank = result.blank;
				invoiceAmount =
					result.units === null ? '' : formatUsdtUnits(result.units, result.precision);
			} catch (err) {
				console.error('[receive-modal] RGB invoice error:', err);
				errorMessage = invoiceFailure(err);
			} finally {
				isGenerating = false;
			}
			return;
		}
		if (parsedAmount === null) return;
		isGenerating = true;
		try {
			await walletManager.initialize();
			if (asset === 'usdt_ln') {
				const units = usdtBaseUnits(parsedAmount, usdtScale);
				const created = await walletManager.createLightningInvoice({
					expirySeconds: 3600,
					asset: { assetId: ESCROW_LNUSDT, amount: units }
				});
				const invoice = created.lnInvoice?.trim() ?? '';
				if (!invoice.startsWith('ln')) throw new Error('Lightning invoice was not created');
				receiveValue = invoice;
				await paintQr(receiveValue);
				invoiceAmount = formatUsdtUnits(units, usdtScale);
				return;
			}
			const created = await walletManager.createLightningInvoice({
				amountSats: parsedAmount,
				expirySeconds: 3600
			});
			const invoice = created.lnInvoice?.trim() ?? '';
			if (!invoice.startsWith('ln')) throw new Error('Lightning invoice was not created');
			receiveValue = invoice;
			await paintQr(receiveValue);
		} catch (err) {
			console.error('[receive-modal] Lightning invoice error:', err);
			errorMessage = err instanceof Error ? err.message : 'Failed to generate Lightning invoice';
		} finally {
			isGenerating = false;
		}
	}

	async function cancelReceive(): Promise<void> {
		if (!confirmCancel) {
			confirmCancel = true;
			return;
		}
		cancelling = true;
		errorMessage = '';
		try {
			await cancelUnpaidInvoices();
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Failed to cancel the RGB invoice';
			return;
		} finally {
			cancelling = false;
		}
		resetHeldInvoice();
		openInvoice = '';
		receiveValue = '';
		invoiceAmount = '';
		usedBlank = false;
		confirmCancel = false;
	}

	async function paintQr(value: string): Promise<void> {
		if (!value) {
			qrUrl = '';
			return;
		}
		try {
			qrUrl = await generateQrCodeUrl(value);
		} catch (error: unknown) {
			qrUrl = '';
			console.error('[receive-modal] QR failed', error);
		}
	}

	async function simpleCreate(skip: boolean): Promise<void> {
		errorMessage = '';
		receiveValue = '';
		qrUrl = '';
		isGenerating = true;
		await tick();
		const dollars = Number(amountSats);
		const hasAmount = !skip && Number.isFinite(dollars) && dollars > 0;
		shownDollars = hasAmount ? `$${dollars.toFixed(2)}` : '';
		try {
			if (simpleKind === 'bitcoin') {
				if (hasAmount && lightningReady && btcPrice.price > 0) {
					asset = 'btc_lightning';
					amountSats = String(Math.max(1, Math.round((dollars / btcPrice.price) * 100_000_000)));
					await handleGenerate();
					if (receiveValue) {
						simpleStep = 'ready';
						await paintQr(receiveValue);
						return;
					}
				}
				asset = 'btc_onchain';
				await handleGenerate();
			} else {
				if (hasAmount && lightningUsdtReady) {
					asset = 'usdt_ln';
					amountSats = String(dollars);
					await handleGenerate();
					if (receiveValue) {
						simpleStep = 'ready';
						await paintQr(receiveValue);
						return;
					}
				}
				asset = 'usdt_rgb';
				amountSats = hasAmount ? String(dollars) : '';
				await handleGenerate();
			}
			if (!receiveValue) {
				errorMessage = errorMessage || 'The invoice was not created.';
				return;
			}
			heldInvoice = receiveValue;
			simpleStep = 'ready';
			void paintQr(receiveValue);
		} finally {
			isGenerating = false;
		}
	}

	onMount(() => {
		if (receiveValue) void paintQr(receiveValue);
	});

	async function shareReceive(): Promise<void> {
		if (!receiveValue) return;
		if (typeof navigator.share === 'function') {
			try {
				await navigator.share({ text: receiveValue });
				return;
			} catch (error: unknown) {
				console.error('[receive-modal] share failed', error);
			}
		}
		await handleCopy();
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
	{#if !$advancedWallet}
		{#if testMoney}
			<span class="badge badge-warning badge-sm w-fit" data-testid="test-money">
				{$t('wallet.simple.test_money')}
			</span>
		{/if}
		{#if simpleStep === 'choose'}
			{#if openInvoice}
				<div class="bg-base-200 flex flex-col gap-2 rounded-lg p-3" data-testid="open-receive">
					<p class="text-sm">{$t('wallet.simple.open_receive')}</p>
					<p class="font-mono text-xs break-all">{openInvoice}</p>
					{#if confirmCancel}
						<p class="text-sm">{$t('wallet.taproot.cancel_invoice_confirm')}</p>
					{/if}
					<button
						type="button"
						class="btn btn-outline btn-sm min-h-12"
						onclick={cancelReceive}
						data-testid="open-receive-cancel"
					>
						{$t('wallet.taproot.cancel_invoice')}
					</button>
				</div>
			{/if}
			<button
				type="button"
				class="btn btn-primary min-h-12 w-full text-lg"
				data-testid="get-dollars"
				onclick={() => {
					simpleKind = 'dollars';
					simpleStep = 'amount';
					asset = 'usdt_rgb';
					amountSats = '';
					errorMessage = '';
					receiveValue = '';
				}}
			>
				{$t('wallet.simple.get_dollars')}
			</button>
			<button
				type="button"
				class="btn btn-neutral min-h-12 w-full text-lg"
				data-testid="get-bitcoin"
				onclick={() => {
					simpleKind = 'bitcoin';
					simpleStep = 'amount';
					asset = 'btc_onchain';
					amountSats = '';
					errorMessage = '';
					receiveValue = '';
				}}
			>
				{$t('wallet.simple.get_bitcoin')}
			</button>
		{:else if simpleStep === 'amount'}
			<label class="form-control">
				<span class="label-text mb-1 text-base">{$t('wallet.simple.how_much')}</span>
				<input
					class="input input-bordered min-h-12 w-full text-2xl"
					inputmode="decimal"
					placeholder="$0"
					bind:value={amountSats}
					data-testid="receive-amount"
				/>
			</label>
			<button
				type="button"
				class="btn btn-primary min-h-12 w-full"
				disabled={isGenerating}
				data-testid="receive-generate"
				onclick={() => {
					void simpleCreate(false);
				}}
			>
				{#if isGenerating}
					<span class="loading loading-spinner loading-sm"></span>
					{$t('wallet.simple.preparing_code')}
				{:else}
					{$t('wallet.simple.continue')}
				{/if}
			</button>
			<button
				type="button"
				class="btn btn-ghost min-h-12 w-full"
				data-testid="receive-skip"
				onclick={() => {
					void simpleCreate(true);
				}}
			>
				{$t('wallet.simple.skip')}
			</button>
		{:else}
			{#if qrUrl}
				<img
					src={qrUrl}
					alt={$t('wallet.simple.show_payer')}
					class="mx-auto w-full max-w-xs"
					data-testid="receive-qr"
				/>
			{/if}
			{#if shownDollars}
				<p class="text-center text-3xl font-bold" data-testid="receive-usdt-amount">
					{shownDollars}
				</p>
			{/if}
			<p class="text-center text-sm">{$t('wallet.simple.show_payer')}</p>
			<p class="text-center text-sm" data-testid="receive-waiting">{$t('wallet.simple.waiting')}</p>
			{#if hoursLeft !== null}
				<p class="text-center text-sm" data-testid="receive-expiry">
					{#if hoursLeft <= 0}
						{$t('wallet.simple.expires_soon')}
					{:else if hoursLeft === 1}
						{$t('wallet.simple.expires_hour')}
					{:else}
						{$t('wallet.simple.expires_hours', { values: { hours: hoursLeft } })}
					{/if}
				</p>
			{/if}
			<div class="bg-base-200 rounded-lg p-3 text-xs break-all" data-testid="receive-value">
				<p class="font-mono">{receiveValue}</p>
			</div>
			<button type="button" class="btn btn-primary min-h-12 w-full" onclick={shareReceive}>
				{$t('wallet.simple.share')}
			</button>
			<button
				type="button"
				class="btn btn-outline min-h-12 w-full"
				onclick={handleCopy}
				data-testid="receive-copy"
			>
				{$t('wallet.simple.copy')}
			</button>
		{/if}
		{#if errorMessage}
			<div class="alert alert-outline alert-error text-sm" role="alert" data-testid="receive-error">
				<span>{errorMessage === 'plain' ? $t('wallet.simple.request_failed') : errorMessage}</span>
				{#if needBitcoin}
					<button
						type="button"
						class="btn btn-sm min-h-12"
						data-testid="receive-bitcoin-first"
						onclick={() => {
							simpleKind = 'bitcoin';
							asset = 'btc_onchain';
							simpleStep = 'amount';
							errorMessage = '';
							receiveValue = '';
						}}
					>
						{$t('wallet.simple.get_bitcoin')}
					</button>
				{:else}
					<button
						type="button"
						class="btn btn-sm min-h-12"
						onclick={() => {
							void simpleCreate(simpleStep === 'amount' && !amountSats);
						}}
					>
						{$t('wallet.simple.try_again')}
					</button>
				{/if}
			</div>
		{/if}
	{:else}
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
						invoiceAmount = '';
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
					>{$t('wallet.taproot.amount')} ({asset === 'usdt_rgb' || asset === 'usdt_ln'
						? 'USDT'
						: 'sats'})</span
				>
				<input
					class="input input-bordered w-full"
					inputmode={asset === 'usdt_rgb' || asset === 'usdt_ln' ? 'decimal' : 'numeric'}
					placeholder="0"
					bind:value={amountSats}
					data-testid="receive-amount"
				/>
			</label>
		{/if}

		{#if asset === 'usdt_rgb' && previewRaw !== null && !receiveValue}
			<p class="text-sm" data-testid="receive-usdt-preview">
				{$t('wallet.taproot.invoice_usdt', {
					values: { amount: formatUsdtBalance(previewRaw, usdtScale) }
				})}
				<span class="sr-only" data-testid="receive-usdt-raw">{previewRaw}</span>
			</p>
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

		{#if isGenerating}
			<p class="flex items-center gap-2 text-sm" role="status" data-testid="receive-creating">
				<span class="loading loading-spinner loading-sm"></span>
				{$t('wallet.simple.preparing')}
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
			{#if qrUrl}
				<img
					src={qrUrl}
					alt={$t('wallet.simple.show_payer')}
					class="mx-auto w-full max-w-xs"
					data-testid="receive-qr"
				/>
			{/if}
			{#if testMoney}
				<p class="text-base-content/60 text-xs">{$t('wallet.simple.test_money')}</p>
			{/if}
			<div class="bg-base-200 rounded-lg p-3 text-xs break-all" data-testid="receive-value">
				{#if shownAmount}
					<p class="mb-2 text-sm" data-testid="receive-usdt-amount">
						{$t('wallet.taproot.invoice_usdt', { values: { amount: shownAmount } })}
					</p>
				{/if}
				<p class="font-mono">{receiveValue}</p>
			</div>
			<button
				type="button"
				class="btn btn-outline w-full"
				onclick={handleCopy}
				data-testid="receive-copy"
			>
				{$t(
					asset === 'btc_onchain' ? 'wallet.taproot.copy_address' : 'wallet.taproot.copy_invoice'
				)}
			</button>
			{#if confirmCancel}
				<p class="text-sm" data-testid="receive-cancel-confirm">
					{$t('wallet.taproot.cancel_invoice_confirm')}
				</p>
				<div class="flex gap-2">
					<button
						type="button"
						class="btn btn-ghost flex-1"
						onclick={() => (confirmCancel = false)}
						disabled={cancelling}
					>
						{$t('wallet.taproot.cancel_invoice_keep')}
					</button>
					<button
						type="button"
						class="btn btn-error flex-1"
						onclick={cancelReceive}
						disabled={cancelling}
						data-testid="receive-cancel"
					>
						{#if cancelling}
							<span class="loading loading-spinner loading-xs"></span>
						{/if}
						{$t('wallet.taproot.cancel_invoice')}
					</button>
				</div>
			{:else}
				<button
					type="button"
					class="btn btn-ghost w-full"
					onclick={cancelReceive}
					data-testid="receive-cancel"
				>
					{$t('wallet.taproot.cancel_invoice')}
				</button>
			{/if}
		{/if}

		{#if errorMessage}
			<div class="alert alert-error text-sm" role="alert" data-testid="receive-error">
				{errorMessage}
			</div>
		{/if}

		<p class="text-base-content/60 text-xs">
			{$t('wallet.taproot.make_sure_network')}
		</p>
	{/if}
	<button
		type="button"
		class="btn btn-ghost min-h-12 w-full"
		onclick={onClose}
		data-testid="receive-close"
	>
		{$t('common.close')}
	</button>
</div>
