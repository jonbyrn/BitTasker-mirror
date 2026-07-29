<!--
  SwapPartySelector — Dual-zone accordion for swap From/To selection.

  Progressive disclosure:
    Layer 0 (collapsed):  [Wallet icon]  [Asset icon + name + balance]
    Layer 1 (tap asset):  Opens asset list with all available assets
    Layer 2 (tap wallet): Opens wallet list (only if multiple wallets exist)

  When only the built-in wallet exists, the wallet zone is static (no chevron, no tap).
  When multiple wallets exist, tapping the wallet zone opens the wallet list.
  Only one zone can be expanded at a time.
-->
<script lang="ts">
	import { t } from 'svelte-i18n';
	import { slide } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import type { ConnectedWalletEntry } from '$lib/stores/connected-wallets.store';
	import WalletIcon from './WalletIcon.svelte';
	import IconChevronDown from '~icons/mdi/chevron-down';
	import type { AssetOption } from './AssetSelector.svelte';

	interface Props {
		/** Label shown above the selector (e.g. "From" or "To") */
		label: string;
		// Wallet
		selectedWalletId: string;
		onWalletSelect: (id: string) => void;
		connectedWallets: ConnectedWalletEntry[];
		/** Per-wallet BTC sats (for two-line balance display) */
		walletBtcSatsFor: (id: string) => number;
		/** Per-wallet USDT0 USD amount */
		walletUsdt0For: (id: string) => number;
		/** BTC price for USD conversion */
		btcPrice: number;
		// Asset
		selectedAssetId: string;
		onAssetSelect: (id: string) => void;
		assets: AssetOption[];
	}

	let {
		label,
		selectedWalletId,
		onWalletSelect,
		connectedWallets,
		walletBtcSatsFor,
		walletUsdt0For,
		btcPrice,
		selectedAssetId,
		onAssetSelect,
		assets
	}: Props = $props();

	/** Which zone is expanded: null = collapsed */
	let expandedZone = $state<'wallet' | 'asset' | null>(null);

	/** Whether multiple wallets are available (shows wallet zone as interactive) */
	let hasMultipleWallets = $derived(connectedWallets.length > 0);

	let selectedAsset = $derived(assets.find((a) => a.id === selectedAssetId));
	let availableAssets = $derived(assets.filter((a) => a.available !== false));

	function formatSatsUsd(sats: number, price: number): string {
		const formatted = new Intl.NumberFormat().format(sats);
		const usd = (sats / 100_000_000) * price;
		return `${formatted} Sats ≈ ($${usd.toFixed(2)})`;
	}

	function formatUsdt0(usd: number): string {
		return `$${usd.toFixed(2)} USDT0`;
	}

	function toggleZone(zone: 'wallet' | 'asset') {
		expandedZone = expandedZone === zone ? null : zone;
	}

	function selectWallet(id: string) {
		onWalletSelect(id);
		expandedZone = null;
	}

	function selectAsset(id: string) {
		onAssetSelect(id);
		expandedZone = null;
	}

	let selectedWalletDisplay = $derived.by(() => {
		if (selectedWalletId === 'builtin') {
			return {
				icon: '/images/logos/bittasker-logomark.svg',
				name: $t('wallet.builtin_wallet'),
				isImage: true
			};
		}
		const w = connectedWallets.find((w) => w.id === selectedWalletId);
		if (w) {
			return { icon: w.walletType, name: w.walletName, isImage: false };
		}
		return {
			icon: '/images/logos/bittasker-logomark.svg',
			name: $t('wallet.builtin_wallet'),
			isImage: true
		};
	});
</script>

