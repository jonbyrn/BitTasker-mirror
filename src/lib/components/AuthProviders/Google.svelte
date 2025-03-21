<script lang="ts">
    import { bytesToHex } from '@noble/hashes/utils';
    import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
    import { encrypt, generateRandomKey, exportKey } from '$lib/utils/helpers/crypto';
    import { setBiometricKey } from '$lib/utils/helpers/biometrics';
    import { authenticateWithGoogle, registerWithNostr } from '$lib/services/auth.service';
    import { goto } from '$app/navigation';
    import { user, authState } from '$lib/states/user.store';
    import { decryptNostrPrivateKeyWithUserId } from '$lib/utils/helpers/auth';
    import { browser } from '$app/environment';
    import { onMount } from 'svelte';

    let isLoading = $state(false);
    let error = $state('');
    let isGoogleInitialized = $state(false);

    const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

    onMount(() => {
        if (browser) {
            // Load Google Identity Services
            const script = document.createElement('script');
            script.src = 'https://apis.google.com/js/api:client.js';
            script.onload = initGoogleAuth;
            document.head.appendChild(script);
        }
    });

    async function initGoogleAuth() {
        try {
            await new Promise<void>((resolve) => {
                window.gapi.load('auth2', () => {
                    window.gapi.auth2
                        .init({
                            client_id: GOOGLE_CLIENT_ID,
                            scope: 'profile email'
                        })
                        .then(() => {
                            isGoogleInitialized = true;
                            resolve();
                        });
                });
            });
        } catch (err) {
            console.error('Failed to initialize Google Auth:', err);
            error = 'Failed to initialize Google authentication';
        }
    }

    async function handleGoogleCallback(response: any) {
        if (!response?.credential) return;

        try {
            const res = await authenticateWithGoogle(response.credential);
            const { user: userData } = res;

            // User exists, handle successful login
            const { email, name, nostrKey } = userData;

            try {
                // Decrypt the user's Nostr private key
                const decryptedPrivateKey = await decryptNostrPrivateKeyWithUserId(
                    {
                        data: nostrKey.encryptedPrivateKey,
                        iv: nostrKey.iv,
                        authTag: nostrKey.authTag
                    },
                    response.client_id,
                    nostrKey.salt
                );

                // Only update user store and grant access if decryption succeeds
                user.updateProfile({
                    id: response.client_id,
                    email,
                    name,
                    publicKey: nostrKey.publicKey,
                    privateKey: decryptedPrivateKey,
                    createdAt: new Date(userData.createdAt),
                    updatedAt: new Date(userData.updatedAt)
                });

                goto('/profile');
            } catch (decryptError) {
                console.error('Failed to decrypt Nostr private key:', decryptError);
                // Set error state and prevent login
                authState.setError(
                    'Failed to decrypt user credentials. Please try again or contact support.'
                );
                return;
            }
        } catch (error: any) {
            if (error.response?.status === 404) {
                // User doesn't exist, proceed with registration
                console.log('New user, proceeding with registration');

                // Decode the JWT token to get user info
                const payload = JSON.parse(atob(response.credential.split('.')[1]));

                // Generate Nostr keypair
                const privateKey = generateSecretKey();
                const publicKey = getPublicKey(privateKey);
                const privateKeyHex = bytesToHex(privateKey);

                // Generate random encryption key
                const encryptionKey = await generateRandomKey();

                // Encrypt private key
                const encryptedData = await encrypt(privateKeyHex, encryptionKey);

                // Store encryption key with biometrics
                const success = await setBiometricKey(publicKey, await exportKey(encryptionKey));
                if (!success) {
                    error = 'Failed to set up biometric authentication';
                    return;
                }

                // Register with API
                await registerWithNostr({
                    email: payload.email,
                    name: payload.name,
                    publicKey,
                    encryptedPrivateKey: encryptedData.data,
                    iv: encryptedData.iv,
                    authTag: encryptedData.authTag,
                    useBiometrics: true,
                    salt: '', // Not used for biometric auth
                    iterations: 100000 // Default iterations
                });

                // Redirect to recovery page with email
                goto('/auth/recover?email=' + encodeURIComponent(payload.email));
            } else {
                console.error('Authentication error:', error);
                authState.setError('Authentication failed. Please try again.');
            }
        }
    }

    async function handleGoogleLogin() {
        if (!isGoogleInitialized) {
            error = 'Google authentication is not initialized yet. Please try again in a moment.';
            return;
        }

        try {
            isLoading = true;
            error = '';

            // Initialize Google Sign-In
            const auth2 = await window.gapi.auth2.getAuthInstance();
            const googleUser = await auth2.signIn();

            // Get user profile and ID token
            const profile = googleUser.getBasicProfile();
            const idToken = googleUser.getAuthResponse().id_token;

            // Call our callback with the credential
            await handleGoogleCallback({
                credential: idToken,
                client_id: profile.getId()
            });
        } catch (err: any) {
            error = err.response?.data?.message || 'Google login failed';
            console.error(err);
        } finally {
            isLoading = false;
        }
    }
</script>

<button class="btn btn-outline w-full gap-2" onclick={handleGoogleLogin} disabled={isLoading || !isGoogleInitialized}>
    {#if isLoading}
        <span class="loading loading-spinner"></span>
    {:else}
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/>
            <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"/>
            <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"/>
            <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"/>
        </svg>
        Continue with Google
    {/if}
</button>

{#if error}
    <div class="alert alert-error mt-4">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>{error}</span>
    </div>
{/if}
