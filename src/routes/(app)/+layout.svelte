<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { authState } from '$lib/stores/auth.store';
	import { appScrollContainer } from '$lib/stores/scrollContainer.store';
	import BottomNavBar from '$lib/components/BottomNavBar.svelte';
	import ProtectedTopBar from '$lib/components/topbar/ProtectedTopBar.svelte';
	import PublicTopBar from '$lib/components/topbar/PublicTopBar.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import BlockchainToast from '$lib/components/wallet/BlockchainToast.svelte';

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

	let scrollEl = $state<HTMLElement | null>(null);
	let cleanupKb: (() => void) | undefined;
	let footerEl = $state<HTMLElement | null>(null);
	let footerObserver: ResizeObserver | null = null;

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
				deviceModule.getOnboardingCompleted()
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

		return () => {
			cleanupKb?.();
			appScrollContainer.set(null);
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		};
	});

	// Measure the actual footer height and expose it as a CSS variable.
	// This avoids any bottom-nav overlap caused by height rounding, fonts, or safe-area differences.
	$effect(() => {
		if (footerObserver) {
			footerObserver.disconnect();
			footerObserver = null;
		}

		// If the footer is unmounted (or not rendered on desktop), ensure we don't keep a stale value.
		if (!footerEl) {
			if (typeof document !== 'undefined') {
				document.documentElement.style.removeProperty('--app-footer-height');
			}
			return;
		}

		if (typeof ResizeObserver === 'undefined') return;

		let mq: MediaQueryList | null = null;
		const onMqChange = () => updateVar();

		function updateVar() {
			const el = footerEl;
			if (!el || typeof document === 'undefined') return;

			// Desktop (lg+) has no bottom dock/footer; avoid leaving a stale mobile value around.
			const isLgUp =
				typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;
			if (isLgUp) {
				document.documentElement.style.setProperty('--app-footer-height', `0px`);
				return;
			}

			// Avoid setting 0px during first paint / hidden states, which would
			// cause bottom-positioned UI to slip under the dock.
			const measured = Math.ceil(el.getBoundingClientRect().height ?? 0);
			if (measured <= 0) {
				// If the footer is actually hidden by CSS, 0 is correct.
				const isHidden =
					typeof window !== 'undefined' &&
					(window.getComputedStyle(el).display === 'none' ||
						window.getComputedStyle(el).visibility === 'hidden');
				if (isHidden) {
					document.documentElement.style.setProperty('--app-footer-height', `0px`);
				} else {
					// When switching from desktop->mobile, the footer can briefly report 0 before layout stabilizes.
					// Use the safe fallback immediately so floating UI doesn't get covered by the dock.
					document.documentElement.style.setProperty(
						'--app-footer-height',
						`var(--bottom-nav-height-safe)`
					);
				}
				return;
			}
			const h = Math.max(0, measured);
			document.documentElement.style.setProperty('--app-footer-height', `${h}px`);
		}

		updateVar();
		// Keep the variable in sync across breakpoint changes.
		if (typeof window !== 'undefined') {
			mq = window.matchMedia('(min-width: 1024px)');
			try {
				mq.addEventListener('change', onMqChange);
			} catch {
				// Safari fallback
				mq.addListener(onMqChange);
			}
		}
		footerObserver = new ResizeObserver(() => updateVar());
		footerObserver.observe(footerEl);

		return () => {
			footerObserver?.disconnect();
			footerObserver = null;
			if (mq) {
				try {
					mq.removeEventListener('change', onMqChange);
				} catch {
					mq.removeListener(onMqChange);
				}
			}
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
	<div class="bg-base-200 flex shrink-0 grow basis-auto flex-col">
		{@render children?.()}
	</div>
</div>

<!-- Toast notifications (fixed positioned) -->
<Toast />

<!-- Blockchain activity toast (persistent, below Toast at z-40) -->
<BlockchainToast />

<!-- BottomNavBar: Show on mobile/tablet (≤1024px) -->
{#if showTopBar}
	<footer bind:this={footerEl} class="app-shell__footer lg:hidden">
		<BottomNavBar />
	</footer>
{/if}


<!-- Global portal target — overlays (dropdowns, modals) teleport here to escape
     overflow:hidden/overflow-x:hidden ancestors that break fixed positioning -->
<div id="portal-root" style="position:relative;z-index:9999;"></div>
