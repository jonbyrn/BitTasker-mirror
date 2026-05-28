<script lang="ts">
	import { t } from 'svelte-i18n';
	import WalletIcon from '../WalletIcon.svelte';

	export interface DocWalletEntry {
		walletId: string;
		walletName: string;
		walletType: 'builtin' | 'metamask' | 'walletconnect' | 'trezor' | 'ledger';
		docBalance: number;
		balanceAvailable: boolean;
		address?: string;
	}

	let {
		docWallets = [],
		isLoading = false,
		onPayOff,
		onRequestNewLoan
	}: {
		docWallets: DocWalletEntry[];
		isLoading: boolean;
		onPayOff: (wallet: DocWalletEntry) => void;
		onRequestNewLoan?: () => void;
	} = $props();

	let builtinWallet: DocWalletEntry | undefined = $derived(
		docWallets.find((w) => w.walletType === 'builtin' && w.docBalance > 0)
	);
	let connectedWallets: DocWalletEntry[] = $derived(
		docWallets.filter((w) => w.walletType !== 'builtin' && w.docBalance > 0)
	);
	let hasAnyLoans = $derived(docWallets.some((w) => w.docBalance > 0));
</script>

{#if isLoading}
	<div class="space-y-3" aria-busy="true">
		{#each [1, 2, 3] as i (i)}
			<div class="card bg-base-200 rounded-box">
				<div class="card-body p-4">
					<div class="flex items-center gap-3">
						<div class="skeleton h-8 w-8 rounded-full"></div>
						<div class="flex-1 space-y-2">
							<div class="skeleton h-4 w-32 rounded"></div>
							<div class="skeleton h-3 w-24 rounded"></div>
						</div>
					</div>
				</div>
			</div>
		{/each}
	</div>
{:else if !hasAnyLoans}
	<div class="flex flex-col items-center gap-4 py-8">
		<svg
			class="text-base-content/30 h-16 w-16"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
			aria-hidden="true"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="1.5"
				d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
			/>
		</svg>
		<div class="text-lg font-semibold">{$t('wallet.loan.existing_empty_title')}</div>
		<div class="text-base-content/60 max-w-xs text-center text-sm">
			{$t('wallet.loan.existing_empty_desc')}
		</div>

		<!-- Marketing / How it works -->
		<div class="card bg-base-200 rounded-box w-full max-w-sm">
			<div class="card-body space-y-3 p-4">
				<div class="flex items-start gap-3">
					<div class="bg-success/10 rounded-full p-1.5">
						<svg class="text-success h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
					</div>
					<div>
						<div class="text-sm font-medium">{$t('wallet.loan.empty_how_feature1_title')}</div>
						<div class="text-base-content/60 text-xs">
							{$t('wallet.loan.empty_how_feature1_desc')}
						</div>
					</div>
				</div>
				<div class="flex items-start gap-3">
					<div class="bg-info/10 rounded-full p-1.5">
						<svg class="text-info h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M13 10V3L4 14h7v7l9-11h-7z"
							/>
						</svg>
					</div>
					<div>
						<div class="text-sm font-medium">{$t('wallet.loan.empty_how_feature2_title')}</div>
						<div class="text-base-content/60 text-xs">
							{$t('wallet.loan.empty_how_feature2_desc')}
						</div>
					</div>
				</div>
				<div class="flex items-start gap-3">
					<div class="bg-primary/10 rounded-full p-1.5">
						<svg class="text-primary h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
							/>
						</svg>
					</div>
					<div>
						<div class="text-sm font-medium">{$t('wallet.loan.empty_how_feature3_title')}</div>
						<div class="text-base-content/60 text-xs">
							{$t('wallet.loan.empty_how_feature3_desc')}
						</div>
					</div>
				</div>
			</div>
		</div>

		{#if onRequestNewLoan}
			<button class="btn btn-primary min-h-[44px] w-full max-w-sm" onclick={onRequestNewLoan}>
				{$t('wallet.loan.tab_new_loan')}
			</button>
		{/if}
	</div>
{:else}
	<div class="space-y-4">
		<h3 class="text-sm font-semibold">{$t('wallet.loan.existing_title')}</h3>

		{#if builtinWallet}
			<div class="card bg-base-200 rounded-box">
				<div class="card-body flex flex-row items-center gap-3 p-4">
					<div class="bg-primary/10 rounded-full p-2">
						<svg class="text-primary h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
							/>
						</svg>
					</div>
					<div class="min-w-0 flex-1">
						<div class="text-sm font-medium">{builtinWallet.walletName}</div>
						<div class="text-base-content/60 text-xs">
							{$t('wallet.loan.existing_doc_balance', {
								values: {
									amount: builtinWallet.docBalance.toFixed(2),
									usd: builtinWallet.docBalance.toFixed(2)
								}
							})}
						</div>
					</div>
					<button
						class="btn btn-primary btn-sm min-h-[44px]"
						onclick={() => onPayOff(builtinWallet)}
					>
						{$t('wallet.loan.existing_pay_off')}
					</button>
				</div>
			</div>
		{/if}

		{#each connectedWallets as cw (cw.walletId)}
			<div class="card bg-base-200 rounded-box">
				<div class="card-body flex flex-row items-center gap-3 p-4">
					<div class="bg-info/10 rounded-full p-2">
						<WalletIcon walletType={cw.walletType} className="h-5 w-5" />
					</div>
					<div class="min-w-0 flex-1">
						<div class="text-sm font-medium">{cw.walletName}</div>
						{#if cw.address}
							<div class="text-base-content/50 font-mono text-xs">
								...{cw.address.slice(-6)}
							</div>
						{/if}
						{#if cw.balanceAvailable}
							<div class="text-base-content/60 text-xs">
								{$t('wallet.loan.existing_doc_balance', {
									values: {
										amount: cw.docBalance.toFixed(2),
										usd: cw.docBalance.toFixed(2)
									}
								})}
							</div>
						{:else}
							<div class="text-base-content/50 text-xs italic">
								{$t('wallet.loan.existing_balance_unavailable')}
							</div>
						{/if}
					</div>
					{#if cw.balanceAvailable && cw.docBalance > 0}
						<button class="btn btn-primary btn-sm min-h-[44px]" onclick={() => onPayOff(cw)}>
							{$t('wallet.loan.existing_pay_off')}
						</button>
					{/if}
				</div>
			</div>
		{/each}
	</div>
{/if}
