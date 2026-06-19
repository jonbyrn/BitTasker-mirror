<script lang="ts">
	import { setContext, onMount } from 'svelte';
	import { nip19 } from 'nostr-tools';
	import { t } from 'svelte-i18n';
	import { Preferences } from '@capacitor/preferences';
	import { getAllKeys } from '$lib/utils/nostrKeys';
	import { StorageKeys } from '$lib/utils/constants/storage';

	let { children } = $props();

	let loading = $state(false);
	let error = $state('');
	let npub = $state('');
	let nsec = $state('');
	let mnemonic = $state('');
	let authMethod = $state('');

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
		get authMethod() {
			return authMethod;
		},
		get loading() {
			return loading;
		},
		get error() {
			return error;
		},
		loadKeys
	});

	onMount(async () => {
		await loadKeys();
	});

	async function loadKeys() {
		try {
			if (npub && nsec) return;

			loading = true;
			error = '';

			const { value: storedAuthMethod } = await Preferences.get({ key: StorageKeys.AUTH_METHOD });
			authMethod = storedAuthMethod || '';

			if (authMethod === 'alby') {
				if (!window?.nostr) {
					throw new Error($t('settings.error.albyNotFound'));
				}

				try {
					const publicKey = await window.nostr.getPublicKey();
					if (!publicKey) {
						throw new Error($t('settings.error.publicKeyAlby'));
					}

					if (publicKey.startsWith('npub')) {
						npub = publicKey;
					} else if (/^[0-9a-fA-F]{64}$/.test(publicKey)) {
						npub = nip19.npubEncode(publicKey);
					} else {
						throw new Error($t('settings.error.invalidPublicKey'));
					}

					nsec = $t('settings.nostr.privateKey.managed');
				} catch (albyError) {
					throw new Error(
						`Alby error: ${albyError instanceof Error ? albyError.message : 'Unknown error'}`
					);
				}
			} else {
				const allKeys = await getAllKeys();

				if (allKeys.npub.startsWith('npub')) {
					npub = allKeys.npub;
				} else if (/^[0-9a-fA-F]{64}$/.test(allKeys.npub)) {
					npub = nip19.npubEncode(allKeys.npub);
				} else {
					throw new Error($t('settings.error.invalidKeyFormat'));
				}

				if (allKeys.nsec && allKeys.nsec instanceof Uint8Array) {
					try {
						nsec = nip19.nsecEncode(allKeys.nsec);
					} catch (err) {
						console.error('Error encoding nsec:', err);
						nsec = $t('settings.error.encodingNsec');
					}
				} else {
					nsec = $t('settings.error.invalidPrivateKey');
				}

				mnemonic = allKeys.mnemonic;
			}
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

	{#if loading}
		<div class="flex items-center justify-center py-12">
			<div class="loading loading-spinner loading-lg"></div>
		</div>
	{:else if error}
		<div
			class="alert alert-error alert-outline mb-6 flex w-fit min-w-full flex-col items-start px-5 sm:min-w-1/2"
		>
			<p>{$t(error)}</p>
			<button class="btn btn-sm btn-outline place-self-end" onclick={loadKeys} disabled={loading}>
				{#if loading}
					<span class="loading loading-spinner loading-sm"></span>
				{:else}
					{$t('settings.retry')}
				{/if}
			</button>
		</div>
	{:else}
		{@render children()}
	{/if}
</div>
