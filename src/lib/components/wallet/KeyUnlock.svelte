<script lang="ts">
	import { t } from 'svelte-i18n';
	import { walletUnlockRoute } from '$lib/utils/helpers/login-method';

	let {
		testId = 'unlock-wallet',
		passkeyLabel,
		busy = false,
		compact = false,
		onunlock
	}: {
		testId?: string;
		passkeyLabel: string;
		busy?: boolean;
		compact?: boolean;
		onunlock: (nsec: string) => void | Promise<void>;
	} = $props();

	const keyLogin = walletUnlockRoute() === 'nsec';
	let secret = $state('');
	const buttonClass = $derived(
		compact ? 'btn btn-primary btn-sm' : 'btn btn-primary min-h-12 w-full'
	);

	function submit(event: SubmitEvent) {
		event.preventDefault();
		void onunlock(secret.trim());
	}
</script>

{#if keyLogin}
	<form class="flex w-full flex-col gap-2" onsubmit={submit}>
		<input
			class="input input-bordered w-full {compact ? 'input-sm' : ''}"
			type="password"
			name="nsec"
			autocomplete="off"
			autocapitalize="off"
			spellcheck="false"
			placeholder="nsec1…"
			aria-label={$t('wallet.unlock_with_key')}
			data-testid="nsec-unlock-input"
			bind:value={secret}
		/>
		<button class={buttonClass} type="submit" disabled={busy} data-testid={testId}>
			{$t('wallet.unlock_with_key')}
		</button>
	</form>
{:else}
	<button
		class={buttonClass}
		type="button"
		disabled={busy}
		data-testid={testId}
		onclick={() => void onunlock('')}
	>
		{passkeyLabel}
	</button>
{/if}
