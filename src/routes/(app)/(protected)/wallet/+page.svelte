<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { locale, t } from 'svelte-i18n';
	import { walletStore } from '$lib/stores/wallet/wallet-state';
	import { walletConnectionStore } from '$lib/stores/wallet/wallet-link';
	import { lightningStore, SIGNET_USDT_ASSET } from '$lib/stores/wallet/signet-lsp';
	import { lightningUxStatus, summarizeChannelBalances } from '$lib/stores/wallet/lightning-status';
	import { walletManager } from '$lib/stores/wallet/wallet-manager';
	import type { Component } from 'svelte';
	import ReceivePaymentForm from '$lib/components/wallet/ReceivePaymentForm.svelte';
	import AdvancedLightning from '$lib/components/wallet/AdvancedLightning.svelte';
	import SendPaymentForm from '$lib/components/wallet/SendPaymentForm.svelte';
	import PullToRefresh from '$lib/components/wallet/PullToRefresh.svelte';
	import WalletPaymentModal from '$lib/components/wallet/WalletPaymentModal.svelte';
	import { getUtexoWallet } from '$lib/stores/wallet/wallet-init';
	import { walletReloadRequired } from '$lib/stores/wallet/wasm-lock';
	import {
		cancelUnpaidInvoices,
		hidesCancelledReceive,
		refreshIncomingTransfers,
		repairUsdtBalance,
		stickCancelledReceives
	} from '$lib/stores/wallet/wallet-balances';
	import { formatUsdtBalance, usdtPrecision } from '$lib/types/rgb-contract';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import {
		bitcoinFigures,
		combinedSats,
		formatUsd,
		lockedUnits,
		shownUsdt,
		totalInSats,
		totalInUsd,
		usdtOnHold
	} from '$lib/stores/wallet/plain-wallet';
	import TransferSheet from '$lib/components/wallet/TransferSheet.svelte';
	import { mergedTransactionRows } from '$lib/components/wallet/transaction-rows';
	import {
		advancedWallet,
		loadAdvancedMode,
		setAdvancedMode
	} from '$lib/stores/wallet/wallet-mode';
	import { callWithDeadline } from '$lib/stores/wallet/wallet-send';
	import { acknowledgeWalletSession, walletSession } from '$lib/stores/wallet/wallet-session';
	import {
		decodeRgbInvoice,
		pendingBlindReceives,
		type BlindReceiveRow
	} from '$lib/stores/wallet/decode-rgb-invoice';
	import {
		parseWalletUtxos,
		type WalletUtxoKind,
		type WalletUtxoRow
	} from '$lib/stores/wallet/rgb-allocations';
	import {
		shortOutpoint,
		signetTxUrl,
		summarizeUtxoKinds
	} from '$lib/components/wallet/wallet-formatters';

	let initializationError = $state<string | null>(null);
	let operationMessage = $state<string | null>(null);
	let sentHref = $state<string | null>(null);
	let isSendOpen = $state(false);
	let isReceiveOpen = $state(false);
	let isTransferOpen = $state(false);
	let scannedPay = $state('');
	let booting = $state(true);
	let QrScanner = $state.raw<Component<{
		onScan?: (result: string) => void;
		onClose?: () => void;
		mode?: 'inline' | 'fullscreen' | 'modal' | 'auto';
		sources?: boolean;
	}> | null>(null);
	let utxos = $state<WalletUtxoRow[]>([]);
	let utxoError = $state<string | null>(null);
	let showUtxoDetails = $state(false);
	let lightningBtcSats = $state(0);
	let lightningUsdtUnits = $state(0);
	let blindReceives = $state<BlindReceiveRow[]>([]);
	let refreshedSeal = $state('');
	let refreshing = $state(false);
	let repairing = $state(false);
	let confirmRepair = $state(false);
	let scanningPay = $state(false);
	let repairNote = $state('');
	let refreshNote = $state('');
	const rgbAssets = $derived($walletStore.rgb.assets ?? []);
	const usdtAsset = $derived(
		rgbAssets.find((asset) => asset.symbol?.toUpperCase() === 'USDT') ?? null
	);
	const otherAssets = $derived(rgbAssets.filter((asset) => asset !== usdtAsset));
	const utxoSummary = $derived(summarizeUtxoKinds(utxos.map((utxo) => utxo.kind)));
	const lightningUx = $derived(
		lightningUxStatus({
			ready: $lightningStore.ready,
			channel: $lightningStore.channel,
			onchainSats: $walletStore.rgb?.balanceSats ?? 0,
			failure: $lightningStore.failure
		})
	);
	const lightningFailureText = $derived.by(() => {
		if ($lightningStore.failure === 'attach') {
			return translate(
				'wallet.lightning_failed_attach',
				'Lightning did not start. Reload the page.'
			);
		}
		if ($lightningStore.failure === 'connect') {
			return translate(
				'wallet.lightning_failed_connect',
				'Lightning could not connect. Reload the page.'
			);
		}
		if ($lightningStore.failure === 'tab') {
			return translate(
				'wallet.lightning_failed_tab',
				'This wallet is already open in another tab. Close that tab and tap Unlock.'
			);
		}
		return translate('wallet.lightning_failed_channel', 'The Lightning channel did not open.');
	});
	const shownError = $derived(initializationError ?? $walletStore.error);
	const reloadRequired = $derived(walletReloadRequired(shownError));
	const advanced = $derived($advancedWallet);
	const testMoney = $derived(
		((import.meta.env.VITE_BITCOIN_NETWORK as string | undefined) ?? 'testnet') !== 'bitcoin'
	);
	const bitcoinSats = $derived(
		combinedSats(
			$walletStore.totalBalances?.sats ?? $walletStore.rgb?.balanceSats ?? 0,
			lightningBtcSats
		)
	);
	const bitcoinCard = $derived(bitcoinFigures(bitcoinSats, btcPrice.price));
	const lockedCaption = $derived.by(() => {
		const locked = lockedUnits(usdtAsset);
		if (locked <= 0) return '';
		const precision = usdtPrecision(usdtAsset?.symbol ?? 'USDT', usdtAsset?.precision);
		const amount = `$${formatUsdtBalance(locked, precision)}`;
		return translate(
			'wallet.locked_or_unconfirmed',
			'{amount} is stuck on a spent coin and cannot be sent'
		).replaceAll('{amount}', amount);
	});
	const heldDollars = $derived.by(() => {
		const hold = usdtOnHold(usdtAsset);
		if (!hold) return '';
		const precision = usdtPrecision(usdtAsset?.symbol ?? 'USDT', usdtAsset?.precision);
		return translate('wallet.on_hold', 'Available {available} ({hold} on hold)')
			.replaceAll('{available}', `$${formatUsdtBalance(hold.available, precision)}`)
			.replaceAll('{hold}', `$${formatUsdtBalance(hold.hold, precision)}`);
	});
	const dollarUnits = $derived.by(() => {
		const units = shownUsdt(usdtAsset, $walletStore.totalBalances?.usdt ?? 0, lightningUsdtUnits);
		const precision = usdtPrecision(usdtAsset?.symbol ?? 'USDT', usdtAsset?.precision);
		return formatUsdtBalance(units, precision);
	});
	let rememberedDollars = $state('');
	$effect(() => {
		if ($walletStore.locked) return;
		if (dollarUnits && dollarUnits !== '0.00' && dollarUnits !== '0') {
			rememberedDollars = dollarUnits;
		}
	});
	const displayDollars = $derived.by(() => {
		const syncing = $walletStore.syncing || $walletStore.isInitializing;
		const proved = (usdtAsset?.chainSpent ?? 0) > 0 || usdtAsset?.changeDue === true;
		if (
			!proved &&
			syncing &&
			rememberedDollars &&
			(dollarUnits === '0.00' || dollarUnits === '0')
		) {
			return rememberedDollars;
		}
		return dollarUnits;
	});
	const dollarBalance = $derived(Number(String(displayDollars).replace(/,/g, '')) || 0);
	const totalUsdText = $derived(formatUsd(totalInUsd(bitcoinSats, dollarBalance, btcPrice.price)));
	const totalSatsNumber = $derived(totalInSats(bitcoinSats, dollarBalance, btcPrice.price));
	let balanceUnit = $state<'usd' | 'sats'>('usd');
	const totalText = $derived(
		balanceUnit === 'sats' ? `${formatNumber(totalSatsNumber)} ${$t('wallet.sats')}` : totalUsdText
	);
	const priceMissing = $derived(
		!(btcPrice.price > 0) &&
			((balanceUnit === 'usd' && bitcoinSats > 0) || (balanceUnit === 'sats' && dollarBalance > 0))
	);
	const activityRows = $derived(
		mergedTransactionRows($walletStore.transactions ?? [], {
			btcUsd: btcPrice.price > 0 ? btcPrice.price : null,
			now: Date.now(),
			locale: $locale ?? 'en',
			satsWord: $t('wallet.transactions.sats'),
			unavailable: $t('wallet.transactions.price_unavailable')
		}).slice(0, 3)
	);
	const arrivingText = $derived.by(() => {
		let units = 0;
		let waiting = false;
		for (const row of blindReceives) {
			if (!row.txid) continue;
			waiting = true;
			try {
				const amount = decodeRgbInvoice(row.invoice).amount;
				if (amount && amount > 0) units += amount;
			} catch (error: unknown) {
				console.error('[wallet-page] arriving amount failed', error);
			}
		}
		if (!waiting) return '';
		if (units <= 0) return translate('wallet.simple.arriving_soon', 'Money is arriving');
		return translate('wallet.simple.arriving', '+ {amount} arriving').replaceAll(
			'{amount}',
			`$${formatUsdtBalance(units, 6)}`
		);
	});

	function text(value: unknown, fallback: string): string {
		return typeof value === 'string' && value.trim() ? value : fallback;
	}

	function translate(key: string, fallback: string): string {
		return text($t(key), fallback);
	}

	function formatNumber(value: unknown, fallback = '0'): string {
		const numeric = typeof value === 'number' ? value : Number(value);
		return Number.isFinite(numeric)
			? new Intl.NumberFormat().format(Math.max(0, numeric))
			: fallback;
	}

	let unlockAbort: AbortController | null = null;

	async function unlockFromClick(): Promise<void> {
		initializationError = null;
		const clickAbort = new AbortController();
		try {
			await walletManager.unlock(clickAbort.signal);
			await initializeWallet();
		} catch (error) {
			const message = error instanceof Error ? error.message : '';
			initializationError =
				message === 'unlock cancelled, tap to retry'
					? translate(
							'wallet.passkey_locked',
							"We couldn't reach your passkey. If it's saved in a password manager (like Bitwarden), unlock it, then tap Retry."
						)
					: message === 'Wallet init timed out' || message === 'Wallet unlock timed out'
						? translate(
								'wallet.init_timeout',
								'Wallet setup timed out. Reload the page to try again.'
							)
						: message ||
							text($t('wallet.error.initialization_failed'), 'Wallet initialization failed');
		}
	}

	async function initializeWallet(): Promise<void> {
		initializationError = null;
		try {
			await walletManager.initialize();
			if ($walletStore.locked) return;
			await walletManager.loadAssets();
			await refreshIncomingTransfers();
			await loadUtxos();
			await loadBlindReceives();
		} catch (error) {
			initializationError =
				error instanceof Error
					? error.message
					: text($t('wallet.error.initialization_failed'), 'Wallet initialization failed');
			console.error('[wallet-page] Wallet initialization failed:', error);
		} finally {
			booting = false;
			document.getElementById('wallet-boot-skeleton')?.remove();
		}
	}

	function receiveClosed(): boolean {
		return (
			!$walletStore.isConnected ||
			$walletStore.isInitializing ||
			$walletStore.locked ||
			$walletSession.blocked
		);
	}

	function ensureScanner(): void {
		if (QrScanner) return;
		import('$lib/components/WebQrCodeScanner.svelte')
			.then((module) => {
				QrScanner = module.default;
			})
			.catch((error: unknown) => {
				console.error('[wallet-page] scanner failed to load', error);
			});
	}

	let checkoutId = $state('');

	onMount(() => {
		const sheet =
			page.url.searchParams.get('sheet') ||
			sessionStorage.getItem('bittasker.checkout-sheet') ||
			'';
		const path =
			page.url.searchParams.get('return') ||
			sessionStorage.getItem('bittasker.checkout-return') ||
			'';
		checkoutId = path.match(/^\/browse\/goods\/([A-Za-z0-9_-]+)$/)?.[1] ?? '';
		if (sheet === 'receive') isReceiveOpen = true;
		loadAdvancedMode();
		unlockAbort = new AbortController();
		initializeWallet().catch((err: unknown) => {
			console.error('[wallet-page-init-error]', err);
		});
		return () => unlockAbort?.abort();
	});

	$effect(() => {
		const balance = usdtAsset?.balance ?? null;
		if (balance === null && usdtAsset) return;
		loadBlindReceives().catch((error: unknown) => {
			console.error('[wallet-page] receive list failed:', error);
		});
	});

	let lastUtxoMarker = '';
	$effect(() => {
		const locked = $walletStore.locked;
		const syncing = $walletStore.syncing;
		const marker = `${usdtAsset?.assetId ?? ''}:${usdtAsset?.spendable ?? ''}:${usdtAsset?.balance ?? ''}`;
		if (locked || syncing || marker === lastUtxoMarker) return;
		lastUtxoMarker = marker;
		loadUtxos().catch((error: unknown) => {
			console.error('[wallet-page] UTXO list failed:', error);
		});
		loadChannelBalances().catch((error: unknown) => {
			console.error('[wallet-page] channel balance failed:', error);
		});
	});

	async function loadChannelBalances(): Promise<void> {
		const wallet = getUtexoWallet();
		if (!wallet?.listChannels) return;
		try {
			const summary = summarizeChannelBalances(await wallet.listChannels(), SIGNET_USDT_ASSET);
			lightningBtcSats = summary.btcSats;
			lightningUsdtUnits = summary.usdtUnits;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error('[wallet-page] channel balance failed:', message);
			if (/not a function|not configured/i.test(message)) {
				lightningStore.update((row) =>
					row.ready || row.failure ? row : { ...row, failure: 'attach' }
				);
			}
		}
	}

	async function loadUtxos(): Promise<void> {
		const wallet = getUtexoWallet();
		if (!wallet?.listUnspents) {
			utxos = [];
			return;
		}
		try {
			utxos = parseWalletUtxos(await wallet.listUnspents());
			utxoError = null;
		} catch (error) {
			utxoError = error instanceof Error ? error.message : translate('wallet.no_utxos', 'No UTXOs');
			console.error('[wallet-page] UTXO list failed:', error);
		}
	}

	async function loadBlindReceives(): Promise<void> {
		const wallet = getUtexoWallet();
		if (!wallet?.listTransfers) {
			blindReceives = [];
			return;
		}
		await stickCancelledReceives();
		try {
			const plain = await wallet.listTransfers();
			const listed = wallet.listAssets ? await wallet.listAssets().catch(() => null) : null;
			const ids: string[] = [];
			if (listed && typeof listed === 'object') {
				const groups = listed as { ifa?: unknown; nia?: unknown };
				for (const rows of [groups.ifa, groups.nia]) {
					if (!Array.isArray(rows)) continue;
					for (const row of rows) {
						if (!row || typeof row !== 'object') continue;
						const assetId = (row as { assetId?: unknown }).assetId;
						if (typeof assetId === 'string' && assetId.length > 0) ids.push(assetId);
					}
				}
			}
			const named = await Promise.all(
				ids.map(async (id) => {
					try {
						const batch = await wallet.listTransfers?.(id);
						return Array.isArray(batch) ? batch : [];
					} catch {
						return [];
					}
				})
			);
			blindReceives = pendingBlindReceives([
				...(Array.isArray(plain) ? plain : []),
				...named.flat()
			]).filter((row) => !hidesCancelledReceive(row.seal));
		} catch (error) {
			blindReceives = [];
			console.error('[wallet-page] receive list failed:', error);
		}
		const paid = blindReceives.find((row) => row.txid);
		if (paid?.txid && refreshedSeal !== paid.seal) {
			refreshedSeal = paid.seal;
			void refreshIncomingTransfers();
		}
	}

	async function repairWallet(): Promise<void> {
		if (repairing || $walletStore.locked) return;
		repairing = true;
		repairNote = '';
		try {
			await repairUsdtBalance();
			await loadUtxos();
			repairNote = translate(
				'wallet.repair_done',
				'Wallet checked. The balance is what you can send.'
			);
		} catch (error: unknown) {
			console.error('[wallet-page] repair failed', error);
			repairNote = translate('wallet.repair_failed', 'Could not check the wallet. Try again.');
		} finally {
			repairing = false;
		}
	}

	async function refreshSharedSession(): Promise<void> {
		if ($walletStore.locked) return;
		try {
			await repairUsdtBalance();
			await loadUtxos();
			await loadBlindReceives();
		} catch (error: unknown) {
			console.error('[wallet-page] session refresh failed', error);
		}
		acknowledgeWalletSession();
	}

	async function acceptTransfers(): Promise<void> {
		if (refreshing || $walletStore.locked || !$walletStore.isConnected) return;
		refreshing = true;
		refreshNote = '';
		try {
			const result = await refreshIncomingTransfers();
			await loadUtxos();
			await loadBlindReceives();
			refreshNote = result.ok
				? translate('wallet.refresh_transfers_done', 'Checked for incoming dollars.')
				: translate('wallet.refresh_transfers_failed', 'Could not refresh transfers. Try again.');
		} catch (error: unknown) {
			console.error('[wallet-page] transfer refresh failed', error);
			refreshNote = translate(
				'wallet.refresh_transfers_failed',
				'Could not refresh transfers. Try again.'
			);
		} finally {
			refreshing = false;
		}
	}

	function utxoKindLabel(kind: WalletUtxoKind): string {
		if (kind === 'free') return translate('wallet.utxo_free', 'Free');
		if (kind === 'colored') return translate('wallet.utxo_colored', 'Colored');
		if (kind === 'locked') return translate('wallet.utxo_locked', 'Locked');
		return translate('wallet.utxo_vanilla', 'Vanilla');
	}

	let sentNotice = 0;

	function handleSent(txid: string): void {
		if (!txid) {
			operationMessage = null;
			sentHref = null;
			return;
		}
		const notice = ++sentNotice;
		sentHref = advanced ? signetTxUrl(txid) : null;
		operationMessage =
			advanced && /^[0-9a-f]{64}$/i.test(txid)
				? text($t('wallet.toast.sent_successfully', { values: { txid } }), `Sent ${txid}`)
				: $t('wallet.simple.sent_done');
		setTimeout(() => {
			if (sentNotice === notice) {
				operationMessage = null;
				sentHref = null;
			}
		}, 60_000);
		acceptTransfers().catch((error: unknown) => {
			console.error('[wallet-page] balance reload failed:', error);
		});
	}

	async function copyInvoice(invoice: string): Promise<void> {
		if (!invoice) return;
		try {
			await navigator.clipboard.writeText(invoice);
		} catch (error) {
			console.error('[wallet-page] copy invoice failed:', error);
		}
	}

	let confirmDrop = $state(false);
	let droppingInvoice = $state(false);
	let cancelStatus = $state('');

	async function dropInvoice(): Promise<void> {
		if (!confirmDrop) {
			confirmDrop = true;
			return;
		}
		droppingInvoice = true;
		cancelStatus = translate('wallet.taproot.cancelling', 'Cancelling... syncing wallet');
		try {
			await callWithDeadline(
				cancelUnpaidInvoices(),
				45_000,
				translate('wallet.taproot.cancel_failed', 'Cancel failed. Tap Retry.')
			);
			confirmDrop = false;
			cancelStatus = translate('wallet.taproot.cancel_done', 'Receive code cancelled');
			await loadBlindReceives();
			await loadUtxos();
			await walletManager.loadAssets();
		} catch (error) {
			cancelStatus = translate('wallet.taproot.cancel_failed', 'Cancel failed. Tap Retry.');
			operationMessage =
				error instanceof Error
					? error.message
					: translate('wallet.taproot.cancel_failed', 'Cancel failed. Tap Retry.');
			console.error('[wallet-page] cancel invoice failed:', error);
		} finally {
			droppingInvoice = false;
		}
	}

	function handleReceiveClose(): void {
		isReceiveOpen = false;
	}

	function assetLabel(symbol: string | undefined, name: string | undefined): string {
		const label = (symbol || name || '').trim();
		if (!label || /^(nia|ifa|utxob|consignment)$/i.test(label)) {
			return translate('wallet.asset', 'Asset');
		}
		return label;
	}

	function openSend(): void {
		if ($walletSession.blocked || $walletSession.refreshing) return;
		operationMessage = null;
		scannedPay = '';
		isSendOpen = true;
	}

	function closeSend(): void {
		isSendOpen = false;
		scannedPay = '';
	}

	function openScanner(): void {
		if ($walletSession.blocked || $walletSession.refreshing) return;
		scanningPay = true;
		ensureScanner();
	}

	function closeScanner(): void {
		scanningPay = false;
	}

	function acceptScan(raw: string): void {
		scanningPay = false;
		const text = raw.trim();
		if (!text) return;
		operationMessage = null;
		scannedPay = text;
		isSendOpen = true;
	}

	function askRepair(): void {
		if (repairing || $walletStore.locked) return;
		confirmRepair = true;
	}
