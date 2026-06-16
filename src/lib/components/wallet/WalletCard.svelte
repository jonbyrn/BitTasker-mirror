<script lang="ts">
	import { t } from 'svelte-i18n';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import { formatAddress } from '$lib/stores/wallet.store';
	import type { ConnectedWalletEntry } from '$lib/stores/connected-wallets.store';
	import IconContentCopy from '~icons/mdi/content-copy';
	import IconClose from '~icons/mdi/close';
	import WalletIcon from './WalletIcon.svelte';

	let {
		wallet,
		balancesHidden = false,
		expanded = false,
		btcConnected = false,
		btcAddress = null as string | null,
		copiedAddress = null as string | null,
		satsFormatter,
		usdFormatter,
		onExpand,
		onCopy,
		onConnectBitcoin,
		onDisconnect
	}: {
		wallet: ConnectedWalletEntry;
		balancesHidden?: boolean;
		expanded?: boolean;
		btcConnected?: boolean;
		btcAddress?: string | null;
		copiedAddress?: string | null;
		satsFormatter: Intl.NumberFormat;
		usdFormatter: Intl.NumberFormat;
		onExpand: () => void;
		onCopy: (addr: string) => Promise<void>;
		onConnectBitcoin: (type: 'ledger' | 'trezor') => void;
		onDisconnect: () => void;
	} = $props();

	// ---------------------------------------------------------------------------
	// Per-wallet balance cache — module-level for fallback during refresh gaps
	// ---------------------------------------------------------------------------
	let lastKnownWalletBalances: Record<
		string,
		{ rbtc: string; btc: string; usdt: string; wbtc: string; tbtc: string }
	> = {};

	$effect(() => {
		const cur = wallet.balances;
		if (!cur) return;
		const rbtcRaw = cur.rbtc?.raw ?? '';
		const btcRaw = cur.btc?.raw ?? '';
		const usdtRaw = cur['usdt0-arb']?.raw ?? '';
		const wbtcRaw = cur.wbtc?.raw ?? '';
		const tbtcRaw = cur['tbtc-arb']?.raw ?? '';
		const sats = Number(rbtcRaw) + Number(btcRaw);
		const usdt = Number(usdtRaw);
		const wbtc = Number(wbtcRaw);
		const tbtc = Number(tbtcRaw);
		if (sats > 0 || usdt > 0 || wbtc > 0 || tbtc > 0) {
			lastKnownWalletBalances[wallet.id] = {
				rbtc: rbtcRaw,
				btc: btcRaw,
				usdt: usdtRaw,
				wbtc: wbtcRaw,
				tbtc: tbtcRaw
			};
		}
	});

	// ---------------------------------------------------------------------------
	// Formatting helpers
	// ---------------------------------------------------------------------------

	function formatSatsWithUsd(rawSats: string | number | undefined | null): string {
		const sats = Number(rawSats ?? 0);
		if (sats <= 0) return '0 Sats';
		const satsStr = satsFormatter.format(sats);
		const btc = sats / 100_000_000;
		const usd = btc * btcPrice.price;
		const usdStr = usdFormatter.format(usd);
		return `${satsStr} Sats (${usdStr})`;
	}

	/** Stable inner balance format — falls back to cached per-asset raw when live is zero */
	function stableInnerFormat(
		w: {
			id: string;
			balances: Record<string, { raw: string; formatted: string; loading: boolean }> | undefined;
		},
		key: string
	): string {
		const bal = w.balances?.[key];
		const raw = Number(bal?.raw ?? 0);
		if (raw > 0) {
			if (key === 'usdt0-arb' || key === 'usdt') return `$${(raw / 1e6).toFixed(2)}`;
			if (key === 'tbtc-arb') {
				const sats = Math.round(raw / 10_000_000_000);
				return sats > 0 ? `${satsFormatter.format(sats)} Sats` : '0 Sats';
			}
			return formatSatsWithUsd(raw);
		}
		const cached = lastKnownWalletBalances[w.id];
		if (cached) {
			const cachedRaw = Number((cached as Record<string, string>)[key] ?? 0);
			if (cachedRaw > 0) {
				if (key === 'usdt0-arb' || key === 'usdt') {
					return `$${(cachedRaw / 1e6).toFixed(2)}`;
				}
				if (key === 'tbtc-arb') {
					const sats = Math.round(cachedRaw / 10_000_000_000);
					return sats > 0 ? `${satsFormatter.format(sats)} Sats` : '0 Sats';
				}
				return formatSatsWithUsd(cachedRaw);
			}
		}
		if (key === 'usdt0-arb' || key === 'usdt') return '$0.00';
		if (key === 'tbtc-arb') return '0 Sats';
		return '0 Sats';
	}

	/** Stable display value for a wallet's accordion title */
	function stableWalletAvailableUsd(w: {
		id: string;
		balances: Record<string, { raw: string; formatted: string; loading: boolean }> | undefined;
	}): string {
		const cur = w.balances;
		if (cur) {
			const btcSats =
				Number(cur.btc?.raw ?? 0) + Number(cur.rbtc?.raw ?? 0) + Number(cur.wbtc?.raw ?? 0);
			const tbtcSats = Math.round(Number(cur['tbtc-arb']?.raw ?? 0) / 10_000_000_000);
			const usdtRaw = Number(cur['usdt0-arb']?.raw ?? 0);
			if (btcSats > 0 || usdtRaw > 0 || tbtcSats > 0) {
				return usdFormatter.format(
					((btcSats + tbtcSats) / 100_000_000) * btcPrice.price + usdtRaw / 1e6
				);
			}
		}
		const cached = lastKnownWalletBalances[w.id];
		if (cached) {
			const tbtcSats = Math.round(Number(cached.tbtc ?? 0) / 10_000_000_000);
			const usd =
				((Number(cached.rbtc) + Number(cached.btc) + Number(cached.wbtc) + tbtcSats) /
					100_000_000) *
					btcPrice.price +
				Number(cached.usdt) / 1e6;
			if (usd > 0) return usdFormatter.format(usd);
		}
		return usdFormatter.format(0);
	}

	// ---------------------------------------------------------------------------
	// Derived values
	// ---------------------------------------------------------------------------

	let isHardwareWallet = $derived(wallet.walletType === 'trezor' || wallet.walletType === 'ledger');

	let isEVM = $derived(
		wallet.walletType === 'metamask' || wallet.walletType === 'walletconnect' || isHardwareWallet
	);

	let balanceRows = $derived([
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
			key: 'wbtc',
			label: $t('wallet.wbtc_arbitrum'),
			img: '/images/chains/arbitrum.png',
			alt: 'WBTC',
			condition: isEVM,
			format: (v: unknown) => formatSatsWithUsd((v as { raw?: string | number })?.raw)
		},
		{
			key: 'usdt0-arb',
			label: $t('wallet.usdt0_arbitrum'),
			img: '/images/chains/arbitrum.png',
			alt: 'USDT0 (Arbitrum)',
			condition: isEVM,
			format: (v: unknown) => (v as { formatted?: string })?.formatted ?? '$0.00'
		},
		{
			key: 'tbtc-arb',
			label: $t('wallet.tbtc_arbitrum'),
			img: '/images/tokens/tbtc.png',
			alt: 'tBTC',
			condition: isEVM && Number(wallet.balances?.['tbtc-arb']?.raw ?? 0) > 0,
			format: (v: unknown) => {
				const bal = v as { raw?: string };
				const raw = Number(bal.raw ?? '0');
				const sats = Math.round(raw / 10_000_000_000);
				return sats > 0 ? `${satsFormatter.format(sats)} Sats` : '0 Sats';
			}
		}
	]);
