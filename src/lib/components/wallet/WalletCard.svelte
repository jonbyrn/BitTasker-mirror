<script lang="ts">
	import { t } from 'svelte-i18n';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import { formatAddress } from '$lib/stores/wallet.store';
	import type { ConnectedWalletEntry } from '$lib/stores/connected-wallets.store';
	import {
		formatSatsWithUsd as fmtSatsWithUsd,
		stableInnerFormat as fmtStableInner,
		stableWalletAvailableUsd as fmtStableUsd
	} from './wallet-formatters';
	import IconContentCopy from '~icons/mdi/content-copy';
	import IconClose from '~icons/mdi/close';
	import IconCheck from '~icons/mdi/check';
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
		const hasBalance =
			Number(rbtcRaw) + Number(btcRaw) > 0 ||
			Number(usdtRaw) > 0 ||
			Number(wbtcRaw) > 0 ||
			Number(tbtcRaw) > 0;
		if (hasBalance) {
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
	// Formatting wrappers — delegate to shared wallet-formatters.ts utilities
	// ---------------------------------------------------------------------------

	function formatSatsWithUsd(rawSats: string | number | undefined | null): string {
		return fmtSatsWithUsd(rawSats, satsFormatter, usdFormatter, btcPrice.price);
	}

	function stableInnerFormat(
		w: {
			id: string;
			balances: Record<string, { raw: string; formatted: string; loading: boolean }> | undefined;
		},
		key: string
	): string {
		return fmtStableInner(
			w,
			key,
			lastKnownWalletBalances,
			satsFormatter,
			usdFormatter,
			btcPrice.price
		);
	}

	function stableWalletAvailableUsd(w: {
		id: string;
		balances: Record<string, { raw: string; formatted: string; loading: boolean }> | undefined;
	}): string {
		return fmtStableUsd(w, lastKnownWalletBalances, usdFormatter, btcPrice.price);
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
				return sats > 0
					? `${satsFormatter.format(sats)} ${$t('wallet.sats')}`
					: `0 ${$t('wallet.sats')}`;
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
				aria-label={$t('wallet.connected.copy_address_title')}
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
				/>
			</button>

			<!-- BTC address (only shown when Bitcoin is connected and address available) -->
			{#if btcConnected && btcAddress}
				<button
					type="button"
					class="hover:bg-base-200 focus-visible:ring-primary flex w-full items-center gap-2 rounded p-1.5 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
					onclick={() => onCopy(btcAddress)}
					aria-label={$t('wallet.connected.copy_address_title')}
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
					/>
				</button>
			{/if}

			<!-- Connect Bitcoin / Disconnect buttons -->
			<div class="flex flex-wrap items-center justify-end gap-2">
				{#if isHardwareWallet}
					{#if btcConnected}
						<button class="btn btn-outline btn-sm min-h-[44px]" disabled>
							<img src="/images/chains/Bitcoin.svg" alt="BTC" class="h-4 w-4" />
							<IconCheck class="text-success h-4 w-4" />
							{$t('wallet.connected.connected_label')}
						</button>
					{:else}
						<button
							class="btn btn-outline btn-sm min-h-[44px]"
							onclick={() => onConnectBitcoin(wallet.walletType as 'ledger' | 'trezor')}
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
