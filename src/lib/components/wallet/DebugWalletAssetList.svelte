<script lang="ts">
	import { t } from 'svelte-i18n';
	import { onMount, onDestroy } from 'svelte';
	import { loadRSKTokenBalances, walletStore, formatAddress } from '$lib/stores/wallet.store';
	import { appStore } from '$lib/stores/app.store';
	import type { TokenBalance } from '$lib/types/wallet';
	import IconRefresh from '~icons/mdi/refresh';
	import { triggerHaptic, ImpactStyle } from '$lib/utils/helpers/haptics';
	import { ERROR_MESSAGES, TIMING } from '$lib/utils/constants/wallet.constants';

	type Props = {
		onSendToken?: (token: TokenBalance) => void;
		refreshTrigger?: number; // Trigger refresh when this changes
	};

	let { onSendToken, refreshTrigger = 0 }: Props = $props();

	let tokens = $state<TokenBalance[]>([]);
	let isLoading = $state(false);
	let isRefreshing = $state(false);
	let error = $state<string | null>(null);
	let isMounted = $state(true);
	let expandedTokens = $state<Set<string>>(new Set()); // Track which token details are expanded
	let lastRefreshTrigger = $state(0); // Track last refresh trigger to prevent infinite loops
	let hasLoadedTokens = $state(false); // Track if we've successfully loaded tokens at least once

	async function loadTokens(forceRefresh = false) {
		if (!isMounted || isLoading || isRefreshing) return;
		
		try {
			error = null;
			isLoading = true;
			
			// Use store function directly (handles caching and errors)
			tokens = await loadRSKTokenBalances(forceRefresh);
			
			if (!isMounted) return;
			
			// Mark as successfully loaded (even if empty array - API returned valid response)
			hasLoadedTokens = true;
			
			// If we got an empty array and refreshTrigger was set, reset it to prevent infinite loops
			if (tokens.length === 0 && refreshTrigger > 0) {
				// This means API returned empty array - don't keep retrying
				lastRefreshTrigger = refreshTrigger;
			}
		} catch (err) {
			if (!isMounted) return;
			
			const errorMessage = err instanceof Error ? err.message : String(err);
			
			// Check if this is a wallet initialization error
			if (errorMessage.includes(ERROR_MESSAGES.WALLET_NOT_INITIALIZED) ||
				errorMessage.includes(ERROR_MESSAGES.PROVIDER_DESTROYED) ||
				errorMessage.includes(ERROR_MESSAGES.UNSUPPORTED_OPERATION)) {
				// Wallet not ready - parent page will handle reinitialization
				error = 'Waiting for wallet to initialize...';
			} else {
				error = errorMessage || $t('wallet.debug_wallet.error');
				// Only show toast for non-initialization errors
				if (import.meta.env.DEV) {
					console.error('[DebugWalletAssetList] Failed to load tokens:', err);
				}
				// Don't show toast on every retry - only show once
				if (!hasLoadedTokens) {
					appStore.showErrorToast(error);
				}
			}
		} finally {
			if (isMounted) {
				isLoading = false;
			}
		}
	}

	async function handleRefresh() {
		if (isRefreshing || !isMounted) return;

		triggerHaptic(ImpactStyle.Light);
		isRefreshing = true;
		try {
			await loadTokens(true); // Force refresh
			if (isMounted) {
				appStore.showSuccessToast($t('wallet.balance_refreshed'));
			}
		} catch (err) {
			console.error('Failed to refresh:', err);
		} finally {
			if (isMounted) {
				isRefreshing = false;
			}
		}
	}

	function handleSend(token: TokenBalance) {
		if (onSendToken) {
			triggerHaptic(ImpactStyle.Light);
			onSendToken(token);
		}
	}

	// Reactive token loading when wallet becomes ready or refresh is triggered
	// Simplified: only load when wallet is connected and not initializing
	// Wrapped in error boundary to prevent crashes
	$effect(() => {
		try {
			const isConnected = $walletStore.isConnected;
			const isInitializing = $walletStore.isInitializing;
			const hasAddress = !!$walletStore.rsk?.address;
			const currentRefreshTrigger = refreshTrigger;
			
			// Only load if:
			// 1. Wallet is ready
			// 2. Not already loading/refreshing
			// 3. Either we have no tokens, OR refresh trigger actually changed
			if (isMounted && isConnected && !isInitializing && hasAddress && !isLoading && !isRefreshing) {
				const shouldLoad = tokens.length === 0 || (currentRefreshTrigger > 0 && currentRefreshTrigger !== lastRefreshTrigger);
				
				if (shouldLoad) {
					// Update last refresh trigger BEFORE loading to prevent duplicate calls
					lastRefreshTrigger = currentRefreshTrigger;
					loadTokens(true).catch(err => {
						if (import.meta.env.DEV) {
							console.error('[DebugWalletAssetList] Error loading tokens:', err);
						}
					});
				}
			}
		} catch (error) {
			if (import.meta.env.DEV) {
				console.error('[DebugWalletAssetList] Error in $effect:', error);
			}
		}
	});

	onMount(() => {
		isMounted = true;
		// Load tokens if wallet is already connected
		if ($walletStore.isConnected && !$walletStore.isInitializing && $walletStore.rsk?.address) {
			loadTokens();
		}
	});

	onDestroy(() => {
		isMounted = false;
	});
</script>

