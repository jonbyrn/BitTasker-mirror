<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { authState } from '$lib/stores/auth.store';
	import { appScrollContainer } from '$lib/stores/scrollContainer.store';
	import ProtectedTopBar from '$lib/components/topbar/ProtectedTopBar.svelte';
	import PublicTopBar from '$lib/components/topbar/PublicTopBar.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import BlockchainToast from '$lib/components/wallet/BlockchainToast.svelte';
	import { passkeyPrompt, PASSKEY_APPROVE_MESSAGE } from '$lib/utils/helpers/passkey-prompt';

	const { children } = $props();

	// Derive layout state from current route
	const currentPath = $derived(page.url.pathname);
	const showTopBar = $derived(!currentPath.includes('/onboarding'));

	/**
	 * Route group `(protected)` is omitted from the URL but present in `page.route.id`
	 * (e.g. `/(protected)/reviews` → pathname `/reviews`). Use this for parent-shell
	 * behavior without maintaining a pathname allowlist per new route.
	 * @see https://svelte.dev/docs/kit/advanced-routing#Advanced-layouts-group
	 */
	const isProtectedRoute = $derived(
		page.route.id != null && page.route.id.includes('/(protected)')
	);

	// Generate breadcrumbs from current path
	const breadcrumbList = $derived.by(() => {
		if (page.url.pathname === '/') return {};

		const segments = page.url.pathname.split('/').filter(Boolean);
		return {
			'@context': 'https://schema.org',
			'@type': 'BreadcrumbList',
			itemListElement: segments.map((segment: string, i: number) => ({
				'@type': 'ListItem',
				position: i + 1,
				name: segment.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
				item: `https://bittasker.com/${segments.slice(0, i + 1).join('/')}`
			}))
		};
	});

	let signerWarmed = false;

	$effect(() => {
		if (!browser || !$authState.isAuthenticated) {
			signerWarmed = false;
			return;
		}
		if (signerWarmed) return;
		signerWarmed = true;
		void import('$lib/utils/helpers/biometrics')
			.then(({ prefetchPasskeyChallenge }) => prefetchPasskeyChallenge())
			.catch(() => undefined);
		void import('$lib/utils/nostrKeys')
			.then(({ getNostrKeyPair }) => getNostrKeyPair())
			.catch(() => undefined);
	});

	let scrollEl = $state<HTMLElement | null>(null);
	let cleanupKb: (() => void) | undefined;

	// Fetch notification unread count and connect WebSocket for ALL authenticated routes.
	// The bell icon renders in ProtectedTopBar for any authenticated user, so the count
	// must be available even on non-protected routes like /tasks and /services.
	// Note: re-login also triggers this from setupAuthData(), since onMount only
	// fires once per component lifecycle.
	async function fetchNotificationCount() {
		if (!$authState.isAuthenticated) return;

		try {
			const { notificationCenterStore } = await import('$lib/stores/notificationCenter.store');
			await notificationCenterStore.fetchUnreadCount();

			const { connectNotificationSocket } = await import(
				'$lib/api/services/notificationSocket.service'
			);
			await connectNotificationSocket();
		} catch {
			// Notification init is non-critical — don't break the layout
		}
	}

	// Ensure wallet is initialized for protected routes.
	// This re-exposes __utexoWallet on window after page navigation/refresh.
	async function ensureWalletInitialized() {
		if (!$authState.isAuthenticated || !isProtectedRoute) return;

		try {
			const { initialize } = await import('$lib/stores/wallet/wallet-init');
			await initialize();
		} catch {
			// Wallet init is non-critical for layout rendering
		}
	}

	// Device store: only needed under (protected)/; follow `isProtectedRoute` on client navigations.
	$effect(() => {
		if (!browser || !isProtectedRoute) return;

		let cancelled = false;

		const run = async () => {
			if (cancelled) return;
			const deviceModule = await import('$lib/stores/device.store');
			if (cancelled) return;
			await Promise.all([
				deviceModule.initializeDevicePlatform(),
				deviceModule.getOnboardingCompleted(),
				ensureWalletInitialized()
			]);
		};

		let idleCallbackId = 0;
		let timeoutId: ReturnType<typeof setTimeout> | undefined;
		let scheduledWithIdleCallback = false;

		if (typeof requestIdleCallback !== 'undefined') {
			scheduledWithIdleCallback = true;
			idleCallbackId = requestIdleCallback(() => void run(), { timeout: 2000 });
		} else {
			timeoutId = setTimeout(() => void run(), 100);
		}

		return () => {
			cancelled = true;
			if (scheduledWithIdleCallback) {
				cancelIdleCallback(idleCallbackId);
			}
			if (timeoutId !== undefined) clearTimeout(timeoutId);
		};
	});

	onMount(() => {
		import('$lib/utils/helpers/keyboard').then((m) => {
			m.initKeyboard().then((cleanup: () => void) => {
				cleanupKb = cleanup;
			});
		});

		// Primary app scroll container (middle area in app-shell layout)
		appScrollContainer.set(scrollEl);

		void fetchNotificationCount();

		// Re-fetch notification count when app resumes from background.
		// This reconciles any missed WebSocket events during the background period.
		let lastResumeFetch = 0;
		const RESUME_DEBOUNCE_MS = 30_000;

		const handleVisibilityChange = () => {
			if (document.visibilityState === 'visible' && $authState.isAuthenticated) {
				const now = Date.now();
				if (now - lastResumeFetch > RESUME_DEBOUNCE_MS) {
					lastResumeFetch = now;
					import('$lib/stores/notificationCenter.store')
						.then(({ notificationCenterStore }) => notificationCenterStore.fetchUnreadCount())
						.catch(() => {});

					// Reconnect NDK relays — the OS may have killed WebSocket connections
					// while the app was backgrounded. Without this, subscriptions on pages
					// like /task/[taskId]/bids would query stale relays and get zero events.
					import('$lib/nostr/ndk').then(({ ndk }) => ndk.connect().catch(() => {})).catch(() => {});
				}
			}
		};

		document.addEventListener('visibilitychange', handleVisibilityChange);

		let stopWalletLink: (() => void) | undefined;
		let walletLinkCancelled = false;
		void import('$lib/stores/wallet/wallet-link').then(({ watchWalletLink }) => {
			if (walletLinkCancelled) return;
			stopWalletLink = watchWalletLink();
		});

		return () => {
			walletLinkCancelled = true;
			stopWalletLink?.();
			cleanupKb?.();
			appScrollContainer.set(null);
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		};
	});
