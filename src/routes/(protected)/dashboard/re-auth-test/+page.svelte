<script lang="ts">
	import { onMount } from 'svelte';
	import { Preferences } from '@capacitor/preferences';
	import { StorageKeys } from '$lib/utils/constants/storage';
	import { Capacitor } from '@capacitor/core';
	import { getWebBiometricData } from '$lib/utils/helpers/webBiometrics';
	import { getBiometricData } from '$lib/utils/helpers/biometrics';

	let storedCredentialId = $state<string | null>(null);
	let authMethod = $state<string | null>(null);
	let loading = $state(true);
	let testing = $state(false);
	let result = $state<'idle' | 'success' | 'cancelled' | 'error'>('idle');
	let errorMessage = $state('');

	async function loadStoredCredential() {
		loading = true;
		result = 'idle';
		errorMessage = '';
		try {
			const [authRes, credRes] = await Promise.all([
				Preferences.get({ key: StorageKeys.AUTH_METHOD }),
				Preferences.get({ key: StorageKeys.WEB_AUTHN_CREDENTIAL_ID })
			]);
			authMethod = authRes.value ?? null;
			storedCredentialId = credRes.value && credRes.value !== '' ? credRes.value : null;
		} finally {
			loading = false;
		}
	}

	async function runReauthTest() {
		if (!storedCredentialId || storedCredentialId.length === 0) {
			errorMessage = 'No stored credential ID. Log in with passkey first.';
			return;
		}
		testing = true;
		result = 'idle';
		errorMessage = '';
		try {
			const credentials = Capacitor.isNativePlatform()
				? await getBiometricData(true, [storedCredentialId])
				: await getWebBiometricData(true, [storedCredentialId]);

			if (!credentials) {
				result = 'cancelled';
				return;
			}
			result = 'success';
		} catch (err) {
			result = 'error';
			errorMessage = err instanceof Error ? err.message : String(err);
		} finally {
			testing = false;
		}
	}

	onMount(() => {
		loadStoredCredential();
	});
</script>

<svelte:head>
	<title>Re-auth test | BitTasker</title>
</svelte:head>

<div class="container mx-auto max-w-2xl space-y-6 p-6">
	<h1 class="text-2xl font-bold">Re-auth test</h1>
	<p class="text-base-content/80">
		This page confirms that re-auth asks for the <strong>specific passkey</strong> you used when you
		logged in. Click the button below; you should only be offered that one passkey (not all passkeys
		on your device).
	</p>

	{#if loading}
		<p class="text-base-content/70">Loading stored credential...</p>
	{:else if authMethod !== 'passkey'}
		<div class="alert alert-outline alert-warning">
			<span>You are not logged in with passkey (auth method: {authMethod ?? 'none'}). Log in with passkey first, then return here.</span>
		</div>
	{:else if !storedCredentialId}
		<div class="alert alert-outline alert-warning">
			<span>No credential ID stored. Log in with passkey to store it, then return here.</span>
		</div>
	{:else}
		<div class="space-y-4">
			<p class="text-sm text-base-content/70">
				Stored credential ID (truncated): <code class="rounded bg-base-300 px-1">{storedCredentialId.slice(0, 20)}...</code>
			</p>
			<button
				type="button"
				class="btn btn-primary"
				disabled={testing}
				onclick={runReauthTest}
			>
				{#if testing}
					<span class="loading loading-spinner loading-sm"></span>
					Requesting passkey...
				{:else}
					Run re-auth test (request specific passkey)
				{/if}
			</button>
			{#if result === 'success'}
				<div class="alert alert-outline alert-success">
					<span>Success. You were asked for the specific passkey. Re-auth restriction is working.</span>
				</div>
			{:else if result === 'cancelled'}
				<div class="alert alert-outline alert-info">
					<span>Re-auth was cancelled. No error.</span>
				</div>
			{:else if result === 'error' && errorMessage}
				<div class="alert alert-outline alert-error">
					<span>{errorMessage}</span>
				</div>
			{/if}
		</div>
	{/if}

	<div class="pt-4">
		<a href="/dashboard" class="link link-primary">Back to dashboard</a>
	</div>
</div>
