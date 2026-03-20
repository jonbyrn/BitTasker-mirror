<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { t } from 'svelte-i18n';
	import { muteStore } from '$lib/stores/mute.store';
	import { unmutePubkey } from '$lib/nostr/muteList';
	import { fetchProfileMetadata } from '$lib/utils/nostr-message';
	import { appStore } from '$lib/stores/app.store';

	// Derived directly from the store — reactive, no effect needed
	const mutedPubkeys = $derived(Array.from($muteStore.mutedPubkeys));

	// Profile cache: pubkey → { name?, picture? }
	let profileCache = $state<Record<string, { name?: string; picture?: string } | null>>({});

	// Tracks which pubkeys are currently being unmuted
	let unmutingSet = new SvelteSet<string>();

	// Fetch profiles once on mount — safe to mutate $state here, outside any template expression
	onMount(() => {
		for (const pubkey of $muteStore.mutedPubkeys) {
			profileCache = { ...profileCache, [pubkey]: null };
			fetchProfileMetadata(pubkey)
				.then((profile) => {
					profileCache = {
						...profileCache,
						[pubkey]: { name: profile?.name, picture: profile?.picture }
					};
				})
				.catch(() => {
					// null entry already set — falls back to short pubkey in template
				});
		}
	});

	async function handleUnmute(pubkey: string) {
		unmutingSet.add(pubkey);
		try {
			await unmutePubkey(pubkey);
			appStore.showSuccessToast($t('settings.muted_users.unmuted_toast'));
		} catch {
			appStore.showErrorToast($t('settings.muted_users.unmute_error'));
		} finally {
			unmutingSet.delete(pubkey);
		}
	}

	function shortPubkey(pubkey: string): string {
		return pubkey.slice(0, 8) + '...' + pubkey.slice(-6);
	}
</script>

<div class="card bg-base-100 mb-6 shadow-xl">
	<div class="card-body">
		<h4 class="card-title">{$t('settings.muted_users.title')}</h4>
		<p class="text-base-content/70 mb-4 text-sm">{$t('settings.muted_users.description')}</p>

		{#if mutedPubkeys.length === 0}
			<div class="text-base-content/50 flex flex-col items-center gap-2 py-6 text-center">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-10 w-10"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="1.5"
						d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
					/>
				</svg>
				<p class="text-sm">{$t('settings.muted_users.empty')}</p>
			</div>
		{:else}
			<ul class="divide-base-300 divide-y">
				{#each mutedPubkeys as pubkey (pubkey)}
					{@const profile = profileCache[pubkey]}
					{@const displayName = profile?.name ?? shortPubkey(pubkey)}
					{@const isUnmuting = unmutingSet.has(pubkey)}

					<li class="flex items-center justify-between gap-3 py-3">
						<div class="flex min-w-0 flex-1 items-center gap-3">
							<div class="avatar">
								<div class="bg-base-300 h-9 w-9 rounded-full">
									{#if profile?.picture}
										<img src={profile.picture} alt={displayName} />
									{:else}
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="text-base-content/40 h-full w-full p-2"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											aria-hidden="true"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
											/>
										</svg>
									{/if}
								</div>
							</div>
							<div class="min-w-0">
								<p class="truncate text-sm font-medium">{displayName}</p>
								<p class="text-base-content/50 truncate font-mono text-xs">
									{shortPubkey(pubkey)}
								</p>
							</div>
						</div>

						<button
							class="btn btn-ghost btn-sm shrink-0"
							onclick={() => handleUnmute(pubkey)}
							disabled={isUnmuting}
							aria-label={$t('settings.muted_users.unmute_aria', {
								values: { name: displayName }
							})}
						>
							{#if isUnmuting}
								<span class="loading loading-spinner loading-xs"></span>
							{:else}
								{$t('settings.muted_users.unmute')}
							{/if}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>
