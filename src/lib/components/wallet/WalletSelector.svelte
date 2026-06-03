<script lang="ts">
	import { t } from 'svelte-i18n';
	import type { ConnectedWalletEntry } from '$lib/stores/connected-wallets.store';
	import WalletIcon from './WalletIcon.svelte';

	interface Props {
		label: string;
		selectedId: string;
		onSelect: (id: string) => void;
		builtinBalance: string;
		connectedWallets: ConnectedWalletEntry[];
		walletBalanceFor: (id: string) => string;
		expanded: boolean;
		onToggle: () => void;
	}

	let {
		label,
		selectedId,
		onSelect,
		builtinBalance,
		connectedWallets,
		walletBalanceFor,
		expanded,
		onToggle
	}: Props = $props();
</script>

<div class="form-control">
	<div
		class="collapse-arrow border-primary bg-base-100 collapse rounded-lg border-2"
		class:collapse-open={expanded}
	>
		<button
			type="button"
			class="collapse-title flex min-h-[44px] items-center gap-2 px-3 py-2.5 pr-10 pl-3 text-sm font-medium"
			onclick={onToggle}
			aria-expanded={expanded}
			aria-controls="wallet-selector-panel"
		>
			<span class="text-base-content/60" id="wallet-selector-title">{label}</span>
			{#if selectedId === 'builtin'}
				<img src="/images/chains/Bitcoin-Rootstock-logo.webp" alt="rBTC" class="h-5 w-5 shrink-0" />
				<span class="font-medium">{$t('wallet.builtin_wallet')}</span>
				<span class="text-base-content/50 ml-auto tabular-nums">{builtinBalance}</span>
			{:else}
				{@const w = connectedWallets.find((w) => w.id === selectedId)}
				{#if w}
					<WalletIcon walletType={w.walletType} />
					<span class="font-medium">{w.walletName}</span>
					<span class="text-base-content/40 ml-1 text-xs"
						>..{w.address.slice(-4).toLowerCase()}</span
					>
					<span class="text-base-content/50 ml-auto tabular-nums"
						>{walletBalanceFor(selectedId)}</span
					>
				{/if}
			{/if}
		</button>
		<div
			class="collapse-content px-2"
			id="wallet-selector-panel"
			role="region"
			aria-labelledby="wallet-selector-title"
		>
			<div class="space-y-1">
				<button
					class="flex w-full items-center gap-2 rounded-lg border-2 border-transparent p-2 transition-colors {selectedId ===
					'builtin'
						? 'bg-primary/10'
						: 'hover:bg-base-200'}"
					onclick={() => {
						onSelect('builtin');
						onToggle();
					}}
				>
					<img
						src="/images/chains/Bitcoin-Rootstock-logo.webp"
						alt="rBTC"
						class="h-5 w-5 shrink-0"
					/>
					<div class="min-w-0 flex-1 text-left">
						<div class="text-sm font-medium">{$t('wallet.builtin_wallet')}</div>
					</div>
					<span class="ml-auto shrink-0 text-xs font-semibold tabular-nums">{builtinBalance}</span>
				</button>
			</div>
			{#if connectedWallets.length > 0}
				<div class="divider my-1 text-xs">{$t('wallet.tab_connected')}</div>
			{/if}
			<div class="space-y-1">
				{#each connectedWallets as wallet (wallet.id)}
					<button
						class="flex w-full items-center gap-2 rounded-lg border-2 border-transparent p-2 transition-colors {selectedId ===
						wallet.id
							? 'bg-primary/10'
							: 'hover:bg-base-200'}"
						onclick={() => {
							onSelect(wallet.id);
							onToggle();
						}}
					>
						<WalletIcon walletType={wallet.walletType} />
						<div class="min-w-0 flex-1 text-left">
							<div class="text-sm font-medium">{wallet.walletName}</div>
							<div class="text-base-content/40 truncate text-xs">
								{wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
							</div>
						</div>
						<span class="ml-auto shrink-0 text-xs font-semibold tabular-nums"
							>{walletBalanceFor(wallet.id)}</span
						>
					</button>
				{/each}
			</div>
		</div>
	</div>
</div>
