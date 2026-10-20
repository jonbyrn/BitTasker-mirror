<script lang="ts">
	import { setContext, onMount } from 'svelte';
	import { nip19 } from 'nostr-tools';
	import { t } from 'svelte-i18n';
	import { getAllKeys, restoreUnlockedSession } from '$lib/utils/nostrKeys';

	let { children } = $props();

	let npub = $state('');
	let nsec = $state('');
	let mnemonic = $state('');
	let keysReady = $state(false);
	let error = $state('');
	let loading = $state(true);
	let needsUnlock = $state(false);

	setContext('settings', {
		get npub() {
			return npub;
		},
		get nsec() {
			return nsec;
		},
		get mnemonic() {
			return mnemonic;
		},
		get keysReady() {
			return keysReady;
		},
		get error() {
			return error;
		}
	});

	onMount(async () => {
		await loadKeys(false);
	});

	async function loadKeys(prompt: boolean) {
		try {
			loading = true;
			error = '';
			needsUnlock = false;

			if (!prompt) {
				const restored = await restoreUnlockedSession();
				if (!restored) {
					needsUnlock = true;
					return;
				}
			}

			const keys = await getAllKeys();

			let encodedNpub = keys.npub;
			if (!encodedNpub.startsWith('npub')) {
				try {
					encodedNpub = nip19.npubEncode(encodedNpub);
				} catch {
					// Already in correct format or invalid
				}
			}
			npub = encodedNpub;

			try {
				nsec = nip19.nsecEncode(keys.nsec);
			} catch (err) {
				console.error('Error encoding nsec:', err);
			}

			mnemonic = keys.mnemonic || '';
			keysReady = true;
		} catch (err) {
			console.error('Error loading keys:', err);
			error = err instanceof Error ? err.message : $t('settings.error.loadKeys');
		} finally {
			loading = false;
		}
	}
</script>

<div class="settings-content mx-auto h-full max-w-6xl px-2 py-6 md:px-0 md:py-0">
	<div class="mb-6">
		<h3>{$t('settings.title')}</h3>
		<p class="text-base-content/70">{$t('settings.subtitle')}</p>
	</div>

	{#if needsUnlock}
		<div class="alert alert-outline mb-6 flex flex-col items-start gap-3">
			<p>
				Unlock your passkey to view signing keys. Navigation does not ask again once this tab is
				unlocked.
			</p>
			<button class="btn btn-primary btn-sm" onclick={() => loadKeys(true)}
				>Load signing keys</button
			>
		</div>
	{:else if loading}
		<div class="flex flex-col items-center justify-center gap-3 py-12">
			<div class="loading loading-spinner loading-lg"></div>
		</div>
	{:else if error}
		<div
			class="alert alert-error alert-outline mb-6 flex w-fit min-w-full flex-col items-start px-5 sm:min-w-1/2"
		>
			<p>{$t(error)}</p>
			<button class="btn btn-sm btn-outline place-self-end" onclick={() => loadKeys(true)}>
				{$t('settings.retry')}
			</button>
		</div>
	{:else}
		{@render children()}
	{/if}
</div>
