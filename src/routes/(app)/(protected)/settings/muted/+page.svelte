<script lang="ts">
	import { resolve } from '$app/paths';
	import { getContext, onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { SvelteSet } from 'svelte/reactivity';
	import { t } from 'svelte-i18n';
	import { muteStore } from '$lib/stores/mute.store';
	import { unmutePubkey } from '$lib/nostr/muteList';
	import { fetchProfileMetadata } from '$lib/nostr/profile';
	import { appStore } from '$lib/stores/app.store';

	const settings = getContext<{
		keysReady: boolean;
		error: string;
	}>('settings');

	const mutedPubkeys = $derived(Array.from($muteStore.mutedPubkeys));
	let profileCache = $state<Record<string, { name?: string; picture?: string } | null>>({});
	let unmutingSet = new SvelteSet<string>();

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
				.catch(() => {});
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

<div in:fly={{ x: 300, duration: 250, easing: cubicOut }}>
	<div class="mb-4">
		<a href={resolve('/settings')} class="btn btn-sm border-base-300 bg-base-200 gap-2 border">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-4 w-4"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"><polyline points="15 18 9 12 15 6" /></svg
			>
			{$t('settings.back')}
		</a>
	</div>

	{#if settings.keysReady}
		<div class="settings-sub-content bg-base-100 rounded-xl p-4 shadow-lg">
			<div class="mb-6">
				<h4 class="border-base-300 mb-4 border-b pb-2 text-lg font-semibold">
					{$t('settings.muted_users.title')}
					{#if mutedPubkeys.length > 0}
						<span class="text-base-content/60 ml-1 text-sm font-normal"
							>({mutedPubkeys.length})</span
						>
					{/if}
				</h4>
				<div>
					<p class="text-base-content/70 mb-4 text-sm">
						{$t('settings.muted_users.description')}
					</p>

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
		</div>
	{/if}
</div>
