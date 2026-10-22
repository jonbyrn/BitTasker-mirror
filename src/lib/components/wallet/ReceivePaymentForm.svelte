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
		getConfiguredRgbUsdtAssetId,
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
	import { MIN_COLORABLE_SATS } from '$lib/stores/wallet/rgb-allocations';
	import { expiryHours, formatUsd, usdFromSats } from '$lib/stores/wallet/plain-wallet';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import { sandboxIsolatesCatalog } from '$lib/nostr/catalog-guard';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
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
	let railTicket = 0;
	let simpleKind = $state<'dollars' | 'bitcoin' | null>(null);
	let simpleStep = $state<'choose' | 'amount' | 'ready'>('choose');
	let btcUnit = $state<'sats' | 'usd'>('sats');
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
	let copied = $state(false);
	const advancedRailBlocked = $derived(
		(asset === 'btc_lightning' && !lightningReady) || (asset === 'usdt_ln' && !lightningUsdtReady)
	);

	const assets: Array<{ id: ReceiveAsset; labelKey: string }> = [
		{ id: 'btc_onchain', labelKey: 'wallet.receive_rail.btc_onchain' },
		{ id: 'btc_lightning', labelKey: 'wallet.receive_rail.btc_lightning' },
		{ id: 'usdt_rgb', labelKey: 'wallet.receive_rail.usdt_rgb' },
		{ id: 'usdt_ln', labelKey: 'wallet.receive_rail.usdt_ln' }
	];

	const onchainAddress = $derived(
		$walletStore.rgb?.address ?? $walletStore.wdk?.btcOnchain?.address ?? ''
	);

	const requiresAmount = $derived(asset !== 'btc_onchain');
	const parsedAmount = $derived.by(() => {
		if (!requiresAmount) return 0;
		const parsed = Number(amountSats.trim());
		if (!Number.isFinite(parsed) || parsed <= 0) return null;
		if (asset === 'usdt_rgb' || asset === 'usdt_ln') return parsed;
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
	/** The banner is for a missing contract id. An empty asset list is not that. */
	const usdtIdConfigured = $derived(getConfiguredRgbUsdtAssetId() !== null || walletListsUsdt);

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
			/asset with id|unknown rgb schema|not registered usdt|not configured/i.test(message)
		) {
			if (!$advancedWallet) return $t('wallet.simple.request_failed');
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
	const _hoursLeft = $derived(expiryHours(codeExpiry));
	const needBitcoin = $derived(errorMessage === $t('wallet.simple.need_bitcoin'));
	const usdtUnconfigured = $derived(
		asset === 'usdt_rgb' && $walletStore.isConnected === true && !usdtIdConfigured
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
		const ticket = railTicket;
		errorMessage = '';
		copied = false;
		if (asset === 'btc_onchain') {
			const address = onchainAddress || (await walletManager.getRgbAddress());
			if (ticket !== railTicket) return;
			receiveValue = address;
			await paintQr(receiveValue);
			return;
		}
		if (asset === 'usdt_rgb') {
			if (blockWithoutBitcoin()) return;
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
				let blank = result.blank;
				if (!blank && result.invoice.startsWith('rgb:')) {
					const decoded = decodeRgbInvoice(result.invoice);
					// A blank invoice omits the amount. The sender fills it in.
					if (decoded.amount === null) blank = true;
					else if (result.units !== null && decoded.amount !== result.units) {
						throw new Error('Invoice amount does not match the amount entered');
					}
				}
				if (ticket !== railTicket) return;
				receiveValue = result.invoice;
				heldInvoice = result.invoice;
				void paintQr(receiveValue);
				usedBlank = blank;
				invoiceAmount =
					result.units === null ? '' : formatUsdtUnits(result.units, result.precision);
			} catch (err) {
				console.error('[receive-modal] RGB invoice error:', err);
				if (ticket === railTicket) errorMessage = invoiceFailure(err);
			} finally {
				if (ticket === railTicket) isGenerating = false;
			}
			return;
		}
		if (parsedAmount === null) return;
		if (advancedRailBlocked) return;
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
				if (ticket !== railTicket) return;
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
			if (ticket !== railTicket) return;
			receiveValue = invoice;
			await paintQr(receiveValue);
		} catch (err) {
			console.error('[receive-modal] Lightning invoice error:', err);
			if (ticket === railTicket) {
				errorMessage = err instanceof Error ? err.message : 'Failed to generate Lightning invoice';
			}
		} finally {
			if (ticket === railTicket) isGenerating = false;
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
			errorMessage = $advancedWallet
				? err instanceof Error
					? err.message
					: 'Failed to cancel the RGB invoice'
				: $t('wallet.simple.request_failed');
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
		const ticket = railTicket;
		if (!value) {
			if (ticket === railTicket) qrUrl = '';
			return;
		}
		try {
			const url = await generateQrCodeUrl(value);
			if (ticket !== railTicket) return;
			qrUrl = url;
		} catch (error: unknown) {
			if (ticket === railTicket) qrUrl = '';
			console.error('[receive-modal] QR failed', error);
		}
	}

	function bitcoinSatsFromInput(skip: boolean): number {
		if (skip) return 0;
		const entered = Number(amountSats);
		if (!Number.isFinite(entered) || entered <= 0) return 0;
		if (btcUnit === 'usd') {
			if (btcPrice.price <= 0) return 0;
			return Math.max(1, Math.round((entered / btcPrice.price) * 100_000_000));
		}
		return Math.max(1, Math.round(entered));
	}

	function withBtcAmount(address: string, sats: number): string {
		const clean = address.replace(/^bitcoin:/i, '').split('?')[0] ?? address;
		const btc = (sats / 100_000_000).toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
		return `bitcoin:${clean}?amount=${btc}`;
	}

	function _toggleBtcUnit(): void {
		const entered = Number(amountSats);
		const next = btcUnit === 'sats' ? 'usd' : 'sats';
		if (Number.isFinite(entered) && entered > 0 && btcPrice.price > 0) {
			if (btcUnit === 'sats') {
				const usd = usdFromSats(Math.round(entered), btcPrice.price);
				amountSats = usd === null ? '' : usd.toFixed(2);
			} else {
				amountSats = String(Math.max(1, Math.round((entered / btcPrice.price) * 100_000_000)));
			}
		}
		btcUnit = next;
	}

	const _bitcoinPreview = $derived.by(() => {
		if (simpleKind !== 'bitcoin' || simpleStep !== 'amount') return '';
		const sats = bitcoinSatsFromInput(false);
		if (sats <= 0) return '';
		if (btcUnit === 'sats') {
			const usd = usdFromSats(sats, btcPrice.price);
			return usd === null ? '' : formatUsd(usd);
		}
		return `${new Intl.NumberFormat('en-US').format(sats)} ${$t('wallet.sats')}`;
	});

	async function simpleCreate(skip: boolean): Promise<void> {
		const ticket = railTicket;
		errorMessage = '';
		receiveValue = '';
		qrUrl = '';
		if (simpleKind !== 'bitcoin' && blockWithoutBitcoin()) return;
		isGenerating = true;
		await tick();
		const dollars = Number(amountSats);
		const hasAmount = !skip && Number.isFinite(dollars) && dollars > 0;
		shownDollars = simpleKind === 'bitcoin' ? '' : hasAmount ? `$${dollars.toFixed(2)}` : '';
		try {
			if (simpleKind === 'bitcoin') {
				const typed = amountSats;
				const sats = bitcoinSatsFromInput(skip);
				const usd = sats > 0 ? usdFromSats(sats, btcPrice.price) : null;
				shownDollars =
					usd === null
						? sats > 0
							? `${new Intl.NumberFormat('en-US').format(sats)} ${$t('wallet.sats')}`
							: ''
						: formatUsd(usd);
				asset = 'btc_onchain';
				amountSats = '';
				await handleGenerate();
				if (ticket !== railTicket) return;
				if (receiveValue && sats > 0 && !receiveValue.toLowerCase().startsWith('ln')) {
					receiveValue = withBtcAmount(receiveValue, sats);
					await paintQr(receiveValue);
				}
				if (!receiveValue) amountSats = typed;
			} else {
				asset = 'usdt_rgb';
				amountSats = hasAmount ? String(dollars) : '';
				await handleGenerate();
				if (ticket === railTicket && usedBlank) shownDollars = '';
			}
			if (ticket !== railTicket) return;
			if (!receiveValue) {
				if (errorMessage !== $t('wallet.simple.need_bitcoin')) {
					errorMessage = $t('wallet.simple.request_failed');
				}
				return;
			}
			heldInvoice = receiveValue;
			simpleStep = 'ready';
			void paintQr(receiveValue);
		} finally {
			if (ticket === railTicket) isGenerating = false;
		}
	}

	let receiveTab = $state<'bitcoin' | 'dollars'>('bitcoin');
	let receiveRail = $state<'onchain' | 'lightning'>('onchain');
	let settingAmount = $state(false);
	const lightningRailReady = $derived(
		receiveTab === 'bitcoin' ? lightningReady : lightningUsdtReady
	);
	let usdInput = $state('');
	let satsInput = $state('');
	let usdFirst = $state(true);

	function syncFromUsd(value: string): void {
		usdInput = value;
		const entered = Number(value);
		if (!Number.isFinite(entered) || entered <= 0 || btcPrice.price <= 0) {
			satsInput = '';
			return;
		}
		satsInput = String(Math.max(1, Math.round((entered / btcPrice.price) * 100_000_000)));
	}

	function syncFromSats(value: string): void {
		satsInput = value;
		const entered = Number(value);
		if (!Number.isFinite(entered) || entered <= 0 || btcPrice.price <= 0) {
			usdInput = '';
			return;
		}
		const usd = usdFromSats(Math.round(entered), btcPrice.price);
		usdInput = usd === null ? '' : usd.toFixed(2);
	}

	function amountField(event: Event, kind: 'usd' | 'sats'): void {
		const target = event.currentTarget;
		if (!(target instanceof HTMLInputElement)) return;
		if (kind === 'usd') syncFromUsd(target.value);
		else syncFromSats(target.value);
	}

	function resetAmountDraft(): void {
		settingAmount = false;
		usdInput = '';
		satsInput = '';
		shownDollars = '';
		invoiceAmount = '';
		usedBlank = false;
		copied = false;
	}

	async function showPlainBitcoin(): Promise<void> {
		const ticket = ++railTicket;
		receiveTab = 'bitcoin';
		receiveRail = 'onchain';
		simpleKind = 'bitcoin';
		resetAmountDraft();
		errorMessage = '';
		asset = 'btc_onchain';
		amountSats = '';
		btcUnit = 'sats';
		const address = onchainAddress || (await walletManager.getRgbAddress());
		if (ticket !== railTicket) return;
		receiveValue = address;
		await paintQr(address);
	}

	async function showPlainDollars(): Promise<void> {
		railTicket += 1;
		receiveTab = 'dollars';
		receiveRail = 'onchain';
		simpleKind = 'dollars';
		resetAmountDraft();
		amountSats = '';
		await simpleCreate(true);
	}

	function showLightningRail(): void {
		railTicket += 1;
		receiveRail = 'lightning';
		simpleKind = receiveTab === 'bitcoin' ? 'bitcoin' : 'dollars';
		resetAmountDraft();
		errorMessage = '';
		asset = receiveTab === 'bitcoin' ? 'btc_lightning' : 'usdt_ln';
		amountSats = '';
		receiveValue = '';
		qrUrl = '';
	}

	async function applySetAmount(): Promise<void> {
		if (receiveRail === 'lightning') {
			if (!lightningRailReady) return;
			errorMessage = '';
			receiveValue = '';
			qrUrl = '';
			if (receiveTab === 'bitcoin') {
				const sats = Number(satsInput);
				if (!Number.isFinite(sats) || sats <= 0) return;
				simpleKind = 'bitcoin';
				btcUnit = 'sats';
				asset = 'btc_lightning';
				amountSats = String(Math.round(sats));
				const usd = usdFromSats(Math.round(sats), btcPrice.price);
				shownDollars =
					usd === null
						? `${new Intl.NumberFormat('en-US').format(Math.round(sats))} ${$t('wallet.sats')}`
						: formatUsd(usd);
			} else {
				const dollars = Number(usdInput);
				if (!Number.isFinite(dollars) || dollars <= 0) return;
				simpleKind = 'dollars';
				asset = 'usdt_ln';
				amountSats = String(dollars);
				shownDollars = `$${dollars.toFixed(2)}`;
			}
			await handleGenerate();
			if (receiveValue) {
				simpleStep = 'ready';
				settingAmount = false;
			}
			return;
		}
		if (receiveTab === 'bitcoin') {
			const sats = Number(satsInput);
			if (!Number.isFinite(sats) || sats <= 0) return;
			simpleKind = 'bitcoin';
			btcUnit = 'sats';
			amountSats = String(Math.round(sats));
			await simpleCreate(false);
			return;
		}
		const dollars = Number(usdInput);
		if (!Number.isFinite(dollars) || dollars <= 0) return;
		simpleKind = 'dollars';
		amountSats = String(dollars);
		await simpleCreate(false);
	}

	async function clearAmount(): Promise<void> {
		if (receiveRail === 'lightning') {
			showLightningRail();
			return;
		}
		usdInput = '';
		satsInput = '';
		settingAmount = false;
		if (receiveTab === 'bitcoin') await showPlainBitcoin();
		else await showPlainDollars();
	}

	function retrySimple(): void {
		if (receiveRail === 'lightning') {
			void applySetAmount();
			return;
		}
		void simpleCreate(receiveTab === 'dollars' && !(Number(amountSats) > 0));
	}

	async function selectAdvancedAsset(id: ReceiveAsset): Promise<void> {
		const ticket = ++railTicket;
		asset = id;
		receiveValue = '';
		qrUrl = '';
		invoiceAmount = '';
		errorMessage = '';
		usedBlank = false;
		copied = false;
		confirmCancel = false;
		if (id !== 'btc_onchain') return;
		amountSats = '';
		const address = onchainAddress || (await walletManager.getRgbAddress());
		if (ticket !== railTicket) return;
		receiveValue = address;
		await paintQr(address);
	}

	onMount(() => {
		if (receiveValue) void paintQr(receiveValue);
		if (!$advancedWallet) void showPlainBitcoin();
		else void selectAdvancedAsset('btc_onchain');
	});

	function textToCopy(): string {
		const value = receiveValue.trim();
		if (!value) return '';
		if (asset !== 'btc_onchain' && !value.toLowerCase().startsWith('bitcoin:')) return value;
		const address =
			value
				.replace(/^bitcoin:/i, '')
				.split('?')[0]
				?.trim() ?? '';
		return address || value;
	}

	function blockWithoutBitcoin(): boolean {
		if (walletManager.getBtcBalanceSats() >= MIN_COLORABLE_SATS) return false;
		errorMessage = $t('wallet.simple.need_bitcoin');
		isGenerating = false;
		receiveValue = '';
		qrUrl = '';
		shownDollars = '';
		return true;
	}

	async function shareReceive(): Promise<void> {
		const text = receiveValue.trim();
		if (!text) return;
		if (typeof navigator.share === 'function') {
			try {
				await navigator.share({ text });
				return;
			} catch (error: unknown) {
				console.error('[receive-modal] share failed', error);
			}
		}
		await handleCopy();
	}

	async function handleCopy(): Promise<void> {
		const text = textToCopy();
		if (!text) {
			appStore.showErrorToast($t('common.error'));
			return;
		}
		const didCopy = await copyToClipboard(text);
		if (didCopy) {
			copied = true;
			appStore.showSuccessToast($t('wallet.copied'));
			return;
		}
		appStore.showErrorToast($t('common.error'));
	}
</script>

<div class="flex flex-col gap-4" data-testid="receive-payment-form">
	{#if !$advancedWallet}
		{#if testMoney}
			<span class="badge badge-warning badge-sm w-fit" data-testid="test-money">
				{$t('wallet.simple.test_money')}
			</span>
		{/if}
		<div class="join w-full" role="tablist">
			<button
				type="button"
				class="btn join-item min-h-12 flex-1"
				class:btn-primary={receiveTab === 'bitcoin'}
				data-testid="receive-tab-bitcoin"
				onclick={() => void showPlainBitcoin()}
			>
				{$t('wallet.simple.bitcoin')}
			</button>
			<button
				type="button"
				class="btn join-item min-h-12 flex-1"
				class:btn-primary={receiveTab === 'dollars'}
				data-testid="receive-tab-dollars"
				onclick={() => void showPlainDollars()}
			>
				{$t('wallet.simple.dollars')}
			</button>
		</div>
		<div class="join w-full" role="tablist" aria-label={$t('wallet.simple.rail')}>
			<button
				type="button"
				class="btn join-item min-h-12 flex-1"
				class:btn-primary={receiveRail === 'onchain'}
				aria-pressed={receiveRail === 'onchain'}
				data-testid="receive-rail-onchain"
				onclick={() => {
					if (receiveRail === 'onchain') return;
					if (receiveTab === 'bitcoin') void showPlainBitcoin();
					else void showPlainDollars();
				}}
			>
				{$t('wallet.simple.on_chain')}
			</button>
			<button
				type="button"
				class="btn join-item min-h-12 flex-1"
				class:btn-primary={receiveRail === 'lightning'}
				aria-pressed={receiveRail === 'lightning'}
				data-testid="receive-rail-lightning"
				onclick={showLightningRail}
			>
				{$t('wallet.simple.lightning')}
			</button>
		</div>
		{#if receiveRail === 'lightning' && !lightningRailReady}
			<div class="alert alert-warning text-sm" role="status" data-testid="receive-rail-unavailable">
				{$t('wallet.simple.lightning_unavailable')}
			</div>
		{:else if receiveRail === 'lightning' && !receiveValue && !errorMessage}
			<p class="text-sm" data-testid="receive-lightning-needs-amount">
				{$t('wallet.simple.set_amount_first')}
			</p>
		{/if}
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
		{#if qrUrl}
			<div class="mx-auto w-full max-w-xs rounded-xl bg-white p-3" data-testid="receive-qr-frame">
				<img
					src={qrUrl}
					alt={$t('wallet.simple.show_payer')}
					class="w-full"
					data-testid="receive-qr"
				/>
			</div>
		{/if}
		{#if receiveValue}
			<div class="bg-base-200 rounded-lg p-3 text-xs break-all" data-testid="receive-value">
				<p class="font-mono">{receiveValue}</p>
			</div>
			<button
				type="button"
				class="btn btn-primary min-h-12 w-full"
				onclick={shareReceive}
				data-testid="receive-share"
			>
				{$t('wallet.simple.share')}
			</button>
			<button
				type="button"
				class="btn btn-outline min-h-12 w-full"
				onclick={handleCopy}
				data-testid="receive-copy"
			>
				{copied ? $t('wallet.copied') : $t('wallet.simple.copy')}
			</button>
		{/if}
		{#if usedBlank && !settingAmount}
			<p class="text-base-content/70 text-sm" data-testid="receive-usdt-blank-hint">
				{$t('wallet.invoice_omits_amount')}
			</p>
		{:else if shownDollars}
			<p class="text-center text-3xl font-bold" data-testid="receive-usdt-amount">{shownDollars}</p>
		{/if}
		<button
			type="button"
			class="btn btn-outline min-h-12 w-full"
			data-testid="receive-set-amount"
			disabled={receiveRail === 'lightning' && !lightningRailReady}
			onclick={() => (settingAmount = !settingAmount)}
		>
			{$t('wallet.simple.set_amount')}
		</button>
		{#if settingAmount}
			<div class="flex items-end gap-2" data-testid="receive-amount-row">
				<label class="form-control min-w-0 flex-1" style:order={usdFirst ? 1 : 3}>
					<span class="label-text mb-1">USD</span>
					<input
						class="input input-bordered min-h-12 w-full text-xl"
						inputmode="decimal"
						placeholder="$0"
						value={usdInput}
						oninput={(event) => amountField(event, 'usd')}
						data-testid="receive-amount-usd"
					/>
				</label>
				<button
					type="button"
					class="btn btn-circle btn-outline min-h-12 min-w-12"
					style:order={2}
					data-testid="receive-unit-toggle"
					aria-label={$t('wallet.simple.swap')}
					onclick={() => (usdFirst = !usdFirst)}
				>
					⇅
				</button>
				<label class="form-control min-w-0 flex-1" style:order={usdFirst ? 3 : 1}>
					<span class="label-text mb-1">{$t('wallet.sats')}</span>
					<input
						class="input input-bordered min-h-12 w-full text-xl"
						inputmode="numeric"
						placeholder="0"
						value={satsInput}
						oninput={(event) => amountField(event, 'sats')}
						data-testid="receive-amount-sats"
					/>
				</label>
			</div>
			<div class="flex gap-2">
				{#each [10, 50, 100] as chip (chip)}
					<button
						type="button"
						class="btn btn-outline min-h-12 flex-1"
						data-testid="receive-chip-{chip}"
						onclick={() => syncFromUsd(String(chip))}
					>
						${chip}
					</button>
				{/each}
			</div>
			<button
				type="button"
				class="btn btn-primary min-h-12 w-full"
				disabled={isGenerating ||
					(receiveTab === 'bitcoin' ? !(Number(satsInput) > 0) : !(Number(usdInput) > 0))}
				data-testid="receive-generate"
				onclick={() => void applySetAmount()}
			>
				{#if isGenerating}
					<span class="loading loading-spinner loading-sm"></span>
				{/if}
				{$t('wallet.simple.use_amount')}
			</button>
			<button
				type="button"
				class="btn btn-ghost min-h-12 w-full"
				data-testid="receive-skip"
				onclick={() => void clearAmount()}
			>
				{$t('wallet.simple.skip')}
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
					{@render testBtcLink()}
				{:else}
					<button type="button" class="btn btn-sm min-h-12" onclick={retrySimple}>
						{$t('wallet.simple.try_again')}
					</button>
				{/if}
			</div>
		{/if}
	{:else}
		<!-- Asset selector -->
		<div class="grid grid-cols-2 gap-2" role="group" aria-label={$t('wallet.taproot.token')}>
			{#each assets as option (option.id)}
				<button
					type="button"
					class="btn btn-sm h-auto min-h-11 px-2 py-2 text-xs leading-tight whitespace-normal {assetButtonTone(
						option.id
					)}"
					class:ring-2={asset === option.id}
					class:ring-base-content={asset === option.id}
					onclick={() => void selectAdvancedAsset(option.id)}
					data-testid={`receive-asset-${option.id}`}
				>
					{$t(option.labelKey)}
				</button>
			{/each}
		</div>

		{#if requiresAmount && !usdtUnconfigured && !receiveValue && !advancedRailBlocked}
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
		{#if advancedRailBlocked}
			<div class="alert alert-warning text-sm" role="status" data-testid="receive-rail-unavailable">
				{$t('wallet.simple.lightning_unavailable')}
			</div>
		{/if}
		{#if usedBlank && !(Number(amountSats) > 0)}
			<p class="text-base-content/70 text-sm" data-testid="receive-usdt-blank-hint">
				{$t('wallet.invoice_omits_amount')}
			</p>
		{/if}

		{#if isGenerating}
			<p class="flex items-center gap-2 text-sm" role="status" data-testid="receive-creating">
				<span class="loading loading-spinner loading-sm"></span>
				{$t('wallet.simple.preparing')}
			</p>
		{/if}

		{#if !receiveValue && !advancedRailBlocked}
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
		{/if}
		{#if receiveValue}
			{#if qrUrl}
				<div class="mx-auto w-full max-w-xs rounded-xl bg-white p-3" data-testid="receive-qr-frame">
					<img
						src={qrUrl}
						alt={$t('wallet.simple.show_payer')}
						class="w-full"
						data-testid="receive-qr"
					/>
				</div>
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
				class="btn btn-primary w-full"
				onclick={shareReceive}
				data-testid="receive-share"
			>
				{$t('wallet.simple.share')}
			</button>
			<button
				type="button"
				class="btn btn-outline w-full"
				onclick={handleCopy}
				data-testid="receive-copy"
			>
				{copied
					? $t('wallet.copied')
					: $t(
							asset === 'btc_onchain'
								? 'wallet.taproot.copy_address'
								: 'wallet.taproot.copy_invoice'
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
				<span>{errorMessage}</span>
				{@render testBtcLink()}
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

{#snippet testBtcLink()}
	{#if needBitcoin && sandboxIsolatesCatalog()}
		<a
			class="link font-medium"
			href="https://t.me/Utexo_RLN_bot"
			target="_blank"
			rel="noopener noreferrer"
			data-testid="get-test-btc"
		>
			{$t('wallet.simple.get_test_btc')}
		</a>
	{/if}
{/snippet}
