<script lang="ts">
	import { t } from 'svelte-i18n';
	import { user } from '$lib/stores/user.store';
	import { clickOutside } from '$lib/utils/clickOutside';
	import {
		shortAccount,
		type RailHealth,
		type WalletPhase
	} from '$lib/stores/wallet/wallet-connection';
	import {
		retryWalletLink,
		unlockFromIndicator,
		walletConnectionStore
	} from '$lib/stores/wallet/wallet-link';
	import KeyUnlock from '$lib/components/wallet/KeyUnlock.svelte';
	import { walletStatusMessageKey } from '$lib/i18n/wallet-status-label';

	let { name = '' }: { name?: string } = $props();

	let open = $state(false);
	let unlockError = $state('');
	let busy = $state(false);

	function walletText(value: string): string {
		const key = walletStatusMessageKey(value);
		if (!key) return value;
		const translated = $t(key);
		return translated === key ? value : translated;
	}

	const status = $derived($walletConnectionStore);
	const accountName = $derived(name.trim() || $user.name.trim());
	const accountKey = $derived(shortAccount($user.npub || ''));
	const balanceText = $derived(
		status.balanceHidden
			? walletText('Unlock to see the balance')
			: `${formatSats(status.sats)} sats · $${status.usdtText} USDT`
	);

	function headerLightClass(phase: WalletPhase): string {
		if (phase === 'ready') return 'bg-success';
		if (phase === 'syncing' || phase === 'unlocking') return 'bg-warning';
		return 'bg-error';
	}

	function dotClass(tone: RailHealth): string {
		if (tone === 'ready') return 'bg-success';
		if (tone === 'syncing' || tone === 'locked') return 'bg-warning';
		return 'bg-error';
	}

	function formatSats(value: number): string {
		return new Intl.NumberFormat('en-US').format(Math.max(0, Math.round(value)));
	}

	async function unlock(nsec = ''): Promise<void> {
		busy = true;
		unlockError = '';
		try {
			const message = await unlockFromIndicator(nsec);
			unlockError = message ?? '';
			if (!message) open = false;
		} finally {
			busy = false;
		}
	}

	async function retry(): Promise<void> {
		busy = true;
		unlockError = '';
		try {
			await retryWalletLink();
		} finally {
			busy = false;
		}
	}

	function phaseLabel(phase: WalletPhase): string {
		return phase;
	}
</script>

<div class="relative shrink-0" use:clickOutside={{ callback: () => (open = false) }}>
	<button
		type="button"
		class="btn btn-ghost btn-circle tooltip tooltip-left shrink-0"
		aria-label={walletText(status.headline)}
		data-tip={walletText(status.headline)}
		aria-haspopup="dialog"
		aria-expanded={open}
		data-testid="wallet-status-indicator"
		onclick={() => (open = !open)}
	>
		<span
			class="inline-block h-3 w-3 rounded-full {headerLightClass(status.phase)}"
			data-testid="wallet-status-dot"
			data-phase={phaseLabel(status.phase)}
		></span>
	</button>
	{#if open}
		<div
			class="bg-base-100 border-base-300 rounded-box absolute top-full right-0 z-50 mt-2 w-80 max-w-[calc(100vw-1.5rem)] border p-3 shadow-lg"
			role="dialog"
			aria-label={$t('navbar.wallet_lock.status')}
			data-testid="wallet-status-panel"
		>
			{#if status.phase !== 'logged-out'}
				<p class="text-sm font-semibold" data-testid="wallet-status-panel-account">
					{accountName || $t('navbar.wallet_lock.account')}
				</p>
				{#if accountKey}
					<p class="text-base-content/60 font-mono text-xs">{accountKey}</p>
				{/if}
			{/if}
			<p class="mt-1 text-sm" data-testid="wallet-status-panel-headline">
				{walletText(status.headline)}
			</p>
			{#if unlockError}
				<p class="text-error mt-2 text-sm" data-testid="wallet-status-unlock-error">
					{unlockError}
				</p>
			{/if}
			<ul class="mt-3 flex flex-col gap-2">
				{#each status.rails as rail (rail.id)}
					<li class="flex items-start gap-2 text-sm" data-testid="wallet-rail-{rail.id}">
						<span
							class="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full {dotClass(rail.health)}"
						></span>
						<span>
							<span class="font-medium">{rail.label}</span>
							<span class="text-base-content/70 block">{walletText(rail.detail)}</span>
						</span>
					</li>
				{/each}
			</ul>
			<p class="mt-3 text-sm" data-testid="wallet-status-balance">{balanceText}</p>
			<div class="mt-3 flex gap-2">
				{#if status.phase === 'locked' || (status.phase === 'error' && status.reason !== 'No connection')}
					<KeyUnlock
						compact
						testId="wallet-status-unlock"
						passkeyLabel={$t('navbar.wallet_lock.unlock')}
						{busy}
						onunlock={(nsec) => unlock(nsec)}
					/>
				{/if}
				{#if status.phase === 'error' || status.phase === 'locked'}
					<button
						type="button"
						class="btn btn-outline btn-sm"
						disabled={busy}
						data-testid="wallet-status-retry"
						onclick={() => void retry()}
					>
						{$t('navbar.wallet_lock.retry')}
					</button>
				{/if}
			</div>
		</div>
	{/if}
</div>