</script>

<svelte:head>
	<title>{translate('wallet.title', 'Wallet')}</title>
</svelte:head>

<PullToRefresh
	class="wallet-screen wallet-dock-pad relative mx-auto flex w-full max-w-md min-w-0 flex-col gap-4 px-3 pt-3 sm:px-6 sm:pt-6"
	onRefresh={acceptTransfers}
	label={$t('wallet.transactions.pull')}
>
	{#if booting}
		<div
			class="bg-base-200 absolute inset-0 z-10 mx-auto flex w-full max-w-md flex-col gap-4 p-3 sm:p-6"
			role="status"
			aria-live="polite"
			aria-label={translate('wallet.loading', 'Loading wallet')}
			data-testid="wallet-skeleton"
		>
			<div class="skeleton mx-auto h-3 w-28"></div>
			<div class="skeleton mx-auto h-10 w-40"></div>
			<div class="skeleton h-24 w-full"></div>
			<div class="skeleton h-24 w-full"></div>
			<div class="flex justify-between px-2">
				{#each [0, 1, 2, 3] as dot (dot)}
					<div class="skeleton h-16 w-16 rounded-full"></div>
				{/each}
			</div>
		</div>
	{/if}
	{#if shownError}
		<div class="relative z-20 w-full" data-testid="wallet-error-slot">
			{#if !advanced}
				<div
					class="alert alert-outline alert-error flex-wrap shadow-lg"
					role="alert"
					data-testid="wallet-error"
				>
					<span class="min-w-0">{text(shownError, $t('wallet.simple.offline_help'))}</span>
					<button
						class="btn btn-sm min-h-12 w-full sm:w-auto"
						type="button"
						onclick={() => {
							if (reloadRequired) {
								window.location.reload();
								return;
							}
							unlockFromClick().catch((err: unknown) => {
								console.error('[wallet-page] Wallet unlock failed:', err);
							});
						}}
					>
						{$t('wallet.simple.try_again')}
					</button>
				</div>
			{:else}
				<div class="alert alert-outline alert-error flex-wrap shadow-lg" role="alert">
					<span class="min-w-0">{text(shownError, 'Wallet initialization failed')}</span>
					{#if reloadRequired}
						<button class="btn btn-sm" type="button" onclick={() => window.location.reload()}>
							{translate('wallet.error.reload', 'Reload')}
						</button>
					{:else}
						<button
							class="btn btn-sm"
							type="button"
							onclick={() => {
								unlockFromClick().catch((err: unknown) => {
									console.error('[wallet-page] Wallet unlock failed:', err);
								});
							}}
						>
							{translate('wallet.error.retry', 'Retry')}
						</button>
					{/if}
				</div>
			{/if}
		</div>
	{/if}

	{#if operationMessage}
		<div
			class="alert alert-outline alert-success break-all"
			role="status"
			data-testid="sent-notice"
		>
			{#if sentHref}
				<a href={sentHref} target="_blank" rel="noopener noreferrer">{operationMessage}</a>
			{:else}
				<span>{operationMessage}</span>
			{/if}
		</div>
	{/if}

	<div class="grid w-full min-w-0 grid-cols-2 gap-2" role="group" data-testid="wallet-mode">
		<button
			type="button"
			class="btn min-h-12 w-full min-w-0 whitespace-normal"
			class:btn-primary={!advanced}
			class:btn-ghost={advanced}
			aria-pressed={!advanced}
			data-testid="mode-simple"
			onclick={() => setAdvancedMode(false)}
		>
			{$t('wallet.simple.mode_simple')}
		</button>
		<button
			type="button"
			class="btn min-h-12 w-full min-w-0 whitespace-normal"
			class:btn-primary={advanced}
			class:btn-ghost={!advanced}
			aria-pressed={advanced}
			data-testid="mode-advanced"
			onclick={() => setAdvancedMode(true)}
		>
			{$t('wallet.simple.mode_advanced')}
		</button>
	</div>

	{#snippet assetMark(symbol: string)}
		{@const ticker = symbol.toUpperCase()}
		<span
			class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold"
			class:bg-primary={ticker === 'BTC' || ticker === 'BITCOIN'}
			class:text-primary-content={ticker === 'BTC' || ticker === 'BITCOIN'}
			class:bg-success={ticker === 'USDT'}
			class:text-success-content={ticker === 'USDT'}
			class:bg-base-300={ticker !== 'BTC' && ticker !== 'BITCOIN' && ticker !== 'USDT'}
			aria-hidden="true"
		>
			{ticker === 'BTC' || ticker === 'BITCOIN'
				? '₿'
				: ticker === 'USDT'
					? '₮'
					: ticker.slice(0, 1)}
		</span>
	{/snippet}

	{#snippet repairButton()}
		<button
			type="button"
			class="text-base-content/70 inline-flex min-h-12 items-center self-start px-1 text-sm underline disabled:opacity-50"
			data-testid="repair-wallet"
			disabled={repairing || $walletStore.locked}
			onclick={askRepair}
		>
			{#if repairing}
				<span class="loading loading-spinner loading-xs mr-2"></span>
			{/if}
			{translate('wallet.repair_wallet', 'Repair wallet')}
		</button>
	{/snippet}

	{#snippet refreshControl()}
		<button
			type="button"
			class="btn btn-ghost btn-circle min-h-12 min-w-12 shrink-0"
			data-testid="refresh-transfers"
			aria-label={translate('wallet.refresh_transfers', 'Refresh transfers')}
			disabled={refreshing || $walletStore.locked || !$walletStore.isConnected}
			onclick={() => {
				acceptTransfers().catch((error: unknown) => {
					console.error('[wallet-page] transfer refresh failed', error);
				});
			}}
		>
			{#if refreshing}
				<span class="loading loading-spinner loading-sm"></span>
			{:else}
				<svg
					class="h-6 w-6"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M21 12a9 9 0 11-2.64-6.36"
					/>
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 3v6h-6" />
				</svg>
			{/if}
		</button>
	{/snippet}

	{#snippet balanceRow(symbol: string, label: string, amount: string)}
		<div
			class="border-base-300 flex w-full min-w-0 flex-wrap items-center gap-3 border-t px-4 py-3"
		>
			{@render assetMark(symbol)}
			<p class="text-base-content/60 min-w-0 flex-1 text-sm">{label}</p>
			<p class="min-w-0 text-right text-xl font-bold break-words tabular-nums sm:text-2xl">
				{amount}
			</p>
		</div>
	{/snippet}

	{#if $walletSession.refreshing}
		<p class="text-sm" data-testid="wallet-refreshing" role="status">
			<span class="loading loading-spinner loading-xs"></span>
			{translate('wallet.refreshing', 'Refreshing wallet…')}
		</p>
	{/if}
	{#if $walletSession.blocked}
		<div
			class="alert alert-outline alert-warning flex-wrap"
			role="alert"
			data-testid="wallet-other-session"
		>
			<span class="min-w-0">
				{translate(
					'wallet.other_session',
					'This wallet is open in another tab or browser. Close it or refresh'
				)}
			</span>
			<button
				class="btn btn-sm min-h-12"
				type="button"
				data-testid="wallet-session-refresh"
				disabled={$walletSession.refreshing}
				onclick={() => {
					refreshSharedSession().catch((error: unknown) => {
						console.error('[wallet-page] session refresh failed', error);
					});
				}}
			>
				{translate('wallet.session_refresh', 'Refresh')}
			</button>
		</div>
	{/if}

	{#if !advanced}
		<div class="flex items-start justify-between gap-2">
			<button
				type="button"
				class="btn btn-ghost btn-circle min-h-12 min-w-12"
				data-testid="wallet-scan"
				aria-label={$t('wallet.simple.scan')}
				onclick={openScanner}
			>
				<svg
					class="h-6 w-6"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-width="2"
						d="M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2"
					/>
					<path stroke-linecap="round" stroke-width="2" d="M4 12h16" />
				</svg>
			</button>
			<div class="min-w-0 flex-1 text-center">
				<p class="text-base-content/60 text-xs tracking-widest" data-testid="total-balance-label">
					{$t('wallet.simple.total_balance')}
				</p>
				<p class="text-4xl font-bold tabular-nums" data-testid="total-balance" aria-live="polite">
					{totalText}
				</p>
				<div class="mt-2 flex justify-center">
					<div class="join" role="group" aria-label={$t('wallet.simple.balance_unit')}>
						<button
							type="button"
							class="btn join-item min-h-12 min-w-16"
							class:btn-neutral={balanceUnit === 'usd'}
							aria-pressed={balanceUnit === 'usd'}
							data-testid="balance-unit-usd"
							onclick={() => (balanceUnit = 'usd')}
						>
							{$t('wallet.simple.unit_usd')}
						</button>
						<button
							type="button"
							class="btn join-item min-h-12 min-w-16"
							class:btn-neutral={balanceUnit === 'sats'}
							aria-pressed={balanceUnit === 'sats'}
							data-testid="balance-unit-sats"
							onclick={() => (balanceUnit = 'sats')}
						>
							{$t('wallet.simple.unit_sats')}
						</button>
					</div>
				</div>
				{#if priceMissing}
					<p class="text-base-content/60 mt-1 text-xs" data-testid="balance-price-missing">
						{$t('wallet.price_unavailable')}
					</p>
				{/if}
			</div>
			{@render refreshControl()}
		</div>
	{/if}

	{#if !advanced}
		<div
			class="card wallet-hero bg-base-100 border-base-300 border shadow-sm"
			data-testid="balance-bitcoin"
		>
			<div class="card-body gap-1 p-4">
				<p class="text-sm">{$t('wallet.simple.bitcoin')}</p>
				<p
					class="text-2xl font-bold break-words tabular-nums sm:text-3xl"
					data-testid="balance-sats"
				>
					{bitcoinCard.satsText}
					{$t('wallet.sats')}
				</p>
				<p class="text-base-content/60 text-sm tabular-nums" data-testid="balance-fiat">
					{bitcoinCard.fiat ?? $t('wallet.price_unavailable')}
				</p>
			</div>
		</div>
	{/if}

	<div
		class="card wallet-hero bg-base-100 border-base-300 border shadow-sm"
		data-testid="balance-dollars"
	>
		<div class="card-body gap-1 p-4">
			<p class="text-sm">{$t('wallet.simple.usdt')}</p>
			{#if $walletStore.locked}
				<button
					type="button"
					class="min-h-12 w-full text-left text-xl font-semibold"
					data-testid="wallet-locked-balance"
					onclick={() => {
						unlockFromClick().catch((err: unknown) => {
							console.error('[wallet-page] Wallet unlock failed:', err);
						});
					}}
				>
					{$walletConnectionStore.headline}
				</button>
			{:else}
				<p
					class="text-2xl font-bold break-words tabular-nums sm:text-3xl"
					data-testid="balance-usdt"
				>
					${displayDollars}
				</p>
				<p class="text-base-content/60 text-sm tabular-nums">{displayDollars} USDT</p>
				{#if heldDollars}
					<p class="text-sm" data-testid="usdt-on-hold">{heldDollars}</p>
				{/if}
				{#if lockedCaption && !$walletSession.refreshing}
					<p class="text-warning text-sm" data-testid="usdt-locked">{lockedCaption}</p>
					{@render repairButton()}
				{/if}
				{#if repairNote}
					<p class="text-sm" data-testid="repair-note">{repairNote}</p>
				{/if}
				{#if refreshNote}
					<p class="text-sm" data-testid="refresh-note" role="status">{refreshNote}</p>
				{/if}
			{/if}
		</div>
	</div>

	{#if !advanced}
		{#if testMoney}
			<span class="badge badge-warning badge-sm w-fit" data-testid="test-money">
				{$t('wallet.simple.test_money')}
			</span>
		{/if}
		{#if arrivingText}
			<p class="text-success text-sm" data-testid="funds-arriving">{arrivingText}</p>
		{/if}
		{#if utxoSummary.locked > 0}
			<p class="text-sm" data-testid="funds-escrow">
				{$t('wallet.simple.in_escrow', { values: { count: utxoSummary.locked } })}
			</p>
		{/if}
		{#if $walletStore.locked}
			<button
				class="btn btn-primary min-h-12 w-full"
				type="button"
				onclick={unlockFromClick}
				data-testid="unlock-wallet"
			>
				{$t('wallet.simple.unlock')}
			</button>
		{/if}
		<div class="flex w-full justify-between gap-2 px-1 pt-1" data-testid="wallet-actions">
			<div class="flex min-w-0 flex-1 flex-col items-center gap-1">
				<button
					class="flex w-full flex-col items-center gap-1"
					type="button"
					data-testid="wallet-receive"
					disabled={receiveClosed()}
					onclick={() => (isReceiveOpen = true)}
					aria-label={translate('wallet.tab_receive', 'Receive')}
				>
					<span
						class="btn btn-circle btn-neutral pointer-events-none min-h-16 min-w-16 text-2xl"
						aria-hidden="true">↓</span
					>
					<span class="text-xs">{$t('wallet.tab_receive')}</span>
				</button>
				{#if receiveClosed() && !$walletSession.blocked}
					<p
						class="text-base-content/60 text-center text-[11px] leading-tight"
						role="status"
						data-testid="receive-needs-wallet"
					>
						{translate('wallet.unlock_to_receive', 'Unlock wallet to receive')}
					</p>
				{/if}
			</div>
			<button
				class="flex min-w-0 flex-1 flex-col items-center gap-1"
				type="button"
				data-testid="wallet-send"
				disabled={$walletSession.blocked || $walletSession.refreshing}
				onclick={openSend}
				aria-label={translate('wallet.tab_send', 'Send')}
			>
				<span
					class="btn btn-circle btn-primary pointer-events-none min-h-16 min-w-16 text-2xl"
					aria-hidden="true">↑</span
				>
				<span class="text-xs">{$t('wallet.tab_send')}</span>
			</button>
			<button
				class="flex min-w-0 flex-1 flex-col items-center gap-1"
				type="button"
				data-testid="wallet-scan-action"
				onclick={openScanner}
				aria-label={$t('wallet.simple.scan')}
			>
				<span
					class="btn btn-circle btn-outline pointer-events-none min-h-16 min-w-16 text-2xl"
					aria-hidden="true">⌕</span
				>
				<span class="text-xs">{$t('wallet.simple.scan')}</span>
			</button>
			<button
				class="flex min-w-0 flex-1 flex-col items-center gap-1"
				type="button"
				data-testid="wallet-transfer"
				onclick={() => (isTransferOpen = true)}
				aria-label={$t('wallet.simple.transfer')}
			>
				<span
					class="btn btn-circle btn-outline pointer-events-none min-h-16 min-w-16 text-2xl"
					aria-hidden="true">⇄</span
				>
				<span class="text-xs">{$t('wallet.simple.transfer')}</span>
			</button>
		</div>
		{#if checkoutId}
			<a
				class="btn btn-outline min-h-12 w-full"
				href={resolve('/(app)/browse/goods/[id]', { id: checkoutId })}
				data-testid="back-to-checkout"
			>
				{$t('wallet.simple.back_checkout')}
			</a>
		{/if}
		<section class="flex flex-col gap-2" data-testid="wallet-activity">
			<h2 class="text-sm font-semibold">{$t('wallet.simple.activity')}</h2>
			{#if activityRows.length === 0}
				<p class="text-base-content/60 text-sm" data-testid="wallet-activity-empty">
					{$t('wallet.simple.activity_empty')}
				</p>
			{:else}
				<ul class="card bg-base-100 border-base-300 divide-base-300 divide-y border">
					{#each activityRows as row (row.key)}
						<li
							class="flex items-center justify-between gap-2 px-3 py-2"
							data-testid="wallet-activity-row"
						>
							<span class="min-w-0 flex-1 text-sm" data-testid="wallet-activity-label">
								{row.detail ||
									$t(
										row.direction === 'received'
											? 'wallet.transactions.received'
											: 'wallet.transactions.sent'
									)}
							</span>
							<span class="tabular-nums">{row.primary}</span>
						</li>
					{/each}
				</ul>
			{/if}
			<a
				class="btn btn-ghost min-h-12 w-full"
				href={resolve('/wallet/transactions')}
				data-testid="wallet-transactions"
			>
				{$t('wallet.simple.view_all')}
			</a>
		</section>
	{/if}

	{#if advanced}
		<section class="card bg-base-100 border-base-300 shrink-0 border shadow-sm">
			<div class="card-body gap-0 p-0">
				<div class="flex min-w-0 flex-wrap items-center justify-between gap-2 px-4 py-2">
					<p class="min-w-0 text-sm font-semibold">{translate('wallet.tab_balance', 'Balance')}</p>
					{@render refreshControl()}
					{#if $walletConnectionStore.phase === 'locked'}
						<span class="badge badge-warning badge-sm" data-testid="wallet-locked">
							{$walletConnectionStore.headline}
						</span>
					{:else if $walletConnectionStore.phase === 'ready'}
						<span class="badge badge-success badge-sm" data-testid="wallet-connected">
							{$walletConnectionStore.headline}
						</span>
					{:else if $walletConnectionStore.phase === 'unlocking' || $walletConnectionStore.phase === 'syncing'}
						<span class="badge badge-ghost badge-sm gap-2" data-testid="wallet-getting-ready">
							<span class="loading loading-spinner loading-xs"></span>
							{$walletConnectionStore.headline}
						</span>
					{:else if $walletConnectionStore.phase === 'error'}
						<span class="badge badge-error badge-sm" data-testid="wallet-offline">
							{$walletConnectionStore.headline}
						</span>
					{/if}
				</div>
				{@render balanceRow(
					'BTC',
					translate('wallet.bitcoin', 'Bitcoin'),
					`${formatNumber($walletStore.totalBalances.sats)} ${translate('wallet.sats', 'sats')}`
				)}
				{@render balanceRow(
					'USDT',
					usdtAsset ? assetLabel(usdtAsset.symbol, usdtAsset.name) : 'USDT',
					displayDollars
				)}
				{#if advanced && $walletStore.locked}
					<div class="px-4 py-3">
						<button
							class="btn btn-primary w-full"
							type="button"
							onclick={unlockFromClick}
							data-testid="unlock-wallet"
						>
							{translate('wallet.unlock', 'Unlock wallet')}
						</button>
					</div>
				{/if}
				{#if usdtAsset?.pendingConfirm}
					<p class="text-warning px-4 py-2 text-sm" data-testid="pending-confirmation">
						{translate('wallet.pending_confirmation', 'Pending confirmation')}
					</p>
				{/if}
				{#if !$walletStore.locked && !lockedCaption}
					<div class="px-4 py-3">
						{@render repairButton()}
					</div>
				{/if}
				{#each otherAssets as asset (asset.assetId)}
					{@render balanceRow(
						asset.symbol || asset.name,
						assetLabel(asset.symbol, asset.name),
						asset.formattedBalance || formatNumber(asset.balance)
					)}
				{/each}
			</div>
		</section>

		<section
			class="card bg-base-100 border-base-300 shrink-0 border shadow-sm"
			data-testid="lightning-wallet"
		>
			<div class="card-body gap-2 p-4">
				<div class="flex items-center justify-between gap-3">
					<p class="text-sm font-semibold">{translate('wallet.lightning_title', 'Lightning')}</p>
					{#if $walletStore.locked}
						<span class="badge badge-warning badge-sm" data-testid="lightning-locked">
							{translate('wallet.lightning_locked', 'Wallet locked')}
						</span>
					{:else if lightningUx.status === 'ready'}
						<span class="badge badge-success badge-sm" data-testid="lightning-ready">
							{translate('wallet.lightning_ready', 'Ready')}
						</span>
					{:else if lightningUx.status === 'needs_funding'}
						<span class="badge badge-warning badge-sm" data-testid="lightning-needs-funding">
							{translate('wallet.lightning_needs_funding', 'Needs funding')}
						</span>
					{:else if lightningUx.status === 'failed'}
						<span class="badge badge-error badge-sm" data-testid="lightning-failed">
							{translate('wallet.lightning_failed', 'Lightning unavailable')}
						</span>
					{:else}
						<span class="badge badge-ghost badge-sm" data-testid="lightning-setting-up">
							{translate('wallet.lightning_setting_up', 'Setting up Lightning')}
						</span>
					{/if}
				</div>
				{#if $walletStore.locked}
					<p class="text-base-content/70 text-sm" data-testid="lightning-locked-hint">
						{translate('wallet.lightning_locked', 'Wallet locked')}
					</p>
				{:else}
					<p class="text-base-content/70 text-sm" data-testid="lightning-status">
						{#if lightningUx.status === 'failed'}
							{lightningFailureText}
						{:else if lightningUx.status === 'needs_funding'}
							{translate(
								'wallet.lightning_needs_funding_amount',
								'Add {sats} sats to finish Lightning.'
							).replaceAll('{sats}', lightningUx.satsNeeded.toLocaleString())}
						{:else if lightningUx.status === 'ready'}
							{translate(
								'wallet.lightning_ready_hint',
								'You can send and receive Lightning payments.'
							)}
						{:else}
							{translate(
								'wallet.lightning_setting_up_hint',
								'Setting up Lightning. This can take a few minutes.'
							)}
						{/if}
					</p>
					<div class="flex flex-col gap-1 text-sm" data-testid="lightning-balances">
						<p>
							{translate('wallet.lightning_btc_balance', 'Lightning Bitcoin')}:
							{formatNumber(lightningBtcSats)}
							{translate('wallet.sats', 'sats')}
						</p>
						<p>
							{translate('wallet.lightning_usdt_balance', 'Lightning USDT')}:
							{formatUsdtBalance(lightningUsdtUnits, 6)} USDT
						</p>
					</div>
					<p class="text-base-content/60 text-xs">
						{translate(
							'wallet.lightning_onchain_separate',
							'On-chain balances above are separate from Lightning.'
						)}
					</p>
					<AdvancedLightning />
				{/if}
			</div>
		</section>
	{/if}

	<div class="flex flex-col gap-4">
		{#if advanced}
			<section class="card bg-base-100 border-base-300 border shadow-sm" data-testid="wallet-utxos">
				<div class="card-body gap-2 p-4">
					<p class="text-base-content/60 text-sm">
						{translate('wallet.utxo_state', 'Assets on Bitcoin')}
					</p>
					<button
						type="button"
						class="btn btn-ghost btn-sm text-base-content/50 w-full"
						aria-expanded={showUtxoDetails}
						onclick={() => (showUtxoDetails = !showUtxoDetails)}
					>
						{translate('wallet.utxo_advanced', 'Show coin details')}
					</button>
					{#if showUtxoDetails}
						{#if utxoError}
							<p class="text-error text-sm">{utxoError}</p>
						{:else if utxos.length === 0}
							<p class="text-base-content/60 text-sm">{translate('wallet.no_utxos', 'No UTXOs')}</p>
						{:else}
							<ul class="text-sm">
								<li>
									{$t('wallet.utxo_asset_bearing', { values: { count: utxoSummary.colored } })}
								</li>
								<li>{$t('wallet.utxo_in_escrow', { values: { count: utxoSummary.locked } })}</li>
								<li>
									{$t('wallet.utxo_available_btc', { values: { count: utxoSummary.available } })}
								</li>
							</ul>
							<ul class="divide-base-300 divide-y">
								{#each utxos as utxo (utxo.id)}
									<li class="flex flex-col gap-0.5 py-1.5">
										<div class="flex items-center gap-2">
											<p class="min-w-0 flex-1 truncate font-mono text-xs" title={utxo.outpoint}>
												{shortOutpoint(utxo.outpoint)}
											</p>
											<span
												class="badge badge-sm shrink-0"
												class:badge-success={utxo.kind === 'free'}
												class:badge-info={utxo.kind === 'colored'}
												class:badge-warning={utxo.kind === 'locked'}
												class:badge-ghost={utxo.kind === 'vanilla'}
											>
												{utxoKindLabel(utxo.kind)}
											</span>
										</div>
										<p class="text-base-content/70 text-xs tabular-nums">
											{formatNumber(utxo.sats)}
											{translate('wallet.sats', 'sats')}
											·
											{$t('wallet.utxo_allocations', { values: { count: utxo.allocations } })}
										</p>
									</li>
								{/each}
							</ul>
						{/if}
					{/if}
				</div>
			</section>
		{/if}
	</div>

	{#if blindReceives.length > 0}
		<div class="alert alert-outline flex flex-col items-start gap-2" data-testid="receive-waiting">
			{#each blindReceives as row (`${row.seal}-${row.status}-${row.batch ?? ''}`)}
				<div class="flex w-full flex-col gap-1">
					{#if row.invoice}
						<p class="font-mono text-xs break-all">{row.invoice}</p>
					{/if}
					<p class="text-xs">{row.status}</p>
					{#if row.expiry}
						<p class="text-xs">
							{translate('wallet.invoice_expires', 'Expires')}
							{new Date(row.expiry * 1000).toLocaleString($locale || 'en')}
						</p>
					{/if}
					<p class="font-mono text-xs break-all">
						{row.txid ?? translate('wallet.receive_waiting', 'Waiting for txid')}
					</p>
					{#if !row.txid}
						<div class="flex gap-2">
							<button
								type="button"
								class="btn btn-outline btn-xs"
								onclick={() => copyInvoice(row.invoice)}
							>
								{translate('wallet.taproot.copy_invoice', 'Copy invoice')}
							</button>
							{#if confirmDrop}
								<p class="text-xs">
									{translate(
										'wallet.taproot.cancel_invoice_confirm',
										'Cancel this receive code? The dollars it is holding will be free to send.'
									)}
								</p>
								<div class="flex gap-2">
									<button
										type="button"
										class="btn btn-ghost btn-xs"
										onclick={() => (confirmDrop = false)}
										disabled={droppingInvoice}
									>
										{translate('wallet.taproot.cancel_invoice_keep', 'Keep it')}
									</button>
									<button
										type="button"
										class="btn btn-error btn-xs"
										onclick={dropInvoice}
										disabled={droppingInvoice}
										data-testid="cancel-invoice-confirm"
									>
										{#if droppingInvoice}
											<span class="loading loading-spinner loading-xs"></span>
										{/if}
										{cancelStatus || translate('wallet.taproot.cancel_invoice', 'Cancel invoice')}
									</button>
								</div>
							{:else}
								<button
									type="button"
									class="btn btn-ghost btn-xs"
									onclick={dropInvoice}
									data-testid="cancel-invoice"
								>
									{translate('wallet.taproot.cancel_invoice', 'Cancel invoice')}
								</button>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	{#if advanced}
		<div class="grid w-full min-w-0 shrink-0 grid-cols-2 gap-2 pt-1">
			<button
				class="btn btn-primary glow-soft min-h-12 w-full min-w-0 gap-2 whitespace-normal"
				type="button"
				data-testid="wallet-send"
				disabled={$walletSession.blocked || $walletSession.refreshing}
				onclick={openSend}
			>
				<svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
					<path
						fill-rule="evenodd"
						d="M14.78 10.78a.75.75 0 01-1.06 0L10.75 7.81v8.44a.75.75 0 01-1.5 0V7.81L6.28 10.78a.75.75 0 11-1.06-1.06l4.25-4.25a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06z"
						clip-rule="evenodd"
					/>
				</svg>
				{translate('wallet.tab_send', 'Send')}
			</button>
			<button
				class="btn btn-neutral min-h-12 w-full min-w-0 gap-2 whitespace-normal"
				type="button"
				data-testid="wallet-receive"
				disabled={receiveClosed()}
				onclick={() => (isReceiveOpen = true)}
			>
				<svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
					<path
						fill-rule="evenodd"
						d="M5.22 9.22a.75.75 0 011.06 0L9.25 12.19V3.75a.75.75 0 011.5 0v8.44l2.97-2.97a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 10.28a.75.75 0 010-1.06z"
						clip-rule="evenodd"
					/>
				</svg>
				{translate('wallet.tab_receive', 'Receive')}
			</button>
		</div>
		{#if receiveClosed() && !$walletSession.blocked}
			<p class="text-sm" role="status" data-testid="receive-needs-wallet">
				{translate('wallet.unlock_to_receive', 'Unlock wallet to receive')}
			</p>
		{/if}
	{/if}
	{#if advanced}
		<a
			class="btn btn-ghost min-h-12 w-full"
			href={resolve('/wallet/transactions')}
			data-testid="wallet-transactions"
		>
			{$t('wallet.transactions.button')}
		</a>
	{/if}
	<WalletPaymentModal isOpen={isSendOpen} onClose={closeSend} sheet={!advanced}>
		<SendPaymentForm
			initialAsset={usdtAsset && usdtAsset.balance > 0 ? 'usdt_rgb' : 'btc_onchain'}
			initialDestination={scannedPay}
			onSent={handleSent}
			onCancel={closeSend}
		/>
	</WalletPaymentModal>
	<WalletPaymentModal isOpen={isReceiveOpen} onClose={handleReceiveClose} sheet={!advanced}>
		<ReceivePaymentForm
			onClose={handleReceiveClose}
			lightningReady={!$walletStore.locked && lightningUx.status === 'ready'}
			lightningUsdtReady={!$walletStore.locked && lightningUx.status === 'ready'}
		/>
	</WalletPaymentModal>
	<WalletPaymentModal
		isOpen={isTransferOpen}
		onClose={() => (isTransferOpen = false)}
		sheet={!advanced}
	>
		<TransferSheet
			balanceSats={bitcoinSats}
			balanceUsd={dollarBalance}
			btcUsd={btcPrice.price}
			onClose={() => (isTransferOpen = false)}
		/>
	</WalletPaymentModal>
	{#if scanningPay}
		<dialog
			class="modal modal-open"
			data-testid="wallet-scanner"
			aria-labelledby="wallet-scanner-title"
			tabindex={-1}
			onkeydown={(event: KeyboardEvent) => {
				if (event.key === 'Escape') closeScanner();
			}}
		>
			<div class="modal-box max-w-sm">
				<div class="mb-3 flex items-center justify-between gap-2">
					<h3 id="wallet-scanner-title" class="text-lg font-bold">
						{$t('common.components.qr_scanner.scan_qr_code')}
					</h3>
					<button
						type="button"
						class="btn btn-circle btn-ghost min-h-12 min-w-12"
						data-testid="wallet-scanner-close"
						aria-label={$t('common.components.qr_scanner.close')}
						onclick={closeScanner}
					>
						✕
					</button>
				</div>
				{#if QrScanner}
					<QrScanner mode="inline" sources onScan={acceptScan} onClose={closeScanner} />
				{:else}
					<p role="status">{translate('wallet.loading', 'Loading wallet')}</p>
				{/if}
			</div>
			<button
				type="button"
				class="modal-backdrop"
				aria-label={$t('common.components.qr_scanner.close')}
				onclick={closeScanner}
			></button>
		</dialog>
	{/if}
	{#if confirmRepair}
		<dialog
			class="modal modal-open"
			data-testid="repair-confirm"
			onclick={() => (confirmRepair = false)}
			onkeydown={(event: KeyboardEvent) => {
				if (event.key === 'Escape') confirmRepair = false;
			}}
		>
			<div
				class="modal-box max-w-sm"
				role="alertdialog"
				aria-modal="true"
				aria-labelledby="repair-confirm-title"
				tabindex={-1}
				onclick={(event: Event) => event.stopPropagation()}
				onkeydown={(event: KeyboardEvent) => event.stopPropagation()}
			>
				<h3 id="repair-confirm-title" class="text-lg font-bold">
					{translate('wallet.repair_confirm_title', 'Repair wallet?')}
				</h3>
				<p class="mt-2 text-sm">
					{translate(
						'wallet.repair_confirm_body',
						'This checks the wallet and looks for incoming dollars. It does not send money, and it cannot recover dollars stuck on a spent coin.'
					)}
				</p>
				<div class="modal-action">
					<button
						type="button"
						class="btn min-h-12"
						data-testid="repair-cancel"
						onclick={() => (confirmRepair = false)}
					>
						{$t('common.cancel')}
					</button>
					<button
						type="button"
						class="btn btn-primary min-h-12"
						data-testid="repair-confirm-go"
						onclick={() => {
							confirmRepair = false;
							repairWallet().catch((error: unknown) => {
								console.error('[wallet-page] repair failed', error);
							});
						}}
					>
						{translate('wallet.repair_confirm_go', 'Repair')}
					</button>
				</div>
			</div>
		</dialog>
	{/if}
</PullToRefresh>
