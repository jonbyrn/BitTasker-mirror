<script lang="ts">
	import { setContext, onMount } from 'svelte';
	import { nip19 } from 'nostr-tools';
	import { t } from 'svelte-i18n';
	import { getAllKeys, getNpub } from '$lib/utils/nostrKeys';
	import { getMnemonic } from '$lib/utils/helpers/mnemonic';
	import { prefetchPasskeyChallenge } from '$lib/utils/helpers/biometrics';
	import { walletUnlockRoute } from '$lib/utils/helpers/login-method';
	import { NsecUnlockRequired } from '$lib/utils/helpers/nsec-unlock';
	import {
		PASSKEY_APPROVE_MESSAGE,
		PASSKEY_FAILED_MESSAGE,
		SignerLockedError,
		isPasskeyPromptError
	} from '$lib/utils/helpers/passkey-prompt';
	let { children } = $props();

	let npub = $state('');
	let nsec = $state('');
	let mnemonic = $state('');
	let keysReady = $state(false);
	let error = $state('');
	let loading = $state(true);
	let needsPasskey = $state(false);
	let locked = $state(false);

	function encodeNpub(value: string): string {
		if (!value || value.startsWith('npub')) return value;
		try {
			return nip19.npubEncode(value);
		} catch {
			return value;
		}
	}

	async function showPublicIdentity(): Promise<void> {
		const raw = await getNpub().catch(() => '');
		if (raw) npub = encodeNpub(raw);
	}

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
		},
		get locked() {
			return locked;
		},
		unlock: (nsec?: string) => loadKeys(true, nsec)
	});

	onMount(async () => {
		await loadKeys(false);
	});

	async function loadKeys(prompt: boolean, pasted?: string) {
		try {
			loading = true;
			error = '';
			needsPasskey = false;
			const keyLogin = walletUnlockRoute() === 'nsec';
			if (pasted?.trim()) await getMnemonic({ nsec: pasted.trim() });

			// Memory and the login session come first. WebAuthn runs only from the
			// unlock button, which is the export of the seed and private key.
			const keys = await getAllKeys(!keyLogin && prompt ? { prompt: true } : undefined);

			npub = encodeNpub(keys.npub);

			try {
				nsec = nip19.nsecEncode(keys.nsec);
			} catch (err) {
				console.error('Error encoding nsec:', err);
			}

			mnemonic = keys.mnemonic || '';
			locked = false;
			keysReady = true;
		} catch (err) {
			console.error('Error loading keys:', err);
			if (err instanceof NsecUnlockRequired && !prompt) {
				await showPublicIdentity();
				locked = true;
				keysReady = true;
				error = '';
			} else if (err instanceof NsecUnlockRequired) {
				await showPublicIdentity();
				locked = true;
				keysReady = true;
				error = err.message;
			} else if (err instanceof SignerLockedError && !prompt) {
				await showPublicIdentity();
				locked = true;
				keysReady = true;
				error = '';
				prefetchPasskeyChallenge();
			} else if (err instanceof SignerLockedError || (prompt && isPasskeyPromptError(err))) {
				needsPasskey = true;
				error = prompt ? PASSKEY_FAILED_MESSAGE : PASSKEY_APPROVE_MESSAGE;
				if (!keysReady) {
					await showPublicIdentity();
					if (npub) keysReady = true;
				}
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

<div class="settings-content mx-auto h-full w-full max-w-3xl px-2 py-6 md:px-0 md:py-0">
	<div class="mb-6 text-center">
		<h3 data-testid="settings-title">{$t('settings.title')}</h3>
		<p class="text-base-content/70">{$t('settings.subtitle')}</p>
	</div>

	{#if loading}
		<div
			class="flex flex-col items-center justify-center gap-3 py-4"
			data-testid="settings-keys-loading"
		>
			<div class="loading loading-spinner loading-lg"></div>
		</div>
	{:else if error}
		<div
			class="alert alert-error alert-outline mb-6 flex w-fit min-w-full flex-col items-start px-5 sm:min-w-1/2"
			data-testid="settings-keys-error"
		>
			<p>{error.startsWith('settings.') ? $t(error) : error}</p>
			<button class="btn btn-sm btn-outline place-self-end" onclick={retryKeys}>
				{$t('settings.retry')}
			</button>
		</div>
	{/if}
	{@render children?.()}
</div>
