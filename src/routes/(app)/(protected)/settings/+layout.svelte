<script lang="ts">
	import { setContext, onMount } from 'svelte';
	import { nip19 } from 'nostr-tools';
	import { t } from 'svelte-i18n';
	import { get } from 'svelte/store';
	import { appStore } from '$lib/stores/app.store';
	import { getAllKeys, restoreUnlockedSession } from '$lib/utils/nostrKeys';
	import { PASSKEY_UNLOCK_REQUIRED, withPasskeyPrompt } from '$lib/utils/keys/passkey-policy';
	import { settingsKeyErrorMessage } from '$lib/utils/settings/settings-key-error';

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

	function applySigner(npubValue: string, nsecBytes: Uint8Array, mnemonicValue: string) {
		let encodedNpub = npubValue;
		if (!encodedNpub.startsWith('npub')) {
			try {
				encodedNpub = nip19.npubEncode(encodedNpub);
			} catch {
				// Already in correct format or invalid
			}
		}
		npub = encodedNpub;
		try {
			nsec = nip19.nsecEncode(nsecBytes);
		} catch (err) {
			console.error('Error encoding nsec:', err);
		}
		mnemonic = mnemonicValue || '';
		keysReady = true;
	}

	async function loadKeys(prompt: boolean) {
		try {
			loading = true;
			error = '';
			needsUnlock = false;

			if (!prompt) {
				await restoreUnlockedSession();
				const cached = get(appStore).nostrKeys;
				if (cached.nsec && cached.npub) {
					applySigner(cached.npub, cached.nsec, cached.mnemonic || '');
					return;
				}
				needsUnlock = true;
				return;
			}

			const keys = await withPasskeyPrompt('unlock', () => getAllKeys({ interactive: true }));
			applySigner(keys.npub, keys.nsec, keys.mnemonic);
		} catch (err) {
			console.error('Error loading keys:', err);
			const message = err instanceof Error ? err.message : '';
			if (message === PASSKEY_UNLOCK_REQUIRED) {
				needsUnlock = true;
				return;
			}
			error = settingsKeyErrorMessage(message, (key) => get(t)(key));
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
			<p>{error}</p>
			<button class="btn btn-sm btn-outline place-self-end" onclick={() => loadKeys(true)}>
				{$t('settings.retry')}
			</button>
		</div>
	{:else}
		{@render children()}
	{/if}
</div>