</script>

<div
	class="collapse-arrow border-primary bg-base-100 collapse rounded-lg border-2"
	class:collapse-open={expanded}
>
	<button
		type="button"
		class="collapse-title flex min-h-0 items-center justify-between px-3 py-2 pr-10 text-left text-sm font-medium sm:px-4 sm:py-3 sm:pr-12 sm:text-base"
		onclick={onExpand}
		aria-expanded={expanded}
	>
		<div class="flex min-w-0 flex-1 items-center gap-2">
			<WalletIcon walletType={wallet.walletType} className="h-5 w-5 shrink-0 sm:h-6 sm:w-6" />
			<span class="truncate">{wallet.walletName}</span>
		</div>
		<span class="text-base-content/50 ml-2 shrink-0 text-right text-sm font-normal">
			{balancesHidden ? '••••' : stableWalletAvailableUsd(wallet)}
			{$t('wallet.connected.available_label')}
		</span>
	</button>
	<div class="collapse-content px-2">
		<div class="border-base-300 space-y-2 border-t pt-2">
			<!-- Balances: by wallet type + available chains -->
			<div class="space-y-1">
				{#each balanceRows.filter((r) => r.condition) as row (row.key)}
					<div class="flex items-center justify-between text-sm">
						<span class="flex items-center gap-1.5">
							<img src={row.img} alt={row.alt} class="h-4 w-4" />
							{row.label}
						</span>
						<span class="font-semibold"
							>{balancesHidden ? '••••' : stableInnerFormat(wallet, row.key)}</span
						>
					</div>
				{/each}
			</div>

			<div class="divider my-0"></div>

			<!-- EVM address row with chain indicator -->
			<button
				type="button"
				class="hover:bg-base-200 focus-visible:ring-primary flex w-full items-center gap-2 rounded p-1.5 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
				onclick={() => onCopy(wallet.address)}
				title={$t('wallet.connected.copy_address_title')}
			>
				<div class="text-base-content/40 flex items-center gap-1">
					<img src="/images/chains/Bitcoin-Rootstock-logo.webp" alt="RSK" class="h-3.5 w-3.5" />
					<span>{$t('wallet.connected.address_rbtc_usdt')}</span>
				</div>
				<span class="ml-auto truncate font-mono opacity-60">{formatAddress(wallet.address)}</span>
				<IconContentCopy
					class="h-4 w-4 shrink-0 transition-colors duration-300 {copiedAddress === wallet.address
						? 'text-success'
						: 'opacity-40'}"
					aria-hidden="true"
				/>
			</button>

			<!-- BTC address (only shown when Bitcoin is connected) -->
			{#if btcConnected}
				{#if btcAddress}
					<button
						type="button"
						class="hover:bg-base-200 focus-visible:ring-primary flex w-full items-center gap-2 rounded p-1.5 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
						onclick={() => onCopy(btcAddress)}
						title={$t('wallet.connected.copy_address_title')}
					>
						<div class="text-base-content/40 flex items-center gap-1">
							<img src="/images/chains/Bitcoin.svg" alt="BTC" class="h-3.5 w-3.5 shrink-0" />
							<span>{$t('wallet.connected.bitcoin_label')}</span>
						</div>
						<span class="ml-auto truncate text-right font-mono opacity-60"
							>{formatAddress(btcAddress)}</span
						>
						<IconContentCopy
							class="h-4 w-4 shrink-0 transition-colors duration-300 {copiedAddress === btcAddress
								? 'text-success'
								: 'opacity-40'}"
							aria-hidden="true"
						/>
					</button>
				{/if}
			{/if}

			<!-- Connect Bitcoin / Disconnect buttons -->
			<div class="flex flex-wrap items-center justify-end gap-2">
				{#if wallet.walletType === 'ledger'}
					{#if btcConnected}
						<button class="btn btn-outline btn-sm min-h-[44px]" disabled>
							<img src="/images/chains/Bitcoin.svg" alt="BTC" class="h-4 w-4" />
							<svg
								class="text-success h-4 w-4"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
								aria-hidden="true"
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
							onclick={() => onConnectBitcoin('ledger')}
						>
							<img src="/images/chains/Bitcoin.svg" alt="BTC" class="h-4 w-4" />
							{$t('wallet.connected.connect_bitcoin')}
						</button>
					{/if}
				{:else if wallet.walletType === 'trezor'}
					{#if btcConnected}
						<button class="btn btn-outline btn-sm min-h-[44px]" disabled>
							<img src="/images/chains/Bitcoin.svg" alt="BTC" class="h-4 w-4" />
							<svg
								class="text-success h-4 w-4"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
								aria-hidden="true"
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
							onclick={() => onConnectBitcoin('trezor')}
						>
							<img src="/images/chains/Bitcoin.svg" alt="BTC" class="h-4 w-4" />
							{$t('wallet.connected.connect_bitcoin')}
						</button>
					{/if}
				{/if}
				<button class="btn btn-ghost btn-sm text-error min-h-[44px]" onclick={() => onDisconnect()}>
					<IconClose class="mr-1 h-4 w-4" />
					{$t('wallet.connected.disconnect')}
				</button>
			</div>
		</div>
	</div>
</div>
