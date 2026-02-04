<script lang="ts">
	import { onMount } from 'svelte';
	import { nip19 } from 'nostr-tools';
	import { t } from 'svelte-i18n';
	import { Preferences } from '@capacitor/preferences';
	import { getAllKeys } from '$lib/utils/nostrKeys';
	import { StorageKeys } from '$lib/utils/constants/storage';
	import NostrNsec from '$lib/components/settings/NostrNsec.svelte';
	import AccRecovery from '$lib/components/settings/AccRecovery.svelte';
	import PasskeySync from '$lib/components/settings/PasskeySync.svelte';
	import AccActions from '$lib/components/settings/AccActions.svelte';
	import Devices from '$lib/components/settings/Devices.svelte';

	let loading = $state(false);
	let error = $state('');
	let npub = $state('');
	let nsec = $state('');
	let mnemonic = $state('');
	let authMethod = $state('');

	onMount(async () => {
		await loadKeys();
	});

	async function loadKeys() {
		try {
			if (npub && nsec) return;

			loading = true;
			error = '';

			// Get the authentication method
			const { value: storedAuthMethod } = await Preferences.get({ key: StorageKeys.AUTH_METHOD });
			authMethod = storedAuthMethod || '';

			if (authMethod === 'alby') {
				// Handle Alby authentication
				if (!window?.nostr) {
					throw new Error($t('settings.error.albyNotFound'));
				}

				try {
					// Get public key from Alby
					const publicKey = await window.nostr.getPublicKey();
					if (!publicKey) {
						throw new Error($t('settings.error.publicKeyAlby'));
					}

					// Convert to npub format if it's hex
					if (publicKey.startsWith('npub')) {
						npub = publicKey;
					} else if (/^[0-9a-fA-F]{64}$/.test(publicKey)) {
						npub = nip19.npubEncode(publicKey);
					} else {
						throw new Error($t('settings.error.invalidPublicKey'));
					}

					// For Alby, we can't access the private key directly
					nsec = $t('settings.nostr.privateKey.managed');
				} catch (albyError) {
					throw new Error(
						`Alby error: ${albyError instanceof Error ? albyError.message : 'Unknown error'}`
					);
				}
			} else {
				// Handle passkey/biometric authentication
				const allKeys = await getAllKeys();

				// Check if the public key is already in npub format
				if (allKeys.npub.startsWith('npub')) {
					npub = allKeys.npub;
				} else if (/^[0-9a-fA-F]{64}$/.test(allKeys.npub)) {
					// It's a hex string, convert to npub format
					npub = nip19.npubEncode(allKeys.npub);
				} else {
					throw new Error($t('settings.error.invalidKeyFormat'));
				}

				// Convert the private key (Uint8Array) to nsec format
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

				// Set mnemonic
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

<!-- Mismas dimensiones que Mi Panel -->
<div class="mx-auto h-full max-w-6xl px-2 py-6 md:px-0 md:py-0">
	<div class="mb-6">
		<h3 class="">{$t('settings.title')}</h3>
		<p class="text-base-content/70">{$t('settings.subtitle')}</p>
	</div>

	{#if loading}
		<div class="flex items-center justify-center py-12">
			<div class="loading loading-spinner loading-lg"></div>
		</div>
	{:else if error}
		<div
			class="alert alert-error alert-outline mb-6 flex w-fit min-w-full sm:min-w-1/2 flex-col items-start px-5"
		>
			<p>{$t(error)}</p>
			<button class="btn btn-sm btn-outline place-self-end" onclick={loadKeys} disabled={loading}>
				{#if loading}
					<span class="loading loading-spinner loading-sm"></span>
				{:else}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
						/>
					</svg>
					{$t('settings.retry')}
				{/if}
			</button>
		</div>
	{:else}
		<NostrNsec {npub} {nsec} {authMethod} />
		<Devices {npub} />
		<AccRecovery {nsec} {npub} {mnemonic} {authMethod} />
		<PasskeySync {authMethod} />
		<AccActions />
	{/if}
</div>