<div class="form-control">
	<label class="label px-1 py-0.5" for={label}>
		<span class="label-text text-base-content/60 text-xs font-medium">{label}</span>
	</label>
	<div class="border-primary bg-base-100 overflow-hidden rounded-lg border-2">
		<!-- Header: wallet zone (left) + asset zone (fills to right edge) -->
		<div class="flex min-h-[48px] items-center gap-0 text-sm font-medium">
			<!-- Wallet zone (left) -->
			<button
				type="button"
				class="flex min-h-[48px] shrink-0 items-center gap-1.5 px-3 transition-colors {hasMultipleWallets
					? 'hover:bg-base-200 active:bg-base-300 cursor-pointer'
					: 'cursor-default'}"
				class:bg-base-200={expandedZone === 'wallet'}
				onclick={(e) => {
					if (hasMultipleWallets) {
						e.stopPropagation();
						toggleZone('wallet');
					}
				}}
				aria-label={hasMultipleWallets ? $t('wallet.swap.change_wallet') : undefined}
			>
				{#if selectedWalletDisplay.isImage}
					<img
						src={selectedWalletDisplay.icon}
						alt={selectedWalletDisplay.name}
						class="h-5 w-5 shrink-0"
					/>
				{:else}
					<WalletIcon walletType={selectedWalletDisplay.icon} className="h-5 w-5 shrink-0" />
				{/if}
				{#if hasMultipleWallets}
					<IconChevronDown
						class="h-4 w-4 shrink-0 transition-transform duration-200 {expandedZone === 'wallet'
							? 'rotate-180'
							: ''}"
					/>
				{/if}
			</button>

			<!-- Vertical divider -->
			{#if hasMultipleWallets}
				<div class="bg-base-300 h-6 w-px shrink-0"></div>
			{/if}

			<!-- Asset zone (fills remaining space, click anywhere opens asset accordion) -->
			<button
				type="button"
				class="hover:bg-base-200 active:bg-base-300 flex min-h-[48px] flex-1 items-center gap-2 px-3 transition-colors"
				class:bg-base-200={expandedZone === 'asset'}
				onclick={(e) => {
					e.stopPropagation();
					toggleZone('asset');
				}}
			>
				{#if selectedAsset}
					<img
						src={selectedAsset.icon}
						alt={selectedAsset.label}
						class="h-5 w-5 shrink-0 rounded-full"
					/>
					<div class="min-w-0 flex-1 text-left">
						<span class="truncate font-medium">{selectedAsset.label}</span>
						{#if selectedAsset.symbol}
							<div class="text-base-content/50 text-xs">{selectedAsset.symbol}</div>
						{/if}
					</div>
					{#if selectedAsset.balance !== undefined}
						<div class="ml-auto text-right">
							<div class="text-xs font-semibold tabular-nums">{selectedAsset.balance}</div>
							{#if selectedAsset.balanceSub}
								<div class="text-base-content/50 text-xs">{selectedAsset.balanceSub}</div>
							{/if}
						</div>
					{/if}
				{/if}
				<IconChevronDown
					class="text-base-content ml-1 h-4 w-4 shrink-0 transition-transform duration-200 {expandedZone !==
					null
						? 'rotate-180'
						: ''}"
				/>
			</button>
		</div>

		<!-- Expanded content with smooth slide transition -->
		{#if expandedZone !== null}
			<div
				transition:slide={{ duration: 250, easing: quintOut }}
				class="border-base-300 border-t px-2 py-1"
			>
				<div class="space-y-1">
					{#if expandedZone === 'wallet'}
						<!-- Built-in wallet -->
						<button
							class="flex w-full items-center gap-2 rounded-lg border-2 border-transparent p-2 transition-colors {selectedWalletId ===
							'builtin'
								? 'bg-primary/10'
								: 'hover:bg-base-200'}"
							onclick={() => selectWallet('builtin')}
						>
							<img src="/images/logos/bittasker-logomark.svg" alt="rBTC" class="h-5 w-5 shrink-0" />
							<div class="min-w-0 flex-1 text-left">
								<div class="text-sm font-medium">{$t('wallet.builtin_wallet')}</div>
							</div>
							<div class="ml-auto shrink-0 text-right">
								<div class="text-xs font-semibold tabular-nums">
									{formatSatsUsd(walletBtcSatsFor('builtin'), btcPrice)}
								</div>
								<div class="text-base-content/50 text-xs tabular-nums">
									{formatUsdt0(walletUsdt0For('builtin'))}
								</div>
							</div>
						</button>

						<!-- Connected wallets -->
						{#if connectedWallets.length > 0}
							<div class="divider my-1 text-xs">{$t('wallet.tab_connected')}</div>
							{#each connectedWallets as wallet (wallet.id)}
								<button
									class="flex w-full items-center gap-2 rounded-lg border-2 border-transparent p-2 transition-colors {selectedWalletId ===
									wallet.id
										? 'bg-primary/10'
										: 'hover:bg-base-200'}"
									onclick={() => selectWallet(wallet.id)}
								>
									<WalletIcon walletType={wallet.walletType} />
									<div class="min-w-0 flex-1 text-left">
										<div class="text-sm font-medium">{wallet.walletName}</div>
										<div class="text-base-content/40 truncate text-xs">
											{wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
										</div>
									</div>
									<div class="ml-auto shrink-0 text-right">
										<div class="text-xs font-semibold tabular-nums">
											{formatSatsUsd(walletBtcSatsFor(wallet.id), btcPrice)}
										</div>
										<div class="text-base-content/50 text-xs tabular-nums">
											{formatUsdt0(walletUsdt0For(wallet.id))}
										</div>
									</div>
								</button>
							{/each}
						{/if}
					{:else if expandedZone === 'asset'}
						{#each availableAssets as asset (asset.id)}
							<button
								class="flex w-full items-center gap-2 rounded-lg border-2 border-transparent p-2 transition-colors {selectedAssetId ===
								asset.id
									? 'bg-primary/10'
									: 'hover:bg-base-200'}"
								onclick={() => selectAsset(asset.id)}
							>
								<img src={asset.icon} alt={asset.label} class="h-5 w-5 shrink-0 rounded-full" />
								<div class="min-w-0 flex-1 text-left">
									<div class="text-sm font-medium">{asset.label}</div>
									{#if asset.subLabel}
										<div class="text-base-content/50 truncate text-xs">{asset.subLabel}</div>
									{/if}
								</div>
								{#if asset.balance !== undefined}
									<div class="ml-auto shrink-0 text-right">
										<div class="text-xs font-semibold tabular-nums">{asset.balance}</div>
										{#if asset.balanceSub}
											<div class="text-base-content/50 text-xs">{asset.balanceSub}</div>
										{/if}
									</div>
								{/if}
							</button>
						{/each}
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>
