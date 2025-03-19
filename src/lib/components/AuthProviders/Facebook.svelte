<script lang="ts">
	import type { FacebookUser, FacebookLoginResponse, FacebookSDK } from '$lib/types/facebook';
	import { onMount } from 'svelte';

	// Facebook SDK configuration
	const FB_APP_ID = import.meta.env.VITE_FACEBOOK_APP_ID;
	const FB_VERSION = 'v19.0';

	let isInitialized = $state(false);
	let isLoading = $state(false);

	// Load Facebook SDK
	const loadFacebookSDK = () => {
		const script = document.createElement('script');
		script.async = true;
		script.defer = true;
		script.crossOrigin = 'anonymous';
		script.src = 'https://connect.facebook.net/en_US/sdk.js';
		document.head.appendChild(script);
	};

	// Initialize Facebook SDK
	const initFacebookSDK = () => {
		window.fbAsyncInit = () => {
			(window as any).FB.init({
				appId: FB_APP_ID,
				cookie: true,
				xfbml: true,
				version: FB_VERSION
			});

			isInitialized = true;

			// Check if user is already logged in
			(window as any).FB.getLoginStatus((response: FacebookLoginResponse) => {
				if (response.status === 'connected') {
					handleSuccessfulLogin(response);
				}
			});
		};
	};

	// Handle successful login
	const handleSuccessfulLogin = async (response: FacebookLoginResponse) => {
		try {
			const result = await new Promise<FacebookUser>((resolve, reject) => {
				(window as any).FB.api(
					'/me',
					{ fields: 'id,name,email,picture' },
					(userInfo: FacebookUser & { error?: any }) => {
						if (userInfo.error) reject(userInfo.error);
						resolve(userInfo);
					}
				);
			});

			console.log('success', {
				provider: 'facebook',
				accessToken: response.authResponse?.accessToken,
				userData: result
			});
		} catch (error) {
			console.log('error', {
				provider: 'facebook',
				error: error
			});
		}
	};

	// Handle Facebook login
	const handleLogin = () => {
		try {
			if (!isInitialized) {
				throw new Error('Facebook SDK not initialized');
			}

			isLoading = true;

			(window as any).FB.login(
				(response: FacebookLoginResponse) => {
					isLoading = false;
					
					if (!response) {
						throw new Error('No response received from Facebook');
					}

					switch (response.status) {
						case 'connected':
							handleSuccessfulLogin(response);
							break;
						case 'not_authorized':
							throw new Error('User has not authorized the app');
						case 'unknown':
							throw new Error('Login status unknown, please try again');
						default:
							throw new Error(`Unexpected response status: ${response.status}`);
					}
				},
				{ 
					scope: 'public_profile,email',
					return_scopes: true // This helps us know which permissions were granted
				}
			).catch((error: Error) => {
				throw new Error(`Facebook API error: ${error.message}`);
			});
		} catch (error) {
			isLoading = false;
			console.error('Facebook login error:', {
				provider: 'facebook',
				error: error instanceof Error ? error.message : 'Unknown error occurred',
				timestamp: new Date().toISOString(),
			});
		}
	};

	onMount(() => {
		loadFacebookSDK();
		initFacebookSDK();
	});
</script>

<button class="btn btn-outline w-full" onclick={handleLogin} disabled={isLoading || !isInitialized}>
	<div class="flex items-center justify-center gap-2">
		{#if isLoading}
			<span class="loading loading-spinner"></span>
		{:else}
			<svg
				xmlns="http://www.w3.org/2000/svg"
				x="0px"
				y="0px"
				width="100"
				height="100"
				viewBox="0 0 48 48"
				class="mr-2 h-5 w-5"
			>
				<linearGradient
					id="Ld6sqrtcxMyckEl6xeDdMa_uLWV5A9vXIPu_gr1"
					x1="9.993"
					x2="40.615"
					y1="9.993"
					y2="40.615"
					gradientUnits="userSpaceOnUse"
					><stop offset="0" stop-color="#2aa4f4"></stop><stop offset="1" stop-color="#007ad9"
					></stop></linearGradient
				><path
					fill="url(#Ld6sqrtcxMyckEl6xeDdMa_uLWV5A9vXIPu_gr1)"
					d="M24,4C12.954,4,4,12.954,4,24s8.954,20,20,20s20-8.954,20-20S35.046,4,24,4z"
				></path><path
					fill="#fff"
					d="M26.707,29.301h5.176l0.813-5.258h-5.989v-2.874c0-2.184,0.714-4.121,2.757-4.121h3.283V12.46 c-0.577-0.078-1.797-0.248-4.102-0.248c-4.814,0-7.636,2.542-7.636,8.334v3.498H16.06v5.258h4.948v14.452 C21.988,43.9,22.981,44,24,44c0.921,0,1.82-0.084,2.707-0.204V29.301z"
				></path>
			</svg>
		{/if}
		Continue with Facebook
	</div>
</button>
