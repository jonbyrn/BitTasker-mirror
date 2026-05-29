<!-- eslint-disable-next-line svelte/no-at-html-tags -->
<script lang="ts">
	import { t } from 'svelte-i18n';
	import {
		connectedWalletsStore,
		hasConnectedWallets,
		registerConnectedWallet,
		unregisterConnectedWallet,
		replaceConnectedWallet,
		setConnectingType,
		setConnectedWalletError,
		restoreConnectedWalletState
	} from '$lib/stores/connected-wallets.store';
	import { connectorRegistry } from '$lib/services/external-wallet/connector-registry';
	import {
		isMetaMaskAvailable,
		isTrezorAvailable,
		getLedgerTransport,
		getPlatformInfo
	} from '$lib/services/external-wallet/platform-checks';
	import { FeatureFlagService, FEATURE_FLAGS } from '$lib/services/kill-switch';
	import { onMount, onDestroy } from 'svelte';
	import IconClose from '~icons/mdi/close';
	import IconContentCopy from '~icons/mdi/content-copy';
	import WalletConnectQRModal from './WalletConnectQRModal.svelte';
	import HelpModal from './HelpModal.svelte';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import { appStore } from '$lib/stores/app.store';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	let copiedAddress = $state<string | null>(null);
	let showLedgerConnect = $state(false);
	let ledgerConnectError = $state('');
	let showLedgerBtcStep = $state(false);
	let showLedgerBtcSuccess = $state(false);
	let ledgerBtcError = $state('');
	let ledgerBtcConnecting = $state(false);

	// Which Ledger wallet IDs have Bitcoin connected (checked via connector registry)
	let btcConnectedWallets = $derived.by(() => {
		return $connectedWalletsStore.wallets
			.filter((w) => {
				const handle = connectorRegistry.get(w.id);
				return handle && 'bitcoinSigner' in handle;
			})
			.map((w) => w.id);
	});

	// BTC address for each wallet (empty string if not connected)
	let btcAddressFor = $derived.by(() => {
		const map: Record<string, string> = {};
		for (const w of $connectedWalletsStore.wallets) {
			const handle = connectorRegistry.get(w.id);
			if (handle && 'bitcoinSigner' in handle) {
				const signer = (handle as Record<string, unknown>).bitcoinSigner as {
					address?: string;
				};
				map[w.id] = signer?.address ?? '';
			}
		}
		return map;
	});

	// Callback props for parent page to open modals
	let {
		onSend: _onSend,
		onReceive: _onReceive,
		balancesHidden = false
	}: { onSend?: () => void; onReceive?: () => void; balancesHidden?: boolean } = $props();

	const satsFormatter = new Intl.NumberFormat('en-US');
	const usdFormatter = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD'
	});

	function formatSatsWithUsd(rawSats: string | number | undefined | null): string {
		const sats = Number(rawSats ?? 0);
		if (sats <= 0) return '0 Sats';
		const satsStr = satsFormatter.format(sats);
		const btc = sats / 100_000_000;
		const usd = btc * btcPrice.price;
		const usdStr = usdFormatter.format(usd);
		return `${satsStr} Sats (${usdStr})`;
	}

	// Per-wallet last-known balances — module-level to survive tab switches
	let lastKnownWalletBalances: Record<
		string,
		{ rbtc: string; btc: string; usdt: string; wbtc: string }
	> = {};

	// Effect: cache current per-wallet balances for fallback during refresh gaps
	$effect(() => {
		let next: Record<string, { rbtc: string; btc: string; usdt: string; wbtc: string }> = {};
		for (const w of $connectedWalletsStore.wallets) {
			const cur = w.balances;
			if (!cur) continue;
			const rbtcRaw = cur.rbtc?.raw ?? '';
			const btcRaw = cur.btc?.raw ?? '';
			const usdtRaw = cur.usdt?.raw ?? '';
			const wbtcRaw = cur.wbtc?.raw ?? '';
			const sats = Number(rbtcRaw) + Number(btcRaw);
			const usdt = Number(usdtRaw);
			const wbtc = Number(wbtcRaw);
			if (sats > 0 || usdt > 0 || wbtc > 0) {
				next[w.id] = { rbtc: rbtcRaw, btc: btcRaw, usdt: usdtRaw, wbtc: wbtcRaw };
			}
		}
		lastKnownWalletBalances = next;
	});

	/** Stable inner balance format — falls back to cached per-asset raw when live is zero */
	function stableInnerFormat(
		wallet: {
			id: string;
			balances: Record<string, { raw: string; formatted: string; loading: boolean }> | undefined;
		},
		key: string
	): string {
		const bal = wallet.balances?.[key];
		const raw = Number(bal?.raw ?? 0);
		if (raw > 0) {
			if (key === 'usdt') return `$${(raw / 1e18).toFixed(2)}`;
			if (key === 'wbtc') {
				const formatted = bal?.formatted;
				return formatted && formatted !== '0'
					? `${parseFloat(formatted).toFixed(6)} WBTC`
					: '0 WBTC';
			}
			return formatSatsWithUsd(raw);
		}
		const cached = lastKnownWalletBalances[wallet.id];
		if (cached) {
			const cachedRaw = Number((cached as Record<string, string>)[key] ?? 0);
			if (cachedRaw > 0) {
				if (key === 'usdt') return `$${(cachedRaw / 1e18).toFixed(2)}`;
				if (key === 'wbtc') {
					const cachedFormatted = (cached as Record<string, string>)[`${key}Fmt`];
					return cachedFormatted && cachedFormatted !== '0'
						? `${parseFloat(cachedFormatted).toFixed(6)} WBTC`
						: '0 WBTC';
				}
				return formatSatsWithUsd(cachedRaw);
			}
		}
		if (key === 'usdt') return '$0.00';
		if (key === 'wbtc') return '0 WBTC';
		return '0 Sats';
	}

	/** Pure: stable display value for a wallet's accordion title */
	function stableWalletAvailableUsd(wallet: {
		id: string;
		balances: Record<string, { raw: string; formatted: string; loading: boolean }> | undefined;
	}): string {
		const cur = wallet.balances;
		if (cur) {
			const btcSats =
				Number(cur.btc?.raw ?? 0) + Number(cur.rbtc?.raw ?? 0) + Number(cur.wbtc?.raw ?? 0);
			const usdtRaw = Number(cur.usdt?.raw ?? 0);
			if (btcSats > 0 || usdtRaw > 0) {
				return usdFormatter.format((btcSats / 100_000_000) * btcPrice.price + usdtRaw / 1e18);
			}
		}
		const cached = lastKnownWalletBalances[wallet.id];
		if (cached) {
			const usd =
				((Number(cached.rbtc) + Number(cached.btc) + Number(cached.wbtc)) / 100_000_000) *
					btcPrice.price +
				Number(cached.usdt) / 1e18;
			if (usd > 0) return usdFormatter.format(usd);
		}
		return usdFormatter.format(0);
	}

	async function _handleRefreshBalances() {
		// Fetch all wallet balances in parallel, then batch-update once
		// to avoid intermediate zero-flashes in the aggregate total
		const wallets = $connectedWalletsStore.wallets;
		if (wallets.length === 0) return;

		const results = await Promise.allSettled(
			wallets.map(async (w) => {
				const handle = connectorRegistry.get(w.id);
				if (!handle) return null;
				const fetcher = (
					handle as {
						fetchBalances?: () => Promise<
							Record<string, { raw: string; formatted: string; loading: boolean }>
						>;
					}
				).fetchBalances;
				if (!fetcher) return null;
				const balances = await fetcher();
				return { id: w.id, balances };
			})
		);

		// Import once, apply only when balances actually changed
		const { updateConnectedBalances } = await import('$lib/stores/connected-wallets.store');
		for (const r of results) {
			if (r.status === 'fulfilled' && r.value) {
				const { id, balances } = r.value;
				// Only update if the new balances differ from existing (prevents layout shift)
				const existing = wallets.find((w) => w.id === id)?.balances ?? {};
				const hasChanged = Object.keys(balances).some(
					(k) => (balances[k]?.raw ?? '') !== (existing[k]?.raw ?? '')
				);
				if (hasChanged) {
					updateConnectedBalances(id, balances);
				}
			}
		}
		appStore.showSuccessToast($t('wallet.connected.balances_refreshed'));
	}

	// With Multichain SDK, MetaMask connects to ALL configured chains simultaneously.
	// Balances queried from all scopes — no manual switching needed.

	async function copyAddress(addr: string): Promise<void> {
		const ok = await copyToClipboard(addr);
		if (!ok) {
			appStore.showErrorToast($t('wallet.connected.copy_failed'));
			return;
		}
		copiedAddress = addr;
		appStore.showSuccessToast($t('wallet.connected.address_copied'));
		setTimeout(() => {
			copiedAddress = null;
		}, 2000);
	}

	function walletLogo(type: string): string {
		switch (type) {
			case 'metamask':
				return '/images/wallets/metamask.svg';
			case 'walletconnect':
				return '/images/wallets/walletconnect.svg';
			case 'trezor':
				return '/images/wallets/trezor.svg';
			case 'ledger':
				return '/images/wallets/ledger.svg';
			default:
				return '';
		}
	}

	let showConnectModal = $state(false);
	let showDisconnectId = $state<string | null>(null);
	let showWCModal = $state(false);
	let wcQRUri = $state<string | null>(null);
	let expandedWalletId = $state<string | null>(null);
	let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

	onDestroy(() => {
		clearTimeout(reconnectTimer);
	});

	// Do NOT disconnect SDK sessions on component unmount — SvelteKit
	// client-side navigation destroys and recreates components, and
	// calling unsubscribe() here would revoke the MetaMask session on
	// every page transition. The explicit Disconnect button handles
	// intentional teardown. Browser page close/refresh terminates the
	// JS runtime, so no explicit cleanup is needed.

	onMount(async () => {
		console.log('[ConnectedWallets] Component mounted, restoring...');
		try {
			await restoreConnectedWalletState();
			console.log(
				'[ConnectedWallets] Restore complete, wallets:',
				$connectedWalletsStore.wallets.length
			);

			// Auto-reconnect persisted MetaMask wallets.
			// The SDK's connect() will reuse an existing extension session if
			// available, or prompt MetaMask to re-approve if the session expired.
			// A short delay ensures the page / extension bridge is fully ready.
			const mmWallets = $connectedWalletsStore.wallets.filter((w) => w.walletType === 'metamask');
			if (mmWallets.length > 0) {
				console.log(
					'[ConnectedWallets] Auto-reconnecting',
					mmWallets.length,
					'MetaMask wallet(s)...'
				);
				// Debounce: only attempt reconnect once per page load.
				let reconnectInFlight = false;
				reconnectTimer = setTimeout(async () => {
					if (reconnectInFlight) return;
					reconnectInFlight = true;
					for (const w of mmWallets) {
						try {
							const { connectMetaMask } = await import(
								'$lib/services/external-wallet/metamask-connector'
							);
							const handle = await connectMetaMask({
								registry: connectorRegistry,
								onEvent: () => {},
								knownAddress: w.address,
								knownChainIds: w.chainIds,
								longTimeout: true
							});
							// Replace the restored entry without disconnecting the SDK
							replaceConnectedWallet(handle);
							console.log('[ConnectedWallets] Auto-reconnected MetaMask:', handle.address);
						} catch (e) {
							console.log(
								'[ConnectedWallets] Auto-reconnect unavailable:',
								(e as Error).message ?? e
							);
						}
					}
				}, 500);
			}
		} catch (e) {
			console.error('[ConnectedWallets] Restore failed:', e);
		}
	});

	function openConnectModal(): void {
		showConnectModal = true;
	}

	function closeConnectModal(): void {
		showConnectModal = false;
		showLedgerConnect = false;
		showLedgerBtcStep = false;
		showLedgerBtcSuccess = false;
		ledgerBtcError = '';
		ledgerBtcConnecting = false;
		connectedWalletsStore.update((s) => ({ ...s, error: null, connectingType: null }));
	}

	async function handleConnectMetaMask(): Promise<void> {
		console.log('[ConnectedWallets] handleConnectMetaMask CALLED');
		if (!FeatureFlagService.isEnabled(FEATURE_FLAGS.CONNECTED_METAMASK)) {
			console.log('[ConnectedWallets] MetaMask feature flag is DISABLED');
			return;
		}
		if (!isMetaMaskAvailable()) {
			console.log('[ConnectedWallets] MetaMask not detected');
			setConnectedWalletError($t('wallet.connected.error_metamask_detection'));
			return;
		}
		setConnectingType('metamask');
		closeConnectModal();

		try {
			console.log('[ConnectedWallets] Importing metamask-connector...');
			const mod = await import('$lib/services/external-wallet/metamask-connector');
			console.log('[ConnectedWallets] Import successful, keys:', Object.keys(mod));
			let capturedWalletId: string | undefined;
			const handle = await mod.connectMetaMask({
				registry: connectorRegistry,
				onEvent: (event) => {
					if (event.type === 'disconnect' && capturedWalletId) {
						unregisterConnectedWallet(capturedWalletId);
					}
				}
			});
			capturedWalletId = handle.id;
			registerConnectedWallet(handle);
		} catch (error) {
			console.error('[ConnectedWallets] connectMetaMask FAILED:', error);
			const message =
				error instanceof Error ? error.message : $t('wallet.connected.error_metamask_connect');
			setConnectedWalletError(message);
		}
	}

	async function handleConnectWC(): Promise<void> {
		if (!FeatureFlagService.isEnabled(FEATURE_FLAGS.CONNECTED_WALLETCONNECT)) return;
		setConnectingType('walletconnect');
		closeConnectModal();
		showWCModal = true;

		try {
			const { connectWC } = await import('$lib/services/external-wallet/walletconnect-connector');
			const handle = await connectWC({}, (uri: string) => {
				wcQRUri = uri;
			});
			registerConnectedWallet(handle);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : $t('wallet.connected.error_walletconnect');
			setConnectedWalletError(message);
		} finally {
			showWCModal = false;
			wcQRUri = null;
		}
	}

	function handleWCCancel(): void {
		showWCModal = false;
		wcQRUri = null;
		setConnectedWalletError('');
	}

	async function handleConnectTrezor(): Promise<void> {
		if (!FeatureFlagService.isEnabled(FEATURE_FLAGS.CONNECTED_TREZOR)) return;
		const info = getPlatformInfo(window.navigator);
		if (!isTrezorAvailable(info)) {
			setConnectedWalletError($t('wallet.connected.error_trezor_platform'));
			return;
		}
		setConnectingType('trezor');
		closeConnectModal();

		try {
			const { connectTrezor } = await import('$lib/services/external-wallet/trezor-connector');
			const handle = await connectTrezor({
				registry: connectorRegistry,
				navigator: window.navigator
			});
			registerConnectedWallet(handle);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : $t('wallet.connected.error_trezor_connect');
			setConnectedWalletError(message);
		}
	}

	async function handleConnectLedger(): Promise<void> {
		if (!FeatureFlagService.isEnabled(FEATURE_FLAGS.CONNECTED_LEDGER)) return;
		const info = getPlatformInfo(window.navigator);
		const transport = getLedgerTransport(info);
		if (transport === 'unavailable') {
			setConnectedWalletError($t('wallet.connected.error_ledger_platform'));
			return;
		}

		// Step 1: EVM — keep the modal open with a prompt screen
		showLedgerConnect = true;
		showConnectModal = true;
		ledgerConnectError = '';
		showLedgerBtcStep = false;
		ledgerBtcError = '';
		setConnectingType('ledger');

		let handle: import('$lib/services/external-wallet/types').ConnectorHandle;
		try {
			const { connectLedger } = await import('$lib/services/external-wallet/ledger-connector');
			handle = await connectLedger({
				registry: connectorRegistry,
				navigator: window.navigator
			});
		} catch (error) {
			const msg =
				error instanceof Error ? error.message : $t('wallet.connected.error_ledger_connect');

			if (
				msg.toLowerCase().includes('ethereum') ||
				msg.toLowerCase().includes('open the') ||
				msg.toLowerCase().includes('ledger device')
			) {
				ledgerConnectError = msg;
			} else {
				showLedgerConnect = false;
				showConnectModal = false;
				setConnectedWalletError(msg);
			}
			return;
		}

		// Step 2: Register EVM, then ask if user wants to add Bitcoin
		registerConnectedWallet(handle);
		showLedgerConnect = true; // keep modal for BTC step
		ledgerConnectError = '';
		showLedgerBtcStep = true;
		ledgerBtcError = '';
	}

	async function handleAddLedgerBitcoin(): Promise<void> {
		const info = getPlatformInfo(window.navigator);
		const transport = getLedgerTransport(info);
		if (transport === 'unavailable') {
			ledgerBtcError = $t('wallet.connected.error_ledger_platform');
			return;
		}

		ledgerBtcError = '';
		ledgerBtcConnecting = true;
		try {
			const { addBitcoinToLedger } = await import('$lib/services/external-wallet/ledger-connector');
			const result = await addBitcoinToLedger({
				registry: connectorRegistry,
				navigator: window.navigator
			});

			// Find the existing Ledger handle in the registry and add bitcoinSigner.
			// Search by walletType since EVM and BTC addresses may differ.
			const ledgerWallet = $connectedWalletsStore.wallets.find((w) => w.walletType === 'ledger');
			if (ledgerWallet) {
				const currentHandle = connectorRegistry.get(ledgerWallet.id);
				if (currentHandle) {
					const updatedHandle = {
						...currentHandle,
						bitcoinSigner: result.bitcoinSigner
					} as import('$lib/services/external-wallet/types').ConnectorHandle & {
						bitcoinSigner: import('$lib/services/external-wallet/types').BitcoinSigner;
					};
					replaceConnectedWallet(updatedHandle);
				}
			}

			// Show success briefly before closing
			ledgerBtcConnecting = false;
			showLedgerBtcStep = false;
			showLedgerBtcSuccess = true;
			await new Promise((resolve) => setTimeout(resolve, 1500));
			showLedgerBtcSuccess = false;
			showLedgerConnect = false;
			showConnectModal = false;
		} catch (error) {
			const msg =
				error instanceof Error ? error.message : $t('wallet.connected.error_ledger_connect');

			if (
				msg.toLowerCase().includes('bitcoin') ||
				msg.toLowerCase().includes('open the') ||
				msg.toLowerCase().includes('ledger device')
			) {
				ledgerBtcConnecting = false;
				ledgerBtcError = msg;
			} else {
				ledgerBtcConnecting = false;
				showLedgerBtcStep = false;
				showLedgerConnect = false;
				showConnectModal = false;
				setConnectedWalletError(msg);
			}
		}
	}

	function confirmDisconnect(walletId: string): void {
		showDisconnectId = walletId;
	}

	function handleDisconnect(): void {
		if (showDisconnectId) {
			unregisterConnectedWallet(showDisconnectId);
			showDisconnectId = null;
		}
	}

	function cancelDisconnect(): void {
		showDisconnectId = null;
	}
