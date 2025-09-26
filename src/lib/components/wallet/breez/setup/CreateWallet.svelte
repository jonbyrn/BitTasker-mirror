<script lang="ts">
	import { goto } from '$app/navigation';
	import { setupMnemonicPasskey } from '$lib/wallet/mnemonicBiometrics';
	import { migrateLegacyToMasterKey, decryptNsecWithBiometrics } from '$lib/utils/helpers/auth';
	import { get } from 'svelte/store';
	import { appStore } from '$lib/stores/app.store';
	import { getDeviceIdentifier } from '$lib/utils/helpers/deviceIdentity';
	import authService from '$lib/api/services/auth.service';
	import { Buffer } from 'buffer';
	import { generateMnemonic } from 'bip39';
	import { t } from 'svelte-i18n';

	// Polyfill Buffer
	if (typeof window !== 'undefined') {
		(globalThis as any).Buffer = Buffer;
	}

	let mnemonic = $state('');
	let isGenerating = $state(false);
	let error = $state('');
	let isCopied = $state(false);

	function generateNewMnemonic() {
		try {
			isGenerating = true;
			error = '';

			// Only run in browser environment to avoid Buffer issues
			mnemonic = generateMnemonic();
		} catch (err) {
			console.error('Error generating mnemonic', err);
			error = err instanceof Error ? err.message : 'Failed to generate mnemonic';
		} finally {
			isGenerating = false;
		}
	}

	async function setupPasskey() {
		try {
			isGenerating = true;
			error = '';

			if (mnemonic) {
				// Check if user has legacy auth that needs migration
				const currentState = get(appStore);
				if (currentState.biometricData) {
					try {
						// Try to migrate legacy data to master key format
						await migrateLegacyUserToMasterKey(mnemonic);
						console.log('Successfully migrated legacy user to master key format');
					} catch (migrationError) {
						console.warn('Migration failed, using legacy mnemonic setup:', migrationError);
						// Fallback to legacy mnemonic setup
						await setupMnemonicPasskey(mnemonic);
					}
				} else {
					// New user, use legacy mnemonic setup (master key is handled in onboarding)
					await setupMnemonicPasskey(mnemonic);
				}
				
				goto('/dashboard/wallet');
			}
		} catch (err) {
			console.error('Error setting up mnemonic passkey', err);
			error = err instanceof Error ? err.message : 'Failed to setup mnemonic passkey';
		} finally {
			isGenerating = false;
		}
	}

	/**
	 * Migrate legacy user to master key format by combining existing nsec with new mnemonic
	 */
	async function migrateLegacyUserToMasterKey(walletMnemonic: string) {
		const currentState = get(appStore);
		if (!currentState.biometricData) {
			throw new Error('No biometric data available for migration');
		}

		// Get device ID
		const deviceId = await getDeviceIdentifier();

		// Migrate to master key format
		const masterKeyData = await migrateLegacyToMasterKey(
			walletMnemonic,
			currentState.biometricData.password,
			deviceId
		);

		// Update the user's data on the server using migration endpoint
		try {
			const migrationResult = await authService.migrateToMasterKey(
				currentState.biometricData.username,
				deviceId,
				masterKeyData
			);
			
			if (!migrationResult.success) {
				throw new Error(migrationResult.message || 'Migration failed');
			}

			// Update local biometric data to master key format
			const newBiometricData = {
				...currentState.biometricData,
				password: JSON.stringify({
					key: masterKeyData.exportedMasterKey,
					masterKeyData: masterKeyData,
					// Legacy compatibility fields
					data: masterKeyData.nostr.encrypted.data,
					iv: masterKeyData.nostr.encrypted.iv,
					authTag: masterKeyData.nostr.encrypted.authTag,
					salt: masterKeyData.nostr.salt
				})
			};

			// Update app store with new biometric data
			appStore.update(state => ({
				...state,
				biometricData: newBiometricData
			}));

		} catch (error) {
			console.error('Failed to update server with master key data:', error);
			// Continue with local migration even if server update fails
		}
	}
</script>

<div class="p-8 pb-0">
	<h2 class="mb-6 text-center text-2xl font-bold">{$t('common.components.wallet.create_wallet.title')}</h2>

	{#if mnemonic}
		<div class="alert alert-outline alert-error mb-6 shadow-md">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-6 w-6 shrink-0 stroke-current"
				fill="red"
				viewBox="0 0 24 24"
				><path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
				/></svg
			>
			<span class="font-medium"
				>{$t('common.components.wallet.create_wallet.warning')}</span
			>
		</div>

		<p class="mb-2 text-sm font-medium">
			{$t('common.components.wallet.create_wallet.copy_instruction')}
		</p>
		<button
			class="seed-phrase-text mb-4 w-full cursor-pointer rounded-lg border-2 border-dashed p-4 text-left font-mono text-sm transition-all duration-300 select-text {isCopied
				? 'border-green-500 bg-green-50 text-green-500'
				: 'bg-base-200 hover:bg-base-300 border-yellow-500'}"
			data-seed-phrase={mnemonic}
			onclick={async () => {
				try {
					await navigator.clipboard.writeText(mnemonic.trim());
					isCopied = true;

					// Reset the copied state after 2 seconds
					setTimeout(() => {
						isCopied = false;
					}, 2000);
				} catch (err) {
					console.error('Failed to copy to clipboard:', err);
					// Fallback for older browsers or when clipboard API fails
					const textArea = document.createElement('textarea');
					textArea.value = mnemonic;
					document.body.appendChild(textArea);
					textArea.select();
					document.execCommand('copy');
					document.body.removeChild(textArea);

					isCopied = true;
					setTimeout(() => {
						isCopied = false;
					}, 2000);
				}
			}}
		>
			<p class="flex-1">{mnemonic}</p>
			{#if isCopied}
				<div class="flex items-center place-self-end text-green-600">
					<svg
						class="mr-1 h-5 w-5"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"
						></path>
					</svg>
					<span class="text-sm font-medium">{$t('common.components.wallet.create_wallet.copied')}</span>
				</div>
			{:else}
				<div class="flex items-center place-self-end text-gray-500">
					<svg
						class="mr-1 h-5 w-5"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
						></path>
					</svg>
					<span class="text-sm">{$t('common.components.wallet.create_wallet.click_to_copy')}</span>
				</div>
			{/if}
		</button>
	{/if}

	{#if !mnemonic && !isGenerating}
		<p class="mb-2 text-sm font-medium">Click the button below to generate a new seed phrase.</p>
		<button
			class="btn btn-primary mt-2 w-full"
			onclick={generateNewMnemonic}
			disabled={isGenerating}
			aria-disabled={isGenerating}
		>
			{$t('common.components.wallet.create_wallet.generate_seed')}
		</button>
	{:else if !mnemonic && isGenerating}
		<p class="text-sm font-medium">{$t('common.components.wallet.create_wallet.generating')}</p>
	{:else if mnemonic && isGenerating}
		<p class="btn btn-primary mt-2 w-full">{$t('common.components.wallet.create_wallet.setting_up')}</p>
	{:else if mnemonic && !isGenerating}
		<button class="btn btn-primary mt-2 w-full" onclick={setupPasskey}> {$t('common.components.wallet.create_wallet.continue')} </button>
	{/if}

	{#if error}
		<div class="alert alert-outline alert-error mt-6 shadow-md">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-6 w-6 shrink-0 stroke-current"
				fill="red"
				viewBox="0 0 24 24"
				><path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
				/></svg
			>
			<span class="font-medium overflow-wrap-anywhere break-all whitespace-normal">{error}</span>
		</div>
	{/if}
</div>
