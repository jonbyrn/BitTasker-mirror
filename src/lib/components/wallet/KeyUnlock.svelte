<script lang="ts">
	import { t } from 'svelte-i18n';
	import { refreshWalletLoginKind, walletLoginKind } from '$lib/utils/helpers/login-method';

	let {
		testId = 'unlock-wallet',
		passkeyLabel,
		keyLabel = '',
		busy = false,
		compact = false,
		embedded = false,
		onunlock
	}: {
		testId?: string;
		passkeyLabel: string;
		keyLabel?: string;
		busy?: boolean;
		compact?: boolean;
		/** Render inside another form. A nested form would swallow the unlock. */
		embedded?: boolean;
		onunlock: (nsec: string) => void | Promise<void>;
	} = $props();

	refreshWalletLoginKind();
	const keyLogin = $derived($walletLoginKind === 'nsec');
	let secret = $state('');
	const buttonClass = $derived(
		compact ? 'btn btn-primary btn-sm' : 'btn btn-primary min-h-12 w-full'
	);
	const keyText = $derived(
		keyLabel || $t('wallet.unlock_with_key', { default: 'Unlock with your key' })
	);

	function submit(event?: Event) {
		event?.preventDefault();
		void onunlock(secret.trim());
	}
</script>

{#if keyLogin}
	{#if embedded}
		<div class="flex w-full flex-col gap-2" data-testid="nsec-unlock">
			<input
				class="input input-bordered w-full {compact ? 'input-sm' : ''}"
				type="password"
				name="nsec"
				autocomplete="off"
				autocapitalize="off"
				spellcheck="false"
				placeholder="nsec1…"
				aria-label={keyText}
				data-testid="nsec-unlock-input"
				bind:value={secret}
				onkeydown={(event) => {
					if (event.key === 'Enter') submit(event);
				}}
			/>
			<button
				class={buttonClass}
				type="button"
				disabled={busy}
				data-testid={testId}
				onclick={() => submit()}
			>
				{keyText}
			</button>
		</div>
	{:else}
		<form class="flex w-full flex-col gap-2" onsubmit={submit}>
			<input
				class="input input-bordered w-full {compact ? 'input-sm' : ''}"
				type="password"
				name="nsec"
				autocomplete="off"
				autocapitalize="off"
				spellcheck="false"
				placeholder="nsec1…"
				aria-label={keyText}
				data-testid="nsec-unlock-input"
				bind:value={secret}
			/>
			<button class={buttonClass} type="submit" disabled={busy} data-testid={testId}>
				{keyText}
			</button>
		</form>
	{/if}
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
