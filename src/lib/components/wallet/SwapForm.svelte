<script lang="ts">
	import { get } from 'svelte/store';
	import { t } from 'svelte-i18n';
	import { fly, fade, scale } from 'svelte/transition';
	import { onMount } from 'svelte';
	import { walletStore, formatSats } from '$lib/stores/wallet.store';
	import { type Route, type SourceWallet, type Destination } from '$lib/services/route-resolver';
	import {
		resolveRouteAsync,
		createInitialAsyncRouteResult,
		type AsyncRouteResult
	} from '$lib/services/route-resolver-async';
	import { startSwapChain } from '$lib/services/swap-chain.service';
	import {
		connectedWalletsStore,
		restoreConnectedWalletState,
		replaceConnectedWallet
	} from '$lib/stores/connected-wallets.store';
	import { connectorRegistry } from '$lib/services/external-wallet/connector-registry';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import Drawer from '$lib/components/Drawer.svelte';
	import RoutePicker from '$lib/components/wallet/RoutePicker.svelte';
	import WalletSelector from '$lib/components/wallet/WalletSelector.svelte';
	import { triggerHaptic, ImpactStyle } from '$lib/utils/helpers/haptics';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';

	// -----------------------------------------------------------------------
	// Props
	// -----------------------------------------------------------------------
	let { isOpen, onClose } = $props<{
		isOpen: boolean;
		onClose: () => void;
	}>();

	// -----------------------------------------------------------------------
	// Destination type enum
	// -----------------------------------------------------------------------
	type DestType = 'usdt-bsc' | 'rbtc-rsk' | 'btc-onchain';

	interface DestOption {
		id: DestType;
		asset: string;
		label: string;
		description: string;
		icon: string;
		network: string;
		chainId: number;
		available: boolean;
	}

	// -----------------------------------------------------------------------
	// State
	// -----------------------------------------------------------------------
	let sourceType = $state<SourceWallet>('rbtc');
	let destType = $state<DestType>('usdt-bsc');
	let amount = $state('');
	let selectedRouteId = $state('');
	let swapPhase = $state<'form' | 'confirm' | 'executing' | 'complete' | 'failed'>('form');
	let errorMessage = $state('');
	let swapResult = $state<{ txHash?: string; swapId?: string } | null>(null);
	let isFlipping = $state(false);
	let swapPercent = $state(0);
	let slideDir = $state(-1); // 1 = forward, -1 = reverse; toggles each swap

	// -----------------------------------------------------------------------
	// Wallet accordion state
	// -----------------------------------------------------------------------
	let sourceWallet = $state<'builtin' | string>('builtin');
	let destWallet = $state<'builtin' | string>('builtin');
	let sourceExpand = $state(false);
	let destExpand = $state(false);

	let isConnectedSource = $derived(sourceWallet !== 'builtin');
	let isConnectedDest = $derived(destWallet !== 'builtin');

	// Restore persisted connected wallets on mount
	(async () => {
		await restoreConnectedWalletState();
		const wallets = get(connectedWalletsStore).wallets;

		// MetaMask auto-reconnect for live balances
		for (const w of wallets.filter((w) => w.walletType === 'metamask')) {
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
				replaceConnectedWallet(handle);
			} catch {
				// Silently fail
			}
		}

		// WalletConnect auto-reconnect
		for (const _ of wallets.filter((w) => w.walletType === 'walletconnect')) {
			try {
				const { restoreWCSession } = await import(
					'$lib/services/external-wallet/walletconnect-connector'
				);
				const handle = await restoreWCSession(() => {});
				if (handle) replaceConnectedWallet(handle);
			} catch {
				// Silently fail
			}
		}
	})();

	/** Source wallet address for route resolution */
	let sourceAddr = $derived.by(() => {
		if (!isConnectedSource) {
			return sourceType === 'rbtc'
				? ($walletStore.rsk.address ?? '')
				: ($walletStore.bsc.address ?? '');
		}
		const w = $connectedWalletsStore.wallets.find((cw) => cw.id === sourceWallet);
		return w?.address ?? '';
	});

	/** Destination wallet address for execution */
	let destAddr = $derived.by(() => {
		if (!isConnectedDest) {
			if (destType === 'btc-onchain') return getExternalBtcAddress();
			return destType === 'rbtc-rsk'
				? ($walletStore.rsk.address ?? '')
				: ($walletStore.bsc.address ?? '');
		}
		const w = $connectedWalletsStore.wallets.find((cw) => cw.id === destWallet);
		return w?.address ?? '';
	});

	/** Format USD balance for a wallet in WalletSelector */
	function walletBalanceFor(walletId: string): string {
		if (walletId === 'builtin') {
			const sats = $walletStore.totalBalances.sats;
			const usdt = $walletStore.totalBalances.usdt;
			const usd = (sats / 100_000_000) * btcPrice.price + usdt;
			return usd.toLocaleString('en-US', {
				style: 'currency',
				currency: 'USD',
				minimumFractionDigits: 2,
				maximumFractionDigits: 2
			});
		}
		const w = $connectedWalletsStore.wallets.find((cw) => cw.id === walletId);
		if (!w?.balances) return '$0.00';
		const btcSats = Number(w.balances.btc?.raw ?? 0) + Number(w.balances.rbtc?.raw ?? 0);
		const usdt = Number(w.balances.usdt?.raw ?? 0) / 1e18;
		const usd = (btcSats / 100_000_000) * btcPrice.price + usdt;
		return usd.toLocaleString('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		});
	}

	// -----------------------------------------------------------------------
	// BTC wallet detection
	// -----------------------------------------------------------------------
	let hasExternalBtcWallet = $derived(
		$connectedWalletsStore.wallets.some((w) => {
			// Any connected wallet of type trezor/ledger that supports Bitcoin
			if (w.walletType === 'trezor' || w.walletType === 'ledger') return true;
			// Or any wallet with BTC balance
			if (w.balances?.btc?.raw) return true;
			return false;
		})
	);

	/**
	 * Get external BTC wallet address for the destination.
	 * Uses the first connected wallet that has a BTC signer/address.
	 */
	function getExternalBtcAddress(): string {
		const handles = connectorRegistry.list();
		for (const handle of handles) {
			try {
				const signer = handle.bitcoinSigner;
				if (signer?.address) return signer.address;
			} catch {
				// Handle doesn't support BTC signing
			}
		}
		// Fallback: check connected wallets store
		const btcWallet = $connectedWalletsStore.wallets.find(
			(w) => w.walletType === 'trezor' || w.walletType === 'ledger'
		);
		return btcWallet?.address ?? '';
	}

	// -----------------------------------------------------------------------
	// Chain icon/asset data
	// -----------------------------------------------------------------------
	const CHAIN_RSK = {
		asset: 'rBTC',
		label: 'Rootstock',
		short: 'RSK',
		icon: '/images/chains/Bitcoin-Rootstock-logo.webp',
		network: 'rootstock-bitcoin',
		chainId: 30
	};
	const CHAIN_BSC = {
		asset: 'USDT',
		label: 'Binance Smart Chain',
		short: 'BSC',
		icon: '/images/chains/Tether-USD.svg',
		network: 'usdt-bsc',
		chainId: 56
	};
	const CHAIN_BTC = {
		asset: 'BTC',
		label: 'Bitcoin',
		short: 'BTC',
		icon: '/images/chains/Bitcoin.svg',
		network: 'bitcoin',
		chainId: -1 // Bitcoin mainnet (not EVM)
	};

	// -----------------------------------------------------------------------
	// Destination options (computed from source)
	// -----------------------------------------------------------------------
	let destOptions = $derived.by<DestOption[]>(() => {
		const options: DestOption[] = [];

		if (sourceType === 'rbtc') {
			// rBTC → USDT on BSC
			options.push({
				id: 'usdt-bsc',
				asset: CHAIN_BSC.asset,
				label: CHAIN_BSC.label,
				description: $t('wallet.swap.desc_rbtc_to_usdt'),
				icon: CHAIN_BSC.icon,
				network: CHAIN_BSC.network,
				chainId: CHAIN_BSC.chainId,
				available: true
			});

			// rBTC → BTC on-chain (only if external BTC wallet)
			options.push({
				id: 'btc-onchain',
				asset: CHAIN_BTC.asset,
				label: CHAIN_BTC.label,
				description: $t('wallet.swap.desc_rbtc_to_btc'),
				icon: CHAIN_BTC.icon,
				network: CHAIN_BTC.network,
				chainId: CHAIN_BTC.chainId,
				available: hasExternalBtcWallet
			});
		} else {
			// USDT → rBTC on RSK
			options.push({
				id: 'rbtc-rsk',
				asset: CHAIN_RSK.asset,
				label: CHAIN_RSK.label,
				description: $t('wallet.swap.desc_usdt_to_rbtc'),
				icon: CHAIN_RSK.icon,
				network: CHAIN_RSK.network,
				chainId: CHAIN_RSK.chainId,
				available: true
			});
		}

		return options;
	});

	// -----------------------------------------------------------------------
	// Derived
	// -----------------------------------------------------------------------
	let sourceAsset = $derived(sourceType === 'rbtc' ? 'rBTC' : 'USDT');
	let sourceIcon = $derived(
		sourceType === 'rbtc'
			? '/images/chains/Bitcoin-Rootstock-logo.webp'
			: '/images/chains/Tether-USD.svg'
	);

	/** Wallet balance in token units (rBTC or USDT) */
	let walletBalanceToken = $derived(
		sourceType === 'rbtc'
			? $walletStore.rsk?.formattedBalance || '0.00'
			: $walletStore.bsc?.formattedUsdtBalance || '0.00'
	);

	/** Actual BTC/USD price from Coinbase, fetched async. Default 0 until loaded. */
	let btcUsdPrice = $state(0);

	// Fetch BTC/USD price on mount
	onMount(async () => {
		try {
			btcUsdPrice = await cryptoPriceService.getCurrentPrice('BTC');
		} catch {
			// Leave at 0; estimatedOutput will show 0 until price loads
		}
	});

	/** Convert amount string to source token units (handles sats→rBTC when source is rBTC) */
	let amountInTokenUnits = $derived.by(() => {
		const amt = parseFloat(amount);
		if (!Number.isFinite(amt) || amt <= 0) return 0;
		if (sourceType === 'rbtc') return amt / 100_000_000; // sats → rBTC
		return amt; // USDT
	});

	/** Wallet balance in display units (sats for rBTC, USDT for USDT) */
	let walletBalanceDisplay = $derived.by(() => {
		const num = parseFloat(walletBalanceToken);
		if (!Number.isFinite(num)) return '0';
		if (sourceType === 'rbtc') {
			return formatSats(Math.round(num * 100_000_000));
		}
		return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
	});

	/** Estimated output in destination token units, with cross-currency conversion */
	/** Format sats with USD equivalent: "5,000,000 Sats ≈ $5,000.00" */
	function satsUsd(sats: number): string {
		const s = formatSats(sats);
		if (btcUsdPrice <= 0) return `${s} ${$t('wallet.sats')}`;
		const usd = (sats / 100_000_000) * btcUsdPrice;
		return `${s} ${$t('wallet.sats')} ≈ $${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
	}

	/** Sync amount from percentage slider (works with display units) */
	function applyPercent(pct: number) {
		const bal = parseFloat(walletBalanceToken);
		if (!Number.isFinite(bal) || bal <= 0) return;
		swapPercent = pct;
		if (sourceType === 'rbtc') {
			// Amount in sats
			amount = Math.round((pct / 100) * bal * 100_000_000).toString();
		} else {
			amount = ((pct / 100) * bal).toFixed(6);
		}
	}

	/** Sync percentage from manual amount input */
	$effect(() => {
		const bal = parseFloat(walletBalanceToken);
		if (!Number.isFinite(bal) || bal <= 0 || amountInTokenUnits <= 0) {
			if (swapPercent !== 0) swapPercent = 0;
			return;
		}
		const pct = Math.round((amountInTokenUnits / bal) * 100);
		if (pct !== swapPercent && pct >= 0 && pct <= 100) {
			swapPercent = pct;
		}
	});

	let visibleDestOptions = $derived(destOptions.filter((o) => o.available));

	let selectedDest = $derived(
		visibleDestOptions.find((o) => o.id === destType) || visibleDestOptions[0]
	);

	/** Build the appropriate Destination object for the route resolver */
	let routeDest = $derived.by<Destination>(() => {
		if (!selectedDest) {
			return { type: 'address', chainId: 56, address: '' };
		}
		if (selectedDest.id === 'btc-onchain') {
			return {
				type: 'invoice',
				network: 'onchain',
				invoice: getExternalBtcAddress() || ''
			};
		}
		return {
			type: 'address',
			chainId: selectedDest.chainId,
			address: ''
		};
	});

	let asyncRouteResult = $state<AsyncRouteResult>(createInitialAsyncRouteResult());
	let routeLoading = $state(false);
	let _routeTimer: ReturnType<typeof setTimeout> | null = null;

	/** Live API routes from Symbiosis + LI.FI. No hardcoded fallback. */
	let liveRoutes = $derived(asyncRouteResult.routes);

	let sortedRoutes = $derived(
		[...liveRoutes].sort((a, b) => a.totalFeePercent - b.totalFeePercent)
	);

	let activeRoute = $derived(
		sortedRoutes.find((r) => r.id === selectedRouteId) || sortedRoutes[0] || null
	);

	// Debounced async route fetch when source/dest/amount changes
	$effect(() => {
		if (_routeTimer) clearTimeout(_routeTimer);

		if (amountInTokenUnits <= 0) {
			asyncRouteResult = createInitialAsyncRouteResult();
			routeLoading = false;
			return;
		}

		routeLoading = true;
		const source = sourceType;
		const dest = routeDest;
		const amt = amountInTokenUnits.toString();

		_routeTimer = setTimeout(async () => {
			try {
				const result = await resolveRouteAsync(source, dest, amt, sourceAddr);
				asyncRouteResult = result;
			} catch {
				// Keep existing routes on API error
			}
			routeLoading = false;
		}, 400);

		return () => {
			if (_routeTimer) clearTimeout(_routeTimer);
		};
	});

	let estimatedOutput = $derived.by(() => {
		if (!activeRoute || amountInTokenUnits <= 0) return '0';
		const fee = 1 - activeRoute.totalFeePercent / 100;
		const sourceAmt = amountInTokenUnits;

		let output: number;
		if (sourceType === 'rbtc' && selectedDest?.id === 'usdt-bsc') {
			// rBTC → USDT: rBTC ≈ BTC, so rBTC amount * BTC/USD price * fee
			output = sourceAmt * btcUsdPrice * fee;
		} else if (sourceType === 'usdt-bsc' && selectedDest?.id === 'rbtc-rsk') {
			// USDT → rBTC: USDT amount / BTC/USD price * fee
			output = btcUsdPrice > 0 ? (sourceAmt / btcUsdPrice) * fee : 0;
		} else if (sourceType === 'rbtc' && selectedDest?.id === 'btc-onchain') {
			// rBTC → BTC: ~1:1 in BTC terms, output in BTC token units
			output = sourceAmt * fee;
		} else {
			output = sourceAmt * fee;
		}
		return output.toFixed(6);
	});

	let amountSats = $derived.by(() => {
		if (amountInTokenUnits <= 0) return 0;
		if (sourceType === 'rbtc') {
			return Math.round(amountInTokenUnits * 100_000_000);
		}
		// USDT → approximate sats via BTC/USD price
		return btcUsdPrice > 0 ? Math.round((amountInTokenUnits / btcUsdPrice) * 100_000_000) : 0;
	});

	let isInsufficientBalance = $derived(
		amountInTokenUnits > 0 && Number.isFinite(parseFloat(walletBalanceToken))
			? amountInTokenUnits > parseFloat(walletBalanceToken)
			: false
	);

	let isValidAmount = $derived(amountInTokenUnits > 0 && !isInsufficientBalance);
	let canSwap = $derived(isValidAmount && activeRoute !== null && swapPhase === 'form');

	let routePickerNetwork = $derived(selectedDest?.network ?? null);

	// Sync destType when source changes
	$effect(() => {
		const available = visibleDestOptions;
		if (available.length > 0 && !available.find((o) => o.id === destType)) {
			destType = available[0]!.id;
		}
	});

	// Auto-select cheapest route only when no route is selected yet
	$effect(() => {
		if (sortedRoutes.length > 0 && !selectedRouteId) {
			const cheapest = sortedRoutes[0];
			if (cheapest) {
				selectedRouteId = cheapest.id;
			}
		}
	});

	// Reset when drawer opens
	$effect(() => {
		if (!isOpen) return;
		selectedRouteId = '';
		errorMessage = '';
	});

	// -----------------------------------------------------------------------
	// Methods
	// -----------------------------------------------------------------------
	function swapDirection() {
		triggerHaptic(ImpactStyle.Light);
		isFlipping = true;
		setTimeout(() => (isFlipping = false), 300);
		slideDir *= -1; // reverse slide direction each swap

		if (sourceType === 'rbtc') {
			sourceType = 'usdt-bsc';
			destType = 'rbtc-rsk';
		} else {
			sourceType = 'rbtc';
			destType = 'usdt-bsc';
		}
		amount = '';
		swapPercent = 0;
		selectedRouteId = '';
		errorMessage = '';
		swapPhase = 'form';
	}

	function setMaxAmount() {
		triggerHaptic(ImpactStyle.Light);
		swapPercent = 100;
		if (sourceType === 'rbtc') {
			amount = Math.round(parseFloat(walletBalanceToken) * 100_000_000).toString();
		} else {
			amount = walletBalanceToken;
		}
	}

	function handleKeyPress(e: KeyboardEvent) {
		const allowedKeys = [
			'0',
			'1',
			'2',
			'3',
			'4',
			'5',
			'6',
			'7',
			'8',
			'9',
			'.',
			'Backspace',
			'Delete',
			'Tab',
			'Enter',
			'ArrowLeft',
			'ArrowRight'
		];
		const isControlKey = e.ctrlKey || e.metaKey || e.altKey;
		if (!allowedKeys.includes(e.key) && !isControlKey) {
			e.preventDefault();
		}
		const currentValue = (e.target as HTMLInputElement).value;
		if (e.key === '.' && currentValue.includes('.')) {
			e.preventDefault();
		}
	}

	function goToConfirm() {
		if (!canSwap) return;
		triggerHaptic(ImpactStyle.Medium);
		swapPhase = 'confirm';
		errorMessage = '';
	}

	function cancelConfirm() {
		swapPhase = 'form';
		errorMessage = '';
	}

	function resetForm() {
		// Guard: don't reset mid-execution
		if (swapPhase === 'executing') return;
		amount = '';
		swapPercent = 0;
		selectedRouteId = '';
		swapPhase = 'form';
		errorMessage = '';
		swapResult = null;
	}

	function handleClose() {
		// Block close during swap execution — prevent orphaning swap state
		if (swapPhase === 'executing') return;
		resetForm();
		onClose();
	}

	async function executeSwap() {
		// Double-execution guard: only allow from confirm phase
		if (swapPhase !== 'confirm') return;
		if (!activeRoute || !amount || isInsufficientBalance) return;

		swapPhase = 'executing';
		errorMessage = '';
		triggerHaptic(ImpactStyle.Heavy);

		// Get destination address from selected wallet
		const destAddress = destAddr;

		if (!destAddress) {
			errorMessage = $t('wallet.swap.error.no_dest_address');
			swapPhase = 'failed';
			return;
		}

		// Build proper destination with the actual user address
		const execDest: Destination =
			selectedDest?.id === 'btc-onchain'
				? { type: 'invoice', network: 'onchain', invoice: destAddress }
				: { type: 'address', chainId: selectedDest?.chainId ?? 56, address: destAddress };

		// Amount in source token units (not display units like sats)
		const execAmount = amountInTokenUnits.toString();

		const { data: result, error } = await startSwapChain(
			activeRoute,
			sourceType,
			execDest,
			execAmount
		);

		if (error || !result) {
			errorMessage = error?.message || $t('wallet.swap.error.swap_failed');
			swapPhase = 'failed';
			return;
		}

		if (result.phase === 'COMPLETE') {
			swapResult = {
				swapId: result.swap1Id ?? undefined,
				txHash: result.swap1Id ?? undefined
			};
			swapPhase = 'complete';
			triggerHaptic(ImpactStyle.Heavy);
		} else if (result.phase === 'FAILED' || result.phase === 'PARTIAL') {
			errorMessage = result.error || $t('wallet.swap.error.swap_failed');
			swapPhase = 'failed';
			triggerHaptic(ImpactStyle.Heavy);
		} else {
			// Unhandled phase — treat as still pending
			errorMessage = $t('wallet.swap.error.swap_failed');
			swapPhase = 'failed';
		}
	}

	function getProviderLabel(route: Route): string {
		const service = route.hops[0]?.service;
		switch (service) {
			case 'lifi':
				return 'LI.FI';
			case 'symbiosis':
				return 'Symbiosis';
			case 'boltz':
				return 'Boltz';
			case 'changelly':
				return 'Changelly';
			default:
				return route.label;
		}
	}
</script>

<Drawer
	{isOpen}
	onClose={handleClose}
	title={$t('wallet.swap.swap_assets')}
	position="right"
	isScrollable={true}
	isSubmitting={swapPhase === 'executing'}
>
	<div class="flex flex-col gap-4">
		{#if swapPhase === 'form'}
			<div transition:fly={{ y: 10, duration: 200 }}>
				<div class="flex flex-col gap-4">
					<!-- From: Wallet Accordion -->
					<WalletSelector
						label={$t('wallet.from') + ':'}
						selectedId={sourceWallet}
						onSelect={(id) => (sourceWallet = id)}
						builtinBalance={walletBalanceFor('builtin')}
						connectedWallets={$connectedWalletsStore.wallets}
						{walletBalanceFor}
						expanded={sourceExpand}
						onToggle={() => (sourceExpand = !sourceExpand)}
					/>

					<!-- Source Asset Toggle -->
					<div class="flex items-center justify-center px-2">
						<div
							class="bg-base-200 flex items-center gap-1 rounded-xl p-1 text-xs font-medium sm:text-sm"
						>
							<button
								type="button"
								class="rounded-lg px-3 py-1.5 transition-colors {sourceType === 'rbtc'
									? 'bg-primary text-primary-content shadow-sm'
									: 'text-base-content/60 hover:text-base-content'}"
								onclick={() => {
									if (sourceType !== 'rbtc') swapDirection();
								}}
							>
								{$t('wallet.rbtc')}
							</button>
							<button
								type="button"
								class="rounded-lg px-3 py-1.5 transition-colors {sourceType === 'usdt-bsc'
									? 'bg-primary text-primary-content shadow-sm'
									: 'text-base-content/60 hover:text-base-content'}"
								onclick={() => {
									if (sourceType !== 'usdt-bsc') swapDirection();
								}}
							>
								{$t('wallet.usdt')}
							</button>
						</div>
					</div>

					<!-- Swap Direction Button -->
					<div class="relative flex items-center justify-center py-1">
						<div class="border-base-300 absolute inset-x-0 top-1/2 border-t"></div>
						<button
							type="button"
							class="btn btn-circle btn-outline bg-base-100 relative z-10 min-h-[44px] min-w-[44px] touch-manipulation border-2 transition-transform duration-300 active:scale-95 sm:min-h-[48px] sm:min-w-[48px]"
							class:rotate-180={isFlipping}
							onclick={() => {
								// Swap wallets too
								const tmpWallet = sourceWallet;
								sourceWallet = destWallet;
								destWallet = tmpWallet;
								swapDirection();
							}}
							aria-label={$t('wallet.swap.swap_direction')}
							style="-webkit-tap-highlight-color: transparent;"
						>
							<svg
								class="h-5 w-5 sm:h-6 sm:w-6"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
								/>
							</svg>
						</button>
					</div>

					<!-- To: Wallet Accordion -->
					<WalletSelector
						label={$t('wallet.to') + ':'}
						selectedId={destWallet}
						onSelect={(id) => (destWallet = id)}
						builtinBalance={walletBalanceFor('builtin')}
						connectedWallets={$connectedWalletsStore.wallets}
						{walletBalanceFor}
						expanded={destExpand}
						onToggle={() => (destExpand = !destExpand)}
					/>

					<!-- Destination Asset Selection -->
					{#key sourceType}
						<div
							class="space-y-2"
							style="animation: {slideDir < 0 ? 'slideFromRight' : 'slideFromLeft'} 0.25s ease"
						>
							{#each visibleDestOptions as option (option.id)}
								{@const isSelected = destType === option.id}
								<button
									type="button"
									class="flex w-full items-center gap-3 rounded-xl border-2 p-3 text-left transition-all duration-200 sm:p-4 {isSelected
										? 'border-primary bg-primary/5 shadow-sm'
										: 'border-base-300 hover:border-primary/30 hover:bg-base-200'} touch-manipulation active:scale-[0.98]"
									onclick={() => {
										destType = option.id;
										selectedRouteId = '';
									}}
									style="-webkit-tap-highlight-color: transparent;"
								>
									<div
										class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 {isSelected
											? 'border-primary'
											: 'border-base-300'}"
									>
										{#if isSelected}
											<div class="bg-primary h-3 w-3 rounded-full"></div>
										{/if}
									</div>
									<div class="relative shrink-0">
										<img
											src={option.icon}
											alt={option.asset}
											class="h-8 w-8 rounded-full sm:h-10 sm:w-10"
										/>
										{#if option.asset === 'USDT'}
											<img
												src="/images/chains/Binance-logo.svg"
												alt="BSC"
												class="border-base-200 absolute -right-0.5 -bottom-0.5 h-3.5 w-3.5 rounded-full border sm:h-4 sm:w-4"
											/>
										{/if}
									</div>
									<div class="min-w-0 flex-1">
										<div class="text-sm font-semibold sm:text-base">
											{option.asset === 'USDT' ? 'USD' : 'Bitcoin'} ({option.asset === 'USDT'
												? 'Binance'
												: option.asset})
										</div>
										<div class="text-base-content/60 text-xs sm:text-sm">
											{#if option.id === 'rbtc-rsk'}
												{$t('wallet.available_balance')}: {satsUsd(
													Math.round(
														parseFloat($walletStore.rsk?.formattedBalance || '0') * 100_000_000
													)
												)}
											{:else if option.id === 'btc-onchain'}
												{$t('wallet.available_balance')}: {satsUsd(
													Number(
														$connectedWalletsStore.wallets.find(
															(w) => w.walletType === 'trezor' || w.walletType === 'ledger'
														)?.balances?.btc?.raw || 0
													)
												)}
											{:else}
												{$t('wallet.available_balance')}: ${parseFloat(
													$walletStore.bsc?.formattedUsdtBalance || '0'
												).toLocaleString('en-US', {
													minimumFractionDigits: 2,
													maximumFractionDigits: 2
												})}
											{/if}
										</div>
									</div>
								</button>
							{/each}

							<!-- BTC not available hint (always shown when no BTC wallet) -->
							{#if !hasExternalBtcWallet}
								<div
									class="text-base-content/40 flex items-center gap-2 px-1 py-1 text-xs sm:text-sm"
								>
									<svg
										class="h-4 w-4 shrink-0"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
										/>
									</svg>
									<span>{$t('wallet.swap.btc_not_available')}</span>
								</div>
							{/if}
						</div>
					{/key}

					<!-- Amount Input -->
					<div class="form-control">
						<label for="swap-amount" class="label flex justify-between px-1 py-1">
							<span class="label-text text-sm sm:text-base">
								{sourceType === 'rbtc' ? $t('wallet.sats') : 'USDT'}
							</span>
							<span class="label-text-alt text-xs sm:text-sm">
								{$t('wallet.available_balance')}: {sourceType === 'rbtc'
									? satsUsd(Math.round(parseFloat(walletBalanceToken) * 100_000_000))
									: `${walletBalanceDisplay}`}
							</span>
						</label>
						<div class="join w-full">
							<input
								id="swap-amount"
								type="number"
								class="input input-bordered join-item min-h-[48px] flex-1 rounded-r-none text-base sm:min-h-[52px]"
								placeholder={sourceType === 'rbtc' ? '0' : '0.00'}
								bind:value={amount}
								onkeypress={handleKeyPress}
								min="0"
								step={sourceType === 'rbtc' ? '1' : '0.000001'}
								inputmode="numeric"
							/>
							<button
								type="button"
								class="btn btn-primary join-item min-h-[48px] touch-manipulation rounded-l-none active:scale-95 sm:min-h-[52px]"
								onclick={setMaxAmount}
								style="-webkit-tap-highlight-color: transparent;"
							>
								<span class="text-xs sm:text-sm">{$t('wallet.max')}</span>
							</button>
						</div>
					</div>

					<!-- Percent Slider -->
					<div class="form-control py-2">
						<div class="flex items-center gap-3">
							<span class="text-primary min-w-[3ch] text-right text-sm font-semibold"
								>{swapPercent}%</span
							>
							<input
								id="swap-percent"
								type="range"
								min="0"
								max="100"
								step="1"
								value={swapPercent}
								class="range range-primary range-sm flex-1"
								oninput={(e) => {
									const pct = parseInt((e.target as HTMLInputElement).value);
									applyPercent(pct);
								}}
							/>
						</div>
					</div>

					<!-- RoutePicker — always visible -->
					<RoutePicker
						routes={sortedRoutes}
						{selectedRouteId}
						onSelect={(id: string) => (selectedRouteId = id)}
						btcPrice={btcUsdPrice}
						network={routePickerNetwork}
						{amountSats}
						isLoadingFee={routeLoading}
						hasAddress={true}
						hasAmount={amountSats > 0}
					/>
					<!-- Total Card — always visible -->
					<div
						class="bg-primary/5 border-primary/20 flex items-center gap-3 rounded-xl border-2 p-3 sm:p-4"
						transition:fade={{ duration: 200 }}
					>
						<div class="min-w-0 flex-1">
							<div class="text-base-content/60 text-xs sm:text-sm">
								{$t('wallet.swap.estimated_output')}
							</div>
							<div class="text-base font-bold sm:text-lg">
								{#if activeRoute && selectedDest}
									{#if selectedDest.asset === 'rBTC' || selectedDest.id === 'btc-onchain'}
										{satsUsd(Math.round(parseFloat(estimatedOutput) * 100_000_000))}
									{:else}
										${parseFloat(estimatedOutput).toLocaleString('en-US', {
											minimumFractionDigits: 2,
											maximumFractionDigits: 2
										})}
									{/if}
								{:else}
									<span class="text-base-content/30">—</span>
								{/if}
							</div>
						</div>
						<div class="shrink-0 text-right">
							<div class="text-base-content/60 text-xs">
								{$t('wallet.swap.estimated_time')}
							</div>
							<div class="text-sm font-semibold">
								{#if activeRoute}
									{activeRoute.estimatedTime}
								{:else}
									<span class="text-base-content/30">—</span>
								{/if}
							</div>
						</div>
					</div>

					<!-- Insufficient balance -->
					{#if isInsufficientBalance}
						<div class="alert alert-outline alert-error py-2 sm:py-3">
							<span class="text-xs sm:text-sm">
								{$t('wallet.swap.insufficient_balance')}
							</span>
						</div>
					{/if}
				</div>
			</div>
		{/if}

		<!-- Confirm Phase -->
		{#if swapPhase === 'confirm' && activeRoute && selectedDest}
			<div transition:fly={{ y: 10, duration: 200 }} class="flex flex-col gap-4">
				<h4 class="text-base font-semibold sm:text-lg">{$t('wallet.swap.swap_preview')}</h4>

				<!-- Source Card -->
				<div class="bg-base-200 flex items-center gap-3 rounded-xl p-3 sm:p-4">
					<div class="relative shrink-0">
						<img
							src={sourceIcon}
							alt={sourceAsset}
							class="h-10 w-10 rounded-full sm:h-12 sm:w-12"
						/>
						{#if sourceType === 'usdt-bsc'}
							<img
								src="/images/chains/Binance-logo.svg"
								alt="BSC"
								class="border-base-200 absolute -right-0.5 -bottom-0.5 h-4 w-4 rounded-full border sm:h-5 sm:w-5"
							/>
						{/if}
					</div>
					<div class="min-w-0 flex-1">
						<div class="text-base-content/60 text-xs sm:text-sm">
							{$t('wallet.swap.you_send')}
						</div>
						<div class="text-sm font-semibold sm:text-base">{$t('wallet.btc')} ({sourceAsset})</div>
					</div>
					<div class="shrink-0 text-right">
						<div class="text-sm font-bold sm:text-base">
							{sourceType === 'rbtc'
								? `${formatSats(Math.round(parseFloat(amount || '0')))} ${$t('wallet.sats')}`
								: `$${parseFloat(amount || '0').toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
						</div>
						{#if sourceType === 'rbtc'}
							{@const satsVal = Math.round(parseFloat(amount || '0'))}
							<div class="text-base-content/50 text-xs">
								${((satsVal / 100_000_000) * btcUsdPrice).toLocaleString('en-US', {
									minimumFractionDigits: 2,
									maximumFractionDigits: 2
								})}
							</div>
						{/if}
					</div>
				</div>

				<!-- Provider Bridge -->
				<div class="flex items-center justify-center py-1">
					<div class="bg-base-200 flex items-center gap-2 rounded-full px-4 py-2">
						<svg
							class="text-primary h-4 w-4 shrink-0 sm:h-5 sm:w-5"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M17 8l4 4m0 0l-4 4m4-4H3"
							/>
						</svg>
						<span class="text-sm font-semibold">{getProviderLabel(activeRoute)}</span>
						<span class="text-base-content/60 text-xs">
							{activeRoute.totalFeePercent > 0 && amountSats > 0 && btcUsdPrice > 0
								? `$${((amountSats / 100_000_000) * btcUsdPrice * (activeRoute.totalFeePercent / 100)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
								: ''} · {activeRoute.estimatedTime}
						</span>
						<svg
							class="text-primary h-4 w-4 shrink-0 sm:h-5 sm:w-5"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M17 8l4 4m0 0l-4 4m4-4H3"
							/>
						</svg>
					</div>
				</div>

				<!-- Destination Card -->
				<div class="bg-base-200 flex items-center gap-3 rounded-xl p-3 sm:p-4">
					<div class="relative shrink-0">
						<img
							src={selectedDest.icon}
							alt={selectedDest.asset}
							class="h-10 w-10 rounded-full sm:h-12 sm:w-12"
						/>
						{#if selectedDest.asset === 'USDT'}
							<img
								src="/images/chains/Binance-logo.svg"
								alt="BSC"
								class="border-base-200 absolute -right-0.5 -bottom-0.5 h-4 w-4 rounded-full border sm:h-5 sm:w-5"
							/>
						{/if}
					</div>
					<div class="min-w-0 flex-1">
						<div class="text-base-content/60 text-xs sm:text-sm">{$t('wallet.swap.you_get')}</div>
						<div class="text-sm font-semibold sm:text-base">
							{selectedDest.asset === 'USDT' ? 'USD' : selectedDest.asset} ({selectedDest.asset ===
							'USDT'
								? 'Binance'
								: selectedDest.label})
						</div>
					</div>
					<div class="shrink-0 text-right">
						<div class="text-sm font-bold sm:text-base">
							{#if selectedDest.asset === 'rBTC' || selectedDest.id === 'btc-onchain'}
								{formatSats(Math.round(parseFloat(estimatedOutput) * 100_000_000))}
								{$t('wallet.sats')}
							{:else}
								${parseFloat(estimatedOutput).toLocaleString('en-US', {
									minimumFractionDigits: 2,
									maximumFractionDigits: 2
								})}
							{/if}
						</div>
						{#if selectedDest.asset === 'rBTC' || selectedDest.id === 'btc-onchain'}
							{@const outSats = Math.round(parseFloat(estimatedOutput) * 100_000_000)}
							<div class="text-base-content/50 text-xs">
								${((outSats / 100_000_000) * btcUsdPrice).toLocaleString('en-US', {
									minimumFractionDigits: 2,
									maximumFractionDigits: 2
								})}
							</div>
						{/if}
					</div>
				</div>

				<!-- Warning -->
				<div class="alert alert-outline alert-warning py-2 text-xs sm:text-sm">
					<svg class="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
						/>
					</svg>
					<span>{$t('wallet.swap.irreversible_warning')}</span>
				</div>
			</div>
		{/if}

		<!-- Executing Phase -->
		{#if swapPhase === 'executing'}
			<div transition:fly={{ y: 10, duration: 200 }} class="flex flex-col items-center gap-4 py-6">
				<span class="loading loading-spinner loading-lg text-primary"></span>
				<p class="text-sm font-medium sm:text-base">
					{$t('wallet.swap.swap_executing')}
				</p>
				<p class="text-base-content/60 text-xs sm:text-sm">
					{$t('wallet.swap.timing_note')}
				</p>
				<p class="text-base-content/50 pt-2 text-xs italic">
					{$t('wallet.swap.navigate_away_note')}
				</p>
			</div>
		{/if}

		<!-- Success Phase -->
		{#if swapPhase === 'complete'}
			<div class="flex flex-col gap-4" transition:scale={{ duration: 300, start: 0.95 }}>
				<!-- Success Header -->
				<div class="flex flex-col items-center gap-2 py-2">
					<div class="bg-success/10 rounded-full p-3">
						<svg
							class="text-success h-10 w-10 sm:h-12 sm:w-12"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
					</div>
					<h4 class="text-lg font-bold sm:text-xl">{$t('wallet.swap.swap_complete')}</h4>
				</div>

				<!-- Swap Summary Cards -->
				<div class="bg-base-200 space-y-3 rounded-xl p-4">
					<!-- Source row -->
					<div class="flex items-center gap-3">
						<img
							src={sourceIcon}
							alt={sourceAsset}
							class="h-7 w-7 shrink-0 rounded-full sm:h-8 sm:w-8"
						/>
						<div class="min-w-0 flex-1 text-xs sm:text-sm">
							<div class="text-base-content/60">{$t('wallet.swap.you_send')}</div>
							<div class="font-semibold">
								{sourceType === 'rbtc'
									? `${formatSats(Math.round(parseFloat(amount || '0')))} ${$t('wallet.sats')}`
									: `$${parseFloat(amount || '0').toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${sourceAsset}`}
							</div>
						</div>
					</div>

					<!-- Provider bridge -->
					<div class="flex items-center justify-center">
						<div class="bg-base-100 flex items-center gap-2 rounded-full px-3 py-1 text-xs">
							<span>{getProviderLabel(activeRoute!)}</span>
							<svg
								class="text-primary h-3 w-3 shrink-0"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
								><path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M17 8l4 4m0 0l-4 4m4-4H3"
								/></svg
							>
						</div>
					</div>

					<!-- Destination row -->
					<div class="flex items-center gap-3">
						<div class="relative shrink-0">
							<img
								src={selectedDest!.icon}
								alt={selectedDest!.asset}
								class="h-7 w-7 rounded-full sm:h-8 sm:w-8"
							/>
							{#if selectedDest!.asset === 'USDT'}<img
									src="/images/chains/Binance-logo.svg"
									alt="BSC"
									class="border-base-200 absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border"
								/>{/if}
						</div>
						<div class="min-w-0 flex-1 text-xs sm:text-sm">
							<div class="text-base-content/60">{$t('wallet.swap.you_get')}</div>
							<div class="font-semibold">
								{#if selectedDest!.asset === 'rBTC' || selectedDest!.id === 'btc-onchain'}
									{satsUsd(Math.round(parseFloat(estimatedOutput) * 100_000_000))}
								{:else}
									${parseFloat(estimatedOutput).toLocaleString('en-US', {
										minimumFractionDigits: 2,
										maximumFractionDigits: 2
									})}
									{selectedDest!.asset}
								{/if}
							</div>
						</div>
					</div>
				</div>

				<!-- Fee + Time row -->
				<div
					class="bg-base-200 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl px-4 py-3 text-xs sm:text-sm"
				>
					<span class="text-base-content/60"
						>{$t('wallet.swap.fee_percent')}:
						<span class="text-base-content font-semibold">{activeRoute!.totalFeePercent}%</span
						></span
					>
					<span class="text-base-content/60"
						>{$t('wallet.swap.estimated_time')}:
						<span class="text-base-content font-semibold">{activeRoute!.estimatedTime}</span></span
					>
				</div>

				<!-- TX link -->
				{#if swapResult?.swapId}
					{@const hash = swapResult.swapId}
					{@const truncated = `${hash.slice(0, 6)}...${hash.slice(-4)}`}
					{@const explorerUrl =
						sourceType === 'rbtc'
							? `https://explorer.rootstock.io/tx/${hash}`
							: `https://bscscan.com/tx/${hash}`}
					<a
						href={explorerUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="bg-base-200 hover:bg-base-300 flex items-center gap-2 rounded-xl p-3 text-xs transition-colors sm:text-sm"
					>
						<span class="text-base-content/60">TX:</span>
						<span class="font-mono">{truncated}</span>
						<svg
							class="text-base-content/40 ml-auto h-4 w-4 shrink-0"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							><path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
							/></svg
						>
					</a>
				{/if}

				<!-- Navigate away note -->
				<p class="text-base-content/50 px-1 text-center text-xs italic">
					{$t('wallet.swap.navigate_away_note')}
				</p>

				<button
					class="btn btn-primary min-h-[44px] touch-manipulation active:scale-95 sm:min-h-[48px]"
					onclick={resetForm}
					style="-webkit-tap-highlight-color: transparent;"
				>
					{$t('wallet.swap.swap_another')}
				</button>
			</div>
		{/if}

		<!-- Error Phase -->
		{#if swapPhase === 'failed'}
			<div transition:fly={{ y: 10, duration: 200 }} class="flex flex-col items-center gap-3 py-6">
				<div class="bg-error/10 rounded-full p-3">
					<svg
						class="text-error h-10 w-10 sm:h-12 sm:w-12"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
				</div>
				<h4 class="text-lg font-bold sm:text-xl">
					{$t('wallet.swap.swap_failed')}
				</h4>
				<p class="text-base-content/60 text-center text-xs sm:text-sm">{errorMessage}</p>
				<button
					class="btn btn-primary min-h-[44px] touch-manipulation active:scale-95 sm:min-h-[48px]"
					onclick={resetForm}
					style="-webkit-tap-highlight-color: transparent;"
				>
					{$t('common.buttons.retry')}
				</button>
			</div>
		{/if}

		<!-- General error message -->
		{#if errorMessage && swapPhase !== 'failed'}
			<div class="alert alert-outline alert-error py-2 sm:py-3">
				<span class="text-xs sm:text-sm">{errorMessage}</span>
			</div>
		{/if}
	</div>
	{#snippet footer()}
		{#if swapPhase === 'form'}
			<div class="flex gap-3">
				<button
					class="btn btn-outline btn-error min-h-[44px] flex-1 touch-manipulation active:scale-95 sm:min-h-[48px] sm:flex-none"
					onclick={handleClose}
					style="-webkit-tap-highlight-color: transparent;"
				>
					<span class="text-sm sm:text-base">{$t('wallet.buy_sell.cancel')}</span>
				</button>
				<button
					class="btn btn-primary min-h-[44px] flex-1 touch-manipulation active:scale-95 sm:min-h-[48px] sm:flex-none"
					onclick={goToConfirm}
					disabled={!canSwap}
					style="-webkit-tap-highlight-color: transparent;"
				>
					<span class="text-sm sm:text-base">{$t('wallet.swap.swap_preview')}</span>
				</button>
			</div>
		{:else if swapPhase === 'confirm'}
			<div class="flex gap-3">
				<button
					class="btn btn-outline min-h-[44px] flex-1 touch-manipulation active:scale-95 sm:min-h-[48px] sm:flex-none"
					onclick={cancelConfirm}
					style="-webkit-tap-highlight-color: transparent;"
				>
					<span class="text-sm sm:text-base">{$t('common.back')}</span>
				</button>
				<button
					class="btn btn-primary min-h-[44px] flex-1 touch-manipulation active:scale-95 sm:min-h-[48px] sm:flex-none"
					onclick={executeSwap}
					style="-webkit-tap-highlight-color: transparent;"
				>
					<span class="text-sm sm:text-base">{$t('wallet.swap.confirm_swap')}</span>
				</button>
			</div>
		{:else if swapPhase === 'complete' || swapPhase === 'failed'}
			<div class="flex gap-3">
				<button
					class="btn btn-outline min-h-[44px] flex-1 touch-manipulation active:scale-95 sm:min-h-[48px] sm:flex-none"
					onclick={handleClose}
					style="-webkit-tap-highlight-color: transparent;"
				>
					<span class="text-sm sm:text-base">{$t('wallet.buy_sell.close')}</span>
				</button>
			</div>
		{/if}
	{/snippet}
</Drawer>

<style>
	@keyframes slideFromLeft {
		from {
			transform: translateX(-60px);
			opacity: 0;
		}
		to {
			transform: translateX(0);
			opacity: 1;
		}
	}
	@keyframes slideFromRight {
		from {
			transform: translateX(60px);
			opacity: 0;
		}
		to {
			transform: translateX(0);
			opacity: 1;
		}
	}
</style>
