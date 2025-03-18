<script lang="ts">
    import NDK, { NDKNip07Signer, type NDKUser } from '@nostr-dev-kit/ndk';
    import { browser } from '$app/environment';

    const NOSTR_RELAYS = [
        `${import.meta.env.VITE_PUBLIC_NOSTR_RELAY_URL}`,
        'wss://relay.nostr.band',
        'wss://relay.damus.io',
        'wss://purplepag.es'
    ];

    let isInitialized = $state(false);
    let isLoading = $state(false);
    let error = $state<string | null>(null);

    const ndk = new NDK({
        explicitRelayUrls: NOSTR_RELAYS
    });

    // Initialize NDK connection
    if (browser) {
        ndk.connect()
            .then(() => {
                console.log('Connected to Nostr relays');
                isInitialized = true;
            })
            .catch((err) => {
                console.error('Failed to connect to Nostr relays:', err);
                error = 'Failed to connect to Nostr relays';
            });
    }

    // Encrypt user data using Web Crypto API
    async function encryptUserData(userData: NDKUser): Promise<string> {
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(JSON.stringify(userData));
            
            // Generate a random key
            const key = await crypto.subtle.generateKey(
                { name: 'AES-GCM', length: 256 },
                true,
                ['encrypt']
            );

            const iv = crypto.getRandomValues(new Uint8Array(12));
            const encryptedData = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv },
                key,
                data
            );

            // Combine IV and encrypted data
            const result = new Uint8Array(iv.length + encryptedData.byteLength);
            result.set(iv);
            result.set(new Uint8Array(encryptedData), iv.length);
            
            return btoa(String.fromCharCode(...result));
        } catch (err) {
            console.error('Encryption error:', err);
            throw new Error('Failed to encrypt user data');
        }
    }

    // Handle successful login
    async function handleSuccessfulLogin(user: NDKUser) {
        try {
            // Encrypt and store user data
            const encryptedData = await encryptUserData(user);
            localStorage.setItem('nostr_user', encryptedData);

            // Store public key for future reference
            localStorage.setItem('nostr_pubkey', user.pubkey);

            console.log('success', {
                provider: 'nostr',
                pubkey: user.pubkey,
                user
            });
        } catch (err) {
            console.error('Login error:', err);
            error = 'Failed to process login';
            isLoading = false;
        }
    }

    // Handle Nostr login
    async function handleLogin() {
        if (!isInitialized) {
            error = 'Nostr is not initialized';
            return;
        }

        isLoading = true;
        error = null;

        try {
            const signer = new NDKNip07Signer();
            const user = await signer.user();
            
            if (!user) {
                throw new Error('No user returned from Nostr');
            }

            console.log({user});
            await handleSuccessfulLogin(user);
        } catch (err) {
            console.error('Nostr login error:', err);
            error = (err as Error)?.message || 'Failed to sign in with Nostr';
        } finally {
            isLoading = false;
        }
    }
</script>

<button
    class="btn btn-outline w-full"
    onclick={handleLogin}
    disabled={isLoading || !isInitialized}
>
    <div class="flex items-center justify-center gap-2">
        {#if isLoading}
            <span class="loading loading-spinner"></span>
        {:else}
            <svg xmlns="http://www.w3.org/2000/svg" class="mr-2 h-5 w-5" viewBox="0 0 196 196">
                <circle cx="98" cy="98" r="98" fill="#84CAFF"/>
                <path fill="#fff" d="M143.87 78.31c-3.12-6.25-10.16-8.02-16.41-4.89-6.24 3.12-8.02 10.16-4.89 16.41 3.12 6.24 10.16 8.02 16.41 4.89 6.24-3.12 8.02-10.16 4.89-16.41zm-91.74 39.38c-3.12-6.24-10.16-8.02-16.41-4.89-6.24 3.12-8.02 10.16-4.89 16.41 3.12 6.24 10.16 8.02 16.41 4.89 6.24-3.12 8.02-10.16 4.89-16.41zm45.87-91.74c-3.12-6.24-10.16-8.02-16.41-4.89-6.24 3.12-8.02 10.16-4.89 16.41 3.12 6.24 10.16 8.02 16.41 4.89 6.24-3.12 8.02-10.16 4.89-16.41zm45.87 91.74c-3.12-6.24-10.16-8.02-16.41-4.89-6.24 3.12-8.02 10.16-4.89 16.41 3.12 6.24 10.16 8.02 16.41 4.89 6.24-3.12 8.02-10.16 4.89-16.41z"/>
            </svg>
        {/if}
        Continue with Nostr
    </div>
</button>

{#if error}
    <div class="alert alert-error mt-2">
        <span>{error}</span>
    </div>
{/if}