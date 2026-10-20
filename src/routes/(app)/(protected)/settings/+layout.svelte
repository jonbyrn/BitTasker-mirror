<script lang="ts">
	import { setContext, onMount } from 'svelte';
	import { nip19 } from 'nostr-tools';
	import { t } from 'svelte-i18n';
	import { getAllKeys } from '$lib/utils/nostrKeys';
	import { prefetchPasskeyChallenge } from '$lib/utils/helpers/biometrics';
	import {
		PASSKEY_APPROVE_MESSAGE,
		PASSKEY_FAILED_MESSAGE,
		SignerLockedError,
		isPasskeyPromptError
	} from '$lib/utils/helpers/passkey-prompt';
	import { buildLabel } from '$lib/utils/build-label';

	const buildSha = buildLabel(import.meta.env.VITE_BUILD_SHA as string | undefined);

	let { children } = $props();

	let npub = $state('');
	let nsec = $state('');
	let mnemonic = $state('');
	let keysReady = $state(false);
	let error = $state('');
	let loading = $state(true);
	let needsPasskey = $state(false);

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
			needsPasskey = false;

			// Memory and the login session come first. WebAuthn runs only from the
			// unlock button, which is the export of the seed and private key.
			const keys = await getAllKeys(prompt ? { prompt: true } : undefined);

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
			if (err instanceof SignerLockedError || (prompt && isPasskeyPromptError(err))) {
				needsPasskey = true;
				error = prompt ? PASSKEY_FAILED_MESSAGE : PASSKEY_APPROVE_MESSAGE;
				prefetchPasskeyChallenge();
			} else {
				error = err instanceof Error ? err.message : $t('settings.error.loadKeys');
			}
		} finally {
			loading = false;
		}
	}

	function retryKeys() {
		void loadKeys(needsPasskey);
	}
</script>

<div class="settings-content mx-auto h-full max-w-6xl px-2 py-6 md:px-0 md:py-0">
	<div class="mb-6">
		<h3>{$t('settings.title')}</h3>
		<p class="text-base-content/70">{$t('settings.subtitle')}</p>
		<p class="text-base-content/50 mt-1 font-mono text-xs" data-testid="build-sha">
			{$t('settings.build_id', { values: { sha: buildSha } })}
		</p>
	</div>

	{#if loading}
		<div class="flex flex-col items-center justify-center gap-3 py-12">
			<div class="loading loading-spinner loading-lg"></div>
		</div>
	{:else if error}
		<div
			class="alert alert-error alert-outline mb-6 flex w-fit min-w-full flex-col items-start px-5 sm:min-w-1/2"
		>
			<p>{$t(error)}</p>
			<button class="btn btn-sm btn-outline place-self-end" onclick={retryKeys}>
				{$t('settings.retry')}
			</button>
		</div>
	{:else}
		{@render children?.()}
	{/if}
</div>
