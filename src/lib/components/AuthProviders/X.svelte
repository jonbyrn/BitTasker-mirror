<script lang="ts">
    import type { XUser, XAuthResponse } from '$lib/types/x';
    import { onMount } from 'svelte';

    // X API configuration
    const X_CLIENT_ID = import.meta.env.VITE_X_CLIENT_ID; // TODO: Add your X Client ID
    const X_REDIRECT_URI = import.meta.env.VITE_X_REDIRECT_URI; // TODO: Add your redirect URI

    let isInitialized = $state(false);
    let isLoading = $state(false);

    // Initialize X auth state
    const initXAuth = () => {
        // Check if we have a code from X redirect
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const state = urlParams.get('state');

        if (code && state) {
            handleCallback(code, state);
        }

        isInitialized = true;
    };

    // Generate random state for CSRF protection
    const generateState = () => {
        return crypto.getRandomValues(new Uint8Array(16))
            .reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '');
    };

    // Handle X OAuth callback
    const handleCallback = async (code: string, state: string) => {
        try {
            // Verify state to prevent CSRF attacks
            const savedState = sessionStorage.getItem('x_auth_state');
            if (state !== savedState) {
                throw new Error('Invalid state parameter');
            }

            // Exchange code for tokens using PKCE
            const tokens = await exchangeCodeForTokens(code);
            const userData = await fetchUserData(tokens.oauth_token);

            console.log('success', {
                provider: 'x',
                accessToken: tokens.oauth_token,
                userData
            });

        } catch (error) {
            console.log('error', {
                provider: 'x',
                error
            });
        }
    };

    // Exchange authorization code for tokens
    const exchangeCodeForTokens = async (code: string): Promise<XAuthResponse> => {
        const codeVerifier = sessionStorage.getItem('x_code_verifier');
        if (!codeVerifier) {
            throw new Error('Code verifier not found');
        }

        const params = new URLSearchParams({
            client_id: X_CLIENT_ID,
            code_verifier: codeVerifier,
            code,
            grant_type: 'authorization_code',
            redirect_uri: X_REDIRECT_URI
        });

        const response = await fetch('https://api.twitter.com/2/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        });

        if (!response.ok) {
            throw new Error('Failed to exchange code for tokens');
        }

        return response.json();
    };

    // Fetch user data using access token
    const fetchUserData = async (accessToken: string): Promise<XUser> => {
        const response = await fetch('https://api.twitter.com/2/users/me', {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch user data');
        }

        return response.json();
    };

    // Generate PKCE code challenge
    const generateCodeChallenge = async (verifier: string) => {
        const encoder = new TextEncoder();
        const data = encoder.encode(verifier);
        const digest = await crypto.subtle.digest('SHA-256', data);
        return btoa(String.fromCharCode(...new Uint8Array(digest)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    };

    // Handle X login
    const handleLogin = async () => {
        if (!isInitialized) {
            console.log('error', {
                provider: 'x',
                error: 'X auth not initialized'
            });
            return;
        }

        isLoading = true;

        try {
            // Generate and store PKCE code verifier
            const codeVerifier = generateState();
            sessionStorage.setItem('x_code_verifier', codeVerifier);

            // Generate code challenge
            const codeChallenge = await generateCodeChallenge(codeVerifier);

            // Generate and store state
            const state = generateState();
            sessionStorage.setItem('x_auth_state', state);

            // Build authorization URL
            const authUrl = new URL('https://twitter.com/i/oauth2/authorize');
            authUrl.searchParams.append('response_type', 'code');
            authUrl.searchParams.append('client_id', X_CLIENT_ID);
            authUrl.searchParams.append('redirect_uri', X_REDIRECT_URI);
            authUrl.searchParams.append('scope', 'tweet.read users.read');
            authUrl.searchParams.append('state', state);
            authUrl.searchParams.append('code_challenge', codeChallenge);
            authUrl.searchParams.append('code_challenge_method', 'S256');

            // Redirect to X authorization page
            window.location.href = authUrl.toString();
        } catch (error) {
            isLoading = false;
            console.log('error', {
                provider: 'x',
                error
            });
        }
    };

    onMount(() => {
        initXAuth();
    });
</script>

<button class="btn btn-outline w-full" onclick={handleLogin} disabled={isLoading || !isInitialized}>
    <div class="flex items-center justify-center gap-2">
        {#if isLoading}
            <span class="loading loading-spinner"></span>
        {:else}
            <svg xmlns="http://www.w3.org/2000/svg" class="mr-2 h-5 w-5" viewBox="0 0 24 24">
                <path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
        {/if}
        Continue with X
    </div>
</button>