<div class="space-y-3 sm:space-y-4">
	<!-- Header with refresh button -->
	<div class="flex items-center justify-between mb-2">
		<h2 class="text-base font-semibold sm:text-lg">{$t('wallet.debug_wallet.asset_list.title')}</h2>
		<button
			class="btn btn-ghost btn-sm btn-circle touch-manipulation transition-transform duration-100 select-none active:scale-95"
			style="-webkit-tap-highlight-color: transparent;"
			onclick={handleRefresh}
			disabled={isRefreshing}
			aria-label={$t('wallet.debug_wallet.refresh')}
		>
			<IconRefresh class="h-5 w-5 {isRefreshing ? 'animate-spin' : ''}" />
		</button>
	</div>

	<!-- Loading state -->
	{#if isLoading}
		<div class="flex justify-center py-8">
			<span class="loading loading-spinner loading-lg"></span>
		</div>
	<!-- Error state -->
	{:else if error}
		<div class="alert alert-outline alert-error py-2 sm:py-4">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-6 w-6 shrink-0 stroke-current"
				fill="none"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<span class="text-sm sm:text-base">{error}</span>
		</div>
	<!-- Empty state -->
	{:else if tokens.length === 0}
		<div class="border-base-300 bg-base-200 rounded-lg border p-4 sm:p-6 text-center">
			<p class="font-medium text-sm sm:text-base">{$t('wallet.debug_wallet.no_assets')}</p>
			<p class="text-xs opacity-70 mt-2 sm:text-sm">{$t('wallet.debug_wallet.no_assets_description')}</p>
		</div>
	<!-- Token list -->
	{:else}
		<div class="space-y-3 sm:space-y-4">
			{#each tokens as token}
				<div class="border-base-300 bg-base-100 rounded-lg border p-3 sm:p-4">
					<div class="space-y-3 sm:space-y-4">
						<!-- Token header with icon, name, and type badge -->
						<div class="flex items-center justify-between gap-2">
							<div class="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
								{#if token.icon}
									<span class="text-xl sm:text-2xl shrink-0">{token.icon}</span>
								{:else}
									<div class="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-base-300 flex items-center justify-center shrink-0">
										<span class="text-xs font-semibold sm:text-sm">{token.symbol.slice(0, 2)}</span>
									</div>
								{/if}
								<div class="min-w-0 flex-1">
									<h3 class="font-semibold text-sm sm:text-base truncate">{token.name}</h3>
									<p class="text-xs opacity-70 sm:text-sm truncate">{token.symbol}</p>
								</div>
							</div>
							<span class="badge badge-sm shrink-0" class:badge-primary={token.isNative}>
								{token.isNative
									? $t('wallet.debug_wallet.asset_list.native_token')
									: $t('wallet.debug_wallet.asset_list.erc20_token')}
							</span>
						</div>

						<!-- Balance display card (inspired by payment details amount display) -->
						<div class="border-primary bg-base-200 flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 sm:p-4">
							<span class="text-center text-xs opacity-70">{$t('wallet.debug_wallet.asset_list.balance')}</span>
							<div class="flex w-full items-center justify-center gap-1.5 flex-wrap">
								<span class="text-primary text-xl font-bold sm:text-2xl">
									{token.formattedBalance} {token.symbol}
								</span>
								{#if token.usdValue !== undefined && token.usdValue > 0}
									<span class="text-xs opacity-60 sm:text-sm">
										≈ ${token.usdValue.toFixed(2)}
									</span>
								{/if}
							</div>
						</div>

						<!-- Token details (collapsible for ERC-20 tokens) -->
						{#if !token.isNative}
							{@const isExpanded = expandedTokens.has(token.address)}
							<div class="collapse-arrow border-base-300 bg-base-100 collapse rounded-lg border" class:collapse-open={isExpanded} style="transition: none !important;">
								<button
									type="button"
									class="collapse-title min-h-0 px-3 py-2 text-left text-sm font-medium touch-manipulation select-none"
									style="-webkit-tap-highlight-color: transparent; transition: none !important;"
									onclick={() => {
										triggerHaptic(ImpactStyle.Light);
										const newExpanded = new Set(expandedTokens);
										if (isExpanded) {
											newExpanded.delete(token.address);
										} else {
											newExpanded.add(token.address);
										}
										expandedTokens = newExpanded;
									}}
								>
									<span>{$t('wallet.debug_wallet.asset_list.token_details')}</span>
								</button>
								<div class="collapse-content" style="transition: none !important;">
									<div class="space-y-1.5 px-3 pb-2">
										<div class="flex items-center justify-between text-xs opacity-70">
											<span>{$t('wallet.debug_wallet.asset_list.address')}:</span>
											<code class="text-xs font-mono break-all text-right ml-2">{formatAddress(token.address)}</code>
										</div>
										<div class="flex items-center justify-between text-xs opacity-70">
											<span>{$t('wallet.debug_wallet.asset_list.decimals')}:</span>
											<span class="font-semibold">{token.decimals}</span>
										</div>
									</div>
								</div>
							</div>
						{/if}

						<!-- Send button -->
						<button
							class="btn btn-primary w-full touch-manipulation transition-transform duration-100 select-none active:scale-95"
							style="-webkit-tap-highlight-color: transparent;"
							onclick={() => handleSend(token)}
							disabled={!onSendToken}
						>
							{$t('wallet.debug_wallet.asset_list.send')}
						</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

