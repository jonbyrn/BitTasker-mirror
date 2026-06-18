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
	import InfiniteScroll from '$lib/components/InfiniteScroll.svelte';

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

	let cleanupKb: (() => void) | undefined;

	onMount(() => {
		import('$lib/utils/helpers/keyboard').then((m) => {
			m.initKeyboard().then((cleanup) => {
				cleanupKb = cleanup;
			});
		});

		return () => {
			cleanupKb?.();
		};
	});

	// Primary app scroll container (middle area in app-shell layout)
	let scrollEl = $state<HTMLElement | null>(null);
	onMount(() => {
		appScrollContainer.set(scrollEl);
		return () => appScrollContainer.set(null);
	});

	$effect(() => {
		// Keep store up to date when element binds
		if (scrollEl) appScrollContainer.set(scrollEl);
	});

	// Measure the actual footer height and expose it as a CSS variable.
	// This avoids any bottom-nav overlap caused by height rounding, fonts, or safe-area differences.
	let footerEl = $state<HTMLElement | null>(null);
	let footerObserver: ResizeObserver | null = null;

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
		{#if $authState.isAuthenticated}
			<ProtectedTopBar />
		{:else}
			<PublicTopBar />
		{/if}
	</header>
{/if}

<!-- Scrollable middle content. This is the ONLY app-level scroll container. -->
<div bind:this={scrollEl} class="app-shell__content bg-base-200">
	<div class="bg-base-200 flex shrink-0 grow basis-auto flex-col">
		{@render children()}
	</div>
</div>

<!-- BottomNavBar: Show on mobile/tablet (≤1024px) -->
{#if showTopBar}
	<footer bind:this={footerEl} class="app-shell__footer lg:hidden">
		<BottomNavBar />
	</footer>
{/if}

<!-- Toast notifications (fixed positioned) -->
<Toast />

<InfiniteScroll />

<!-- Global portal target — overlays (dropdowns, modals) teleport here to escape
     overflow:hidden/overflow-x:hidden ancestors that break fixed positioning -->
<div id="portal-root" style="position:relative;z-index:9999;"></div>
