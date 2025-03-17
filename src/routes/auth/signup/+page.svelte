<script lang="ts">
    import { Connect, ConnectURI } from '@nostr-connect/connect';
    import { generateSecretKey, getPublicKey } from 'nostr-tools';
    import { bytesToHex } from '@noble/hashes/utils';
    import { goto } from '$app/navigation';

    let username = $state('');
    let selectedProvider = $state('');
    let isLoading = $state(false);
    let error = $state('');

    // Static list of trusted providers (can be moved to a config file)
    const trustedProviders = [
        {
            name: 'vulpem.com',
            url: 'wss://nostr.vulpem.com',
            description: 'Vulpem Nostr Provider'
        },
        // Add more trusted providers here
    ];

    // Generate local keypair
    const localSecretKey = generateSecretKey();
    const localPublicKey = getPublicKey(localSecretKey);
    const skHex = bytesToHex(localSecretKey);

    // Initialize Nostr Connect
    const connect = new Connect({
        secretKey: skHex,
        relay: trustedProviders[0].url
    });

    // Check username availability
    async function checkUsernameAvailability(username: string, provider: string): Promise<boolean> {
        try {
            const response = await fetch(`https://${provider}/.well-known/nostr.json?name=${username}`);
            const data = await response.json();
            return !data.names[username]; // Return true if username is available
        } catch (error) {
            console.error('Error checking username availability:', error);
            throw new Error('Failed to check username availability');
        }
    }

    // Fetch provider info
    async function fetchProviderInfo(provider: string) {
        try {
            const response = await fetch(`https://${provider}/.well-known/nostr.json?name=_`);
            const data = await response.json();
            return {
                remotePubkey: data.remote_signer_pubkey,
                relays: data.bunker_relays
            };
        } catch (error) {
            console.error('Error fetching provider info:', error);
            throw new Error('Failed to fetch provider info');
        }
    }

    // Handle signup process
    async function handleSignup() {
        try {
            isLoading = true;
            error = '';

            // Validate inputs
            if (!username || !selectedProvider) {
                throw new Error('Please enter username and select a provider');
            }

            // Check username availability
            const isAvailable = await checkUsernameAvailability(username, selectedProvider);
            if (!isAvailable) {
                throw new Error('Username is not available');
            }

            // Get provider info
            const providerInfo = await fetchProviderInfo(selectedProvider);

            // Initialize connection
            await connect.init();

            // Create connect URI
            const connectURI = new ConnectURI({
                target: localPublicKey,
                relay: providerInfo.relays[0],
                metadata: {
                    name: 'Bittasker',
                    description: 'Freelance marketplace with crypto payments',
                    url: 'https://bittasker.com',
                    icons: ['https://bittasker.com/icon.png']
                }
            });

            // Set up connection event handlers
            connect.events.on('connect', async (walletPubkey: string) => {
                console.log('Connected with wallet:', walletPubkey);
                
                // Create account request
                const createAccountRequest = {
                    kind: 46,
                    tags: [
                        ['p', providerInfo.remotePubkey],
                        ['username', username],
                        ['provider', selectedProvider]
                    ],
                    content: 'create_account'
                };

                try {
                    // Send create_account request
                    const response = await connect.signEvent(createAccountRequest);
                    
                    // Save credentials to local storage
                    localStorage.setItem('nostr_keypair', JSON.stringify({
                        secretKey: skHex,
                        publicKey: localPublicKey,
                        remotePubkey: response.pubkey,
                        bunkerRelays: providerInfo.relays
                    }));

                    // Navigate to success page
                    goto('/auth/success');
                } catch (error) {
                    console.error('Failed to create account:', error);
                    error = 'Failed to create account. Please try again.';
                }
            });

            // Generate and display QR code or URI
            const uri = connectURI.toString();
            console.log('Connect URI:', uri);
            // Here you would display the QR code using your preferred QR library

        } catch (error) {
            console.error('Signup error:', error);
            error = error.message || 'Failed to sign up. Please try again.';
        } finally {
            isLoading = false;
        }
    }
</script>

<div class="flex flex-col items-center justify-center min-h-screen bg-base-200 p-4">
    <div class="card w-96 bg-base-100 shadow-xl">
        <div class="card-body">
            <h2 class="card-title">Sign Up with Nostr</h2>
            
            <!-- Username Input -->
            <div class="form-control">
                <label class="label" for="username">
                    <span class="label-text">Username</span>
                </label>
                <input
                    type="text"
                    id="username"
                    bind:value={username}
                    placeholder="Enter username"
                    class="input input-bordered w-full"
                />
            </div>

            <!-- Provider Selection -->
            <div class="form-control mt-4">
                <label class="label" for="provider">
                    <span class="label-text">Select Provider</span>
                </label>
                <select
                    id="provider"
                    bind:value={selectedProvider}
                    class="select select-bordered w-full"
                >
                    <option value="">Select a provider</option>
                    {#each trustedProviders as provider}
                        <option value={provider.name}>{provider.name}</option>
                    {/each}
                </select>
            </div>

            <!-- Error Display -->
            {#if error}
                <div class="alert alert-error mt-4">
                    <span>{error}</span>
                </div>
            {/if}

            <!-- Submit Button -->
            <div class="card-actions justify-end mt-6">
                <button
                    class="btn btn-primary"
                    onclick={handleSignup}
                    disabled={isLoading}
                >
                    {isLoading ? 'Signing up...' : 'Sign Up'}
                </button>
            </div>
        </div>
    </div>
</div>
