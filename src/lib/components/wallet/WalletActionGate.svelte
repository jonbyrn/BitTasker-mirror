<script lang="ts">
	import { walletActionHold } from '$lib/stores/wallet/wallet-connection';
	import {
		retryWalletLink,
		unlockFromIndicator,
		walletConnectionStore
	} from '$lib/stores/wallet/wallet-link';

	let { testId = 'wallet-action-gate' }: { testId?: string } = $props();

	const hold = $derived(walletActionHold($walletConnectionStore));
	let failure = $state('');
	let busy = $state(false);

	async function unlock(): Promise<void> {
		busy = true;
		failure = '';
		try {
			const message = await unlockFromIndicator();
			failure = message ?? '';
		} finally {
			busy = false;
		}
	}

	async function retry(): Promise<void> {
		busy = true;
		failure = '';
		try {
			await retryWalletLink();
		} finally {
			busy = false;
		}
	}
</script>

{#if hold.hold}
	<div class="alert alert-warning alert-outline" role="status" data-testid={testId}>
		<div class="flex w-full flex-col items-start gap-2">
			<p data-testid="wallet-action-gate-message">{failure || hold.message}</p>
			{#if hold.needsUnlock}
				<button
					type="button"
					class="btn btn-primary btn-sm"
					disabled={busy}
					data-testid="wallet-action-unlock"
					onclick={() => void unlock()}
				>
					Unlock wallet to continue
				</button>
			{/if}
			{#if hold.needsRetry}
				<button
					type="button"
					class="btn btn-sm"
					disabled={busy}
					data-testid="wallet-action-retry"
					onclick={() => void retry()}
				>
					Retry
				</button>
			{/if}
		</div>
	</div>
{/if}
