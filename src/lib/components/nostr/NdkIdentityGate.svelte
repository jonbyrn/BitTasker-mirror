<script lang="ts">
	import type { Snippet } from 'svelte';
	import { t } from 'svelte-i18n';
	import IconRefresh from '~icons/mdi/refresh';
	import IconAccountKey from '~icons/mdi/account-key';
	import IconLockAlert from '~icons/mdi/lock-alert';
	import { ndk, setNDKSigner } from '$lib/nostr/ndk';

	let { children }: { children: Snippet } = $props();

	let retrying = $state(false);
	let unlockError = $state<string | null>(null);
	let isUnlocking = $state(false);
	const hasSigner = $derived(Boolean(ndk.$currentPubkey));

	async function loadKeys() {
		isUnlocking = true;
		unlockError = null;
		try {
			await setNDKSigner();
		} catch (error) {
			unlockError = error instanceof Error ? error.message : 'Unable to unlock Nostr identity';
		} finally {
			isUnlocking = false;
		}
	}

	async function retry() {
		retrying = true;
		try {
			await loadKeys();
		} finally {
			retrying = false;
		}
	}
</script>

{#if hasSigner}
	{@render children()}
{:else if unlockError}
	<div class="flex justify-center py-10 sm:py-14">
		<div
			class="card bg-base-100 border-error/25 w-full max-w-md border shadow-lg"
			role="alert"
			aria-live="polite"
		>
			<div class="card-body items-center gap-5 pt-8 pb-6 text-center">
				<div
					class="bg-error/15 text-error ring-error/20 flex h-20 w-20 items-center justify-center rounded-2xl ring-2"
				>
					<IconLockAlert class="h-11 w-11 shrink-0" />
				</div>
				<div class="space-y-2">
					<h3 class="text-lg font-semibold">
						{$t('dashboard.contracts.ndk_identity.error_title')}
					</h3>
					{#if unlockError}
						<p class="text-error/90 text-sm leading-relaxed wrap-break-word">
							{unlockError}
						</p>
					{/if}
				</div>
				<button
					type="button"
					class="btn btn-primary gap-2"
					onclick={retry}
					disabled={retrying}
					aria-label={$t('dashboard.contracts.retry')}
				>
					{#if retrying}
						<span class="loading loading-spinner loading-sm"></span>
					{:else}
						<IconRefresh class="h-5 w-5" />
					{/if}
					{$t('dashboard.contracts.retry')}
				</button>
			</div>
		</div>
	</div>
{:else if isUnlocking}
	<div class="flex justify-center py-10 sm:py-14">
		<div
			class="card bg-base-100 border-base-300/70 w-full max-w-md border shadow-md"
			aria-busy="true"
			aria-live="polite"
		>
			<div class="card-body items-center gap-6 pt-10 pb-8 text-center">
				<div
					class="from-primary/25 to-primary/5 text-primary ring-primary/25 relative flex h-24 w-24 items-center justify-center rounded-full bg-linear-to-br ring-2"
				>
					<IconAccountKey class="h-14 w-14 shrink-0 drop-shadow-sm" />
					<span
						class="bg-base-100 border-primary/30 absolute -right-1 -bottom-1 flex h-9 w-9 items-center justify-center rounded-full border shadow-sm"
					>
						<span class="loading loading-spinner loading-sm text-primary"></span>
					</span>
				</div>
				<div class="space-y-1.5">
					<p class="text-base-content font-medium">
						{$t('dashboard.contracts.ndk_identity.loading')}
					</p>
					<p class="text-base-content/60 text-sm">
						{$t('dashboard.contracts.ndk_identity.loading_hint')}
					</p>
				</div>
			</div>
		</div>
	</div>
{:else}
	<div class="flex justify-center py-10 sm:py-14">
		<div class="card bg-base-100 border-base-300/70 w-full max-w-md border shadow-md">
			<div class="card-body items-center gap-5 pt-8 pb-6 text-center">
				<div
					class="from-primary/20 to-primary/5 text-primary ring-primary/20 flex h-24 w-24 items-center justify-center rounded-full bg-linear-to-br ring-2"
				>
					<IconAccountKey class="h-14 w-14 shrink-0 drop-shadow-sm" />
				</div>
				<div class="space-y-2">
					<h3 class="text-lg font-semibold">
						{$t('dashboard.contracts.ndk_identity.cta_title')}
					</h3>
					<p class="text-base-content/70 text-sm leading-relaxed">
						{$t('dashboard.contracts.ndk_identity.cta_description')}
					</p>
				</div>
				<button
					type="button"
					class="btn btn-primary gap-2"
					onclick={loadKeys}
					aria-label={$t('dashboard.contracts.ndk_identity.load_keys')}
				>
					<IconAccountKey class="h-5 w-5" />
					{$t('dashboard.contracts.ndk_identity.load_keys')}
				</button>
			</div>
		</div>
	</div>
{/if}