</script>

<svelte:head>
	<!-- Breadcrumb JSON-LD (app-specific, other SEO in root layout) -->
	{#if page.url.pathname !== '/'}
		<!-- eslint-disable svelte/no-at-html-tags -->
		{@html `<\u{73}cript type="application/ld+json">${JSON.stringify(breadcrumbList)}</script>`}
		<!-- eslint-enable svelte/no-at-html-tags -->
	{/if}
</svelte:head>

{#if showTopBar}
	<header class="app-shell__header">
		<!-- ProtectedTopBar only for authenticated users (avoids passkey prompt on public/auth routes).
		     Unauthenticated users on public routes (tasks, services, auth) see PublicTopBar. -->
		{#if $authState.isLoading}
			<div class="h-16 w-full bg-transparent"></div>
		{:else if $authState?.isAuthenticated}
			<ProtectedTopBar />
		{:else}
			<PublicTopBar />
		{/if}
	</header>
{/if}

<!-- Scrollable middle content. This is the ONLY app-level scroll container. -->
<div bind:this={scrollEl} class="app-shell__content bg-base-200">
	<div class="bg-base-200 flex max-w-full min-w-0 shrink-0 grow basis-auto flex-col">
		{#if $passkeyPrompt.active}
			<div
				class="alert alert-info mx-auto mt-3 w-[min(100%-1.5rem,42rem)]"
				role="status"
				data-testid="passkey-approval-banner"
			>
				{$t('login.passkey_approval.continue', { default: PASSKEY_APPROVE_MESSAGE })}
			</div>
		{/if}
		{@render children?.()}
	</div>
</div>

<!-- Toast notifications (fixed positioned) -->
<Toast />

<!-- Blockchain activity toast (persistent, below Toast at z-40) -->
<BlockchainToast />

<!-- Global portal target — overlays (dropdowns, modals) teleport here to escape
     overflow:hidden/overflow-x:hidden ancestors that break fixed positioning -->
<div id="portal-root" style="position:relative;z-index:9999;"></div>