</script>

{#if FeatureFlagService.isEnabled(FEATURE_FLAGS.CONNECTED_WALLETS)}
	<div class="space-y-2">
		{#if $connectedWalletsStore.connectingType}
			<div class="alert alert-outline alert-info py-2 text-sm">
				<span class="loading loading-spinner loading-xs"></span>
				<span
					>{$t('wallet.connected.connecting', {
						values: { type: $connectedWalletsStore.connectingType }
					})}</span
				>
			</div>
		{/if}

		{#if $connectedWalletsStore.error}
			<div class="alert alert-outline alert-error py-2 text-sm">
				<span>{$connectedWalletsStore.error}</span>
				<button
					class="btn btn-ghost btn-xs"
					onclick={() => connectedWalletsStore.update((s) => ({ ...s, error: null }))}
				>
					<IconClose class="h-4 w-4" />
				</button>
			</div>
		{/if}

		<!-- Individual Wallet Cards -->
		{#if $hasConnectedWallets}
			{#each $connectedWalletsStore.wallets as wallet (wallet.id)}
				{@const logo = walletLogo(wallet.walletType)}
				{@const isExpanded = expandedWalletId === wallet.id}
				<div
					class="collapse-arrow border-primary bg-base-100 collapse rounded-lg border-2"
					class:collapse-open={isExpanded}
				>
					<button
						type="button"
						class="collapse-title flex min-h-0 items-center gap-2 px-3 py-2 pr-10 text-base font-medium"
						onclick={() => (expandedWalletId = isExpanded ? null : wallet.id)}
						aria-expanded={isExpanded}
					>
						{#if logo}
							<img src={logo} alt={wallet.walletName} class="h-6 w-6 shrink-0" />
						{/if}
						<span>{wallet.walletName}</span>
						<span class="text-base-content/50 ml-auto truncate pr-2 text-sm font-normal">
							{balancesHidden ? '••••' : stableWalletAvailableUsd(wallet)}
							{$t('wallet.connected.available_label')}
						</span>
					</button>
					<div class="collapse-content px-2">
						<div class="border-base-300 space-y-2 border-t pt-2">
							<!-- Balances: by wallet type + available chains -->
							{#if true}
								{@const hideBal = balancesHidden}
								{@const isHardwareWallet =
									wallet.walletType === 'trezor' || wallet.walletType === 'ledger'}
								{@const isEVM =
									wallet.walletType === 'metamask' ||
									wallet.walletType === 'walletconnect' ||
									isHardwareWallet}
								{@const balanceRows = [
									{
										key: 'btc',
										label: $t('wallet.connected.balance_bitcoin'),
										img: '/images/chains/Bitcoin.svg',
										alt: 'BTC',
										condition: isHardwareWallet,
										format: (v: unknown) => formatSatsWithUsd((v as { raw?: string | number })?.raw)
									},
									{
										key: 'rbtc',
										label: $t('wallet.connected.balance_rbtc'),
										img: '/images/chains/Bitcoin-Rootstock-logo.webp',
										alt: 'rBTC',
										condition: isEVM,
										format: (v: unknown) => formatSatsWithUsd((v as { raw?: string | number })?.raw)
									},
									{
										key: 'usdt',
										label: $t('wallet.connected.balance_usdt'),
										img: '/images/chains/Binance-logo.svg',
										alt: 'USDT',
										condition: isEVM,
										format: (v: unknown) => (v as { formatted?: string })?.formatted ?? '$0.00'
									},
									{
										key: 'wbtc',
										label: 'WBTC (Arbitrum)',
										img: '/images/chains/arbitrum.png',
										alt: 'WBTC',
										condition: isEVM,
										format: (v: unknown) => {
											const bal = v as { formatted?: string; raw?: string };
											return bal.formatted && bal.formatted !== '0'
												? `${parseFloat(bal.formatted).toFixed(6)} WBTC`
												: '0 WBTC';
										}
									}
								]}
								<div class="space-y-1">
									{#each balanceRows.filter((r) => r.condition) as row (row.key)}
										<div class="flex items-center justify-between text-sm">
											<span class="flex items-center gap-1.5">
												<img src={row.img} alt={row.alt} class="h-4 w-4" />
												{row.label}
											</span>
											<span class="font-semibold"
												>{hideBal ? '••••' : stableInnerFormat(wallet, row.key)}</span
											>
										</div>
									{/each}
								</div>
							{/if}

							<div class="divider my-0"></div>

							<!-- EVM address row with chain indicator -->
							<button
								type="button"
								class="hover:bg-base-200 flex w-full items-center gap-2 rounded p-1.5 text-xs transition-colors"
								onclick={() => copyAddress(wallet.address)}
								title={$t('wallet.connected.copy_address_title')}
							>
								<div class="text-base-content/40 flex items-center gap-1">
									<img
										src="/images/chains/Bitcoin-Rootstock-logo.webp"
										alt="RSK"
										class="h-3.5 w-3.5"
									/>
									<span>{$t('wallet.connected.address_rbtc_usdt')}</span>
								</div>
								<span class="ml-auto truncate font-mono opacity-60">{wallet.address}</span>
								<IconContentCopy
									class="h-4 w-4 shrink-0 {copiedAddress === wallet.address
										? 'text-success'
										: 'opacity-40'}"
								/>
							</button>

							<!-- BTC address (only shown when Bitcoin is connected) -->
							{#if btcConnectedWallets.includes(wallet.id)}
								{@const btcAddr = btcAddressFor[wallet.id] ?? ''}
								{#if btcAddr}
									<button
										type="button"
										class="hover:bg-base-200 flex w-full items-center justify-end gap-2 rounded p-1.5 text-xs transition-colors"
										onclick={() => copyAddress(btcAddr)}
										title={$t('wallet.connected.copy_address_title')}
									>
										<img src="/images/chains/Bitcoin.svg" alt="BTC" class="h-3.5 w-3.5 shrink-0" />
										<span class="truncate text-right font-mono opacity-60">{btcAddr}</span>
										<IconContentCopy
											class="h-4 w-4 shrink-0 {copiedAddress === btcAddr
												? 'text-success'
												: 'opacity-40'}"
										/>
									</button>
								{/if}
							{/if}

							<!-- Connect Bitcoin / Disconnect buttons -->
							<div class="flex flex-wrap items-center justify-end gap-2">
								{#if wallet.walletType === 'ledger'}
									{#if btcConnectedWallets.includes(wallet.id)}
										<button class="btn btn-outline btn-sm min-h-[44px]" disabled>
											<img src="/images/chains/Bitcoin.svg" alt="BTC" class="h-4 w-4" />
											<svg
												class="text-success h-4 w-4"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
												><path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M5 13l4 4L19 7"
												/></svg
											>
											{$t('wallet.connected.connected_label')}
										</button>
									{:else}
										<button
											class="btn btn-outline btn-sm min-h-[44px]"
											onclick={() => {
												showLedgerConnect = true;
												showConnectModal = true;
												showLedgerBtcStep = true;
												ledgerBtcError = '';
											}}
										>
											<img src="/images/chains/Bitcoin.svg" alt="BTC" class="h-4 w-4" />
											{$t('wallet.connected.connect_bitcoin')}
										</button>
									{/if}
								{/if}
								<button
									class="btn btn-ghost btn-sm text-error min-h-[44px]"
									onclick={() => confirmDisconnect(wallet.id)}
								>
									<IconClose class="mr-1 h-4 w-4" />
									{$t('wallet.connected.disconnect')}
								</button>
							</div>
						</div>
					</div>
				</div>
			{/each}
		{/if}

		<button
			class="btn btn-primary btn-block tap-highlight-none hidden min-h-[44px] touch-manipulation transition-transform duration-100 select-none active:scale-95"
			data-connect-button
			onclick={openConnectModal}
		>
			{'+ ' + $t('wallet.connected.connect')}
		</button>

		<!-- Help Modal (uses default showButton=true — the [data-help-modal] element is in the DOM for the help icon to trigger) -->
		<HelpModal />

		<!-- Connect Modal -->
		{#if showConnectModal}
			<dialog
				class="modal modal-open"
				onclick={closeConnectModal}
				onkeydown={(e: KeyboardEvent) => {
					if (e.key === 'Escape') closeConnectModal();
				}}
			>
				<div
					class="modal-box max-w-sm"
					onclick={(e: Event) => e.stopPropagation()}
					role="dialog"
					aria-modal="true"
				>
					{#if showLedgerBtcSuccess}
						<!-- Ledger Step 3: Success -->
						<div class="flex flex-col items-center gap-4 py-4 text-center">
							<div class="bg-success/10 rounded-full p-4">
								<svg
									class="text-success h-10 w-10"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
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
								<button class="btn btn-primary btn-sm min-h-[44px]" onclick={handleConnectLedger}>
									{$t('wallet.connected.ledger.try_again')}
								</button>
							{:else}
								<p class="text-base-content/70 text-sm leading-relaxed">
									<!-- eslint-disable-next-line svelte/no-at-html-tags -->
									{@html $t('wallet.connected.ledger.step1_instructions')}
								</p>
								<div class="flex items-center gap-2">
									<span class="loading loading-spinner loading-sm text-info"></span>
									<span class="text-base-content/50 text-xs"
										>{$t('wallet.connected.ledger.waiting')}</span
									>
								</div>
							{/if}
							<button
								class="btn btn-ghost btn-sm mt-2"
								onclick={() => {
									showLedgerConnect = false;
									closeConnectModal();
								}}
							>
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
									onclick={handleAddLedgerBitcoin}
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
									onclick={() => {
										showLedgerBtcStep = false;
										showLedgerConnect = false;
										closeConnectModal();
									}}
								>
									{$t('wallet.connected.ledger.skip_evm')}
								</button>
							</div>
						</div>
					{:else}
						<h3 class="mb-3 text-lg font-bold">{$t('wallet.connected.connect_modal_title')}</h3>

						<div class="space-y-2">
							{#if FeatureFlagService.isEnabled(FEATURE_FLAGS.CONNECTED_METAMASK)}
								<button
									class="hover:bg-base-200 flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors"
									onclick={handleConnectMetaMask}
								>
									<img src="/images/wallets/metamask.svg" alt="MetaMask" class="h-8 w-8" />
									<div>
										<div class="font-medium">MetaMask</div>
										<div class="text-xs opacity-60">{$t('wallet.connected.metamask_desc')}</div>
									</div>
								</button>
							{/if}

							{#if FeatureFlagService.isEnabled(FEATURE_FLAGS.CONNECTED_WALLETCONNECT)}
								<button
									class="hover:bg-base-200 flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors"
									onclick={handleConnectWC}
								>
									<img
										src="/images/wallets/walletconnect.svg"
										alt="WalletConnect"
										class="h-8 w-8"
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
									class="hover:bg-base-200 flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors"
									onclick={handleConnectTrezor}
								>
									<img src="/images/wallets/trezor.svg" alt="Trezor" class="h-8 w-8" />
									<div>
										<div class="font-medium">Trezor</div>
										<div class="text-xs opacity-60">{$t('wallet.connected.hardware_wallet')}</div>
									</div>
								</button>
							{/if}

							{#if FeatureFlagService.isEnabled(FEATURE_FLAGS.CONNECTED_LEDGER)}
								<button
									class="hover:bg-base-200 flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors"
									onclick={handleConnectLedger}
								>
									<img src="/images/wallets/ledger.svg" alt="Ledger" class="h-8 w-8" />
									<div>
										<div class="font-medium">Ledger</div>
										<div class="text-xs opacity-60">{$t('wallet.connected.hardware_wallet')}</div>
									</div>
								</button>
							{/if}
						</div>

						<div class="mt-4">
							<button class="btn btn-ghost btn-sm w-full" onclick={closeConnectModal}
								>{$t('common.cancel')}</button
							>
						</div>
					{/if}
				</div>
				<form method="dialog" class="modal-backdrop">
					<button>{$t('wallet.connected.close')}</button>
				</form>
			</dialog>
		{/if}

		<!-- WalletConnect QR Modal -->
		<WalletConnectQRModal isOpen={showWCModal} qrUri={wcQRUri} onCancel={handleWCCancel} />

		<!-- Disconnect Confirmation -->
		{#if showDisconnectId}
			{@const wallet = $connectedWalletsStore.wallets.find((w) => w.id === showDisconnectId)}
			<dialog
				class="modal modal-open"
				onclick={cancelDisconnect}
				onkeydown={(e: KeyboardEvent) => {
					if (e.key === 'Escape') cancelDisconnect();
				}}
			>
				<div
					class="modal-box max-w-sm"
					onclick={(e: Event) => e.stopPropagation()}
					role="alertdialog"
					aria-modal="true"
				>
					<h3 class="mb-2 text-lg font-bold">{$t('wallet.connected.disconnect_title')}</h3>
					{#if wallet}
						<p class="mb-2 text-sm opacity-70">
							{wallet.walletName} · {wallet.address.slice(0, 10)}...
						</p>
					{/if}
					<p class="mb-4 text-sm">{$t('wallet.connected.disconnect_msg')}</p>
					<div class="flex justify-end gap-2">
						<button class="btn btn-ghost btn-sm" onclick={cancelDisconnect}
							>{$t('common.cancel')}</button
						>
						<button class="btn btn-error btn-sm" onclick={handleDisconnect}
							>{$t('wallet.connected.remove')}</button
						>
					</div>
				</div>
				<form method="dialog" class="modal-backdrop">
					<button>{$t('wallet.connected.close')}</button>
				</form>
			</dialog>
		{/if}
	</div>
{/if}

<style>
	.tap-highlight-none {
		-webkit-tap-highlight-color: transparent;
	}
</style>
