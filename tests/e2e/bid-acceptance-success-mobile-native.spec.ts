/**
 * BidAcceptanceFormV2 — Success screen action buttons visibility on mobile native.
 *
 * Reproduces a UI bug where the success screen's action buttons
 * ("Go to Contracts" and "Create New Task") are not visible on the
 * mobile native app (Capacitor iOS/Android).
 *
 * Root cause:
 *   The BidAcceptanceSuccessScreen renders action buttons as regular content
 *   inside the Drawer's scrollable area (`.drawer-scroll-area`).
 *   On mobile native, the Drawer's `respectBottomNav` reserves space for the
 *   bottom navigation bar (--app-footer-height), reducing the drawer's
 *   available height. The Drawer CSS also adds safe-area-inset-bottom padding
 *   to the scroll area content, further reducing visible space.
 *   The action buttons at the bottom of the success screen get pushed below
 *   the visible viewport, requiring scrolling to reach.
 *
 *   The form screen (currentScreen === 'form') avoids this by using a flex
 *   column with `shrink-0` action buttons that stay pinned at the bottom of
 *   the drawer panel, outside the scrollable area.
 *   The success screen lacks this structure — its buttons are just content
 *   in a scrollable div.
 *
 *   On web (browser), there is no bottom nav bar and no safe area insets, so
 *   the buttons are visible. This is why the bug only manifests on native.
 *
 * Test approach:
 *   Since we cannot trigger real contract creation in e2e (requires blockchain),
 *   we inject the success screen HTML structure inside a Drawer-like container
 *   and test button visibility. The real Drawer CSS rule
 *   `.drawer-scroll-area:last-child { padding-bottom: calc(1rem + var(--safe-area-inset-bottom)) }`
 *   is activated by setting the --safe-area-inset-bottom CSS custom property,
 *   simulating the native device safe area.
 *
 *   The test focuses on two aspects:
 *   1. STRUCTURAL: buttons are inside scroll area (bug) vs sibling/parent (fix)
 *   2. VISIBILITY: buttons are clipped below the scroll fold on native
 *
 *   Two viewport sizes are tested:
 *   - Standard iPhone 12 (390×844) — content overflows with safe area
 *   - Smaller devices (390×700) — buttons definitively clipped
 */
import { test, expect } from './fixtures/cross-browser-auth';

const MOBILE_VIEWPORT_STANDARD = { width: 390, height: 844 };
const MOBILE_VIEWPORT_SMALL = { width: 390, height: 700 };

const SUCCESS_SCREEN_HTML = `
	<div class="space-y-6 text-center">
		<div class="flex justify-center">
			<div class="bg-success/10 rounded-full p-4">
				<svg xmlns="http://www.w3.org/2000/svg"
					class="text-success h-16 w-16"
					fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
						d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
				</svg>
			</div>
		</div>
		<div class="space-y-2">
			<h3 class="text-xl font-bold">Contract Created Successfully!</h3>
			<p class="text-base-content/70">
				Your escrow contract has been funded with 0.001 RBTC ($100.00 USD).
			</p>
		</div>
		<div class="bg-base-200 rounded-lg p-4">
			<h4 class="mb-3 font-semibold">Contract Creation Status</h4>
			<div class="flex items-center gap-3">
				<svg xmlns="http://www.w3.org/2000/svg"
					class="text-success h-5 w-5"
					fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
						d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
				</svg>
				<span class="text-success">Contract confirmed on chain</span>
			</div>
		</div>
		<div class="bg-base-200 rounded-lg p-4">
			<h4 class="text-base-content mb-2 font-semibold">What Happens Next</h4>
			<ul class="text-base-content/80 space-y-1 text-left text-sm">
				<li>&#x2022; The tasker will be notified and can begin working on your task</li>
				<li>&#x2022; Once the work is complete, you can review and release the funds</li>
				<li>&#x2022; Your funds are held securely in escrow until you release them</li>
				<li>&#x2022; You can message the tasker at any time for updates</li>
			</ul>
		</div>
		<div data-testid="success-action-buttons"
			class="flex flex-col gap-3 pt-4 sm:flex-row">
			<button data-testid="btn-create-new-task" class="btn btn-outline flex-1">
				Create New Task
			</button>
			<button data-testid="btn-go-to-contracts" class="btn btn-primary flex-1">
				Go to Contracts
			</button>
		</div>
	</div>
`;

const SUCCESS_SCREEN_CONTENT_NO_BUTTONS = `
	<div class="space-y-6 text-center">
		<div class="flex justify-center">
			<div class="bg-success/10 rounded-full p-4">
				<svg xmlns="http://www.w3.org/2000/svg"
					class="text-success h-16 w-16"
					fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
						d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
				</svg>
			</div>
		</div>
		<div class="space-y-2">
			<h3 class="text-xl font-bold">Contract Created Successfully!</h3>
			<p class="text-base-content/70">
				Your escrow contract has been funded with 0.001 RBTC ($100.00 USD).
			</p>
		</div>
		<div class="bg-base-200 rounded-lg p-4">
			<h4 class="mb-3 font-semibold">Contract Creation Status</h4>
			<div class="flex items-center gap-3">
				<svg xmlns="http://www.w3.org/2000/svg"
					class="text-success h-5 w-5"
					fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
						d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
				</svg>
				<span class="text-success">Contract confirmed on chain</span>
			</div>
		</div>
		<div class="bg-base-200 rounded-lg p-4">
			<h4 class="text-base-content mb-2 font-semibold">What Happens Next</h4>
			<ul class="text-base-content/80 space-y-1 text-left text-sm">
				<li>&#x2022; The tasker will be notified and can begin working on your task</li>
				<li>&#x2022; Once the work is complete, you can review and release the funds</li>
				<li>&#x2022; Your funds are held securely in escrow until you release them</li>
				<li>&#x2022; You can message the tasker at any time for updates</li>
			</ul>
		</div>
	</div>
`;

/**
 * Inject a Drawer-like container with success screen content.
 *
 * @param options.bottomOffset  CSS bottom value for the drawer (simulates bottom nav)
 * @param options.safeArea      Value for --safe-area-inset-bottom CSS custom property
 * @param options.useFixedLayout  If true, buttons are placed as sibling to scroll area (fix).
 *                                If false, buttons are inside scroll area (current bug).
 */
async function injectDrawerWithSuccessScreen(
	page: import('@playwright/test').Page,
	options: {
		bottomOffset: string;
		safeArea: string;
		useFixedLayout: boolean;
	}
) {
	const { bottomOffset, safeArea, useFixedLayout } = options;

	await page.evaluate(
		(args) => {
			document.getElementById('test-drawer-container')?.remove();

			// Set CSS custom properties
			document.documentElement.style.setProperty('--safe-area-inset-bottom', args.safeArea);

			const container = document.createElement('div');
			container.id = 'test-drawer-container';
			container.style.cssText = `
				position: fixed; top: 0; right: 0; bottom: ${args.offset}; width: 100%;
				z-index: 70; display: flex; flex-direction: column;
				overflow: hidden; background: oklch(var(--b1, 1 0 0));
				box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.25);
			`;

			const header = document.createElement('div');
			header.className = 'bg-base-200 flex flex-none items-center justify-between p-4 shadow-sm';
			header.innerHTML =
				'<h4 class="min-w-0 flex-1 truncate pr-2 text-xl font-bold">Accept Bid &amp; Fund Contract</h4>';

			const scrollArea = document.createElement('div');
			scrollArea.className = 'drawer-scroll-area flex-1 overflow-y-auto p-4';
			// Apply safe area padding — the real Drawer uses Svelte-scoped CSS:
			// .drawer-scroll-area:last-child { padding-bottom: calc(1rem + var(--safe-area-inset-bottom)) }
			// Since our elements don't have Svelte scoping, apply manually.
			const safeAreaPx = parseInt(args.safeArea) || 0;
			scrollArea.style.paddingBottom = `calc(1rem + ${safeAreaPx}px)`;

			if (args.fixed) {
				// FIXED: buttons as sibling to scroll area (outside, like form screen)
				scrollArea.innerHTML = args.contentNoButtons;
				container.appendChild(header);
				container.appendChild(scrollArea);

				const buttons = document.createElement('div');
				buttons.className =
					'border-base-300 bg-base-100 flex shrink-0 flex-col gap-3 border-t py-4 sm:flex-row';
				buttons.setAttribute('data-testid', 'success-action-buttons');
				buttons.innerHTML =
					'<button data-testid="btn-create-new-task" class="btn btn-outline flex-1">Create New Task</button>' +
					'<button data-testid="btn-go-to-contracts" class="btn btn-primary flex-1">Go to Contracts</button>';
				container.appendChild(buttons);
			} else {
				// BUGGY: buttons inside scroll area (current success screen behavior)
				scrollArea.innerHTML = args.contentWithButtons;
				container.appendChild(header);
				container.appendChild(scrollArea);
			}

			document.body.appendChild(container);
		},
		{
			offset: bottomOffset,
			safeArea,
			fixed: useFixedLayout,
			contentWithButtons: SUCCESS_SCREEN_HTML,
			contentNoButtons: SUCCESS_SCREEN_CONTENT_NO_BUTTONS
		}
	);
}

/**
 * Check layout state: are buttons inside or outside the scroll area?
 * Are buttons visible in the drawer viewport?
 */
async function getLayoutState(page: import('@playwright/test').Page) {
	return page.evaluate(() => {
		const createBtn = document.querySelector(
			'#test-drawer-container [data-testid="btn-create-new-task"]'
		);
		const contractsBtn = document.querySelector(
			'#test-drawer-container [data-testid="btn-go-to-contracts"]'
		);
		const scrollArea = document.querySelector('#test-drawer-container .drawer-scroll-area');
		const container = document.getElementById('test-drawer-container');

		if (!createBtn || !contractsBtn || !scrollArea || !container) {
			return {
				error: 'Elements not found',
				createBtnFound: !!createBtn,
				contractsBtnFound: !!contractsBtn,
				scrollAreaFound: !!scrollArea,
				containerFound: !!container
			};
		}

		const createRect = createBtn.getBoundingClientRect();
		const contractsRect = contractsBtn.getBoundingClientRect();
		const scrollRect = scrollArea.getBoundingClientRect();
		const containerRect = container.getBoundingClientRect();

		const buttonsInsideScrollArea = scrollArea.contains(createBtn);

		// Check visibility against the drawer container (not just the scroll area),
		// because in the fixed layout, buttons are siblings to the scroll area.
		const createVisible =
			createRect.top >= containerRect.top &&
			createRect.bottom <= containerRect.bottom &&
			createRect.height > 0;
		const contractsVisible =
			contractsRect.top >= containerRect.top &&
			contractsRect.bottom <= containerRect.bottom &&
			contractsRect.height > 0;

		const scrollable = scrollArea.scrollHeight > scrollArea.clientHeight + 2;
		const overflowPx = scrollArea.scrollHeight - scrollArea.clientHeight;

		return {
			buttonsInsideScrollArea,
			createBtnVisible: createVisible,
			contractsBtnVisible: contractsVisible,
			isScrollable: scrollable,
			overflowPx,
			scrollAreaScrollHeight: scrollArea.scrollHeight,
			scrollAreaClientHeight: scrollArea.clientHeight,
			scrollAreaHeight: Math.round(scrollRect.height),
			scrollAreaComputedPaddingBottom: getComputedStyle(scrollArea).paddingBottom,
			containerHeight: Math.round(containerRect.height),
			viewportHeight: window.innerHeight
		};
	});
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe('Bid acceptance success — mobile native action buttons', () => {
	// ------------------------------------------------------------------
	// BUG: Buttons inside scroll area (structural)
	// ------------------------------------------------------------------

	test('BUG: action buttons are inside the scrollable content area', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.setViewportSize(MOBILE_VIEWPORT_STANDARD);
		await authenticatedPage.goto('/dashboard', { waitUntil: 'domcontentloaded' });
		await authenticatedPage.waitForTimeout(2000);

		await injectDrawerWithSuccessScreen(authenticatedPage, {
			bottomOffset: '80px',
			safeArea: '34px',
			useFixedLayout: false
		});
		await authenticatedPage.waitForTimeout(500);

		const state = await getLayoutState(authenticatedPage);
		expect(state.error).toBeUndefined();

		// BUG: buttons are children of the scroll area
		expect(state.buttonsInsideScrollArea).toBe(true);
	});

	// ------------------------------------------------------------------
	// BUG: Content overflows on native
	// ------------------------------------------------------------------

	test('BUG: success screen content overflows on native with safe area', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.setViewportSize(MOBILE_VIEWPORT_STANDARD);
		await authenticatedPage.goto('/dashboard', { waitUntil: 'domcontentloaded' });
		await authenticatedPage.waitForTimeout(2000);

		await injectDrawerWithSuccessScreen(authenticatedPage, {
			bottomOffset: '80px',
			safeArea: '34px',
			useFixedLayout: false
		});
		await authenticatedPage.waitForTimeout(500);

		const state = await getLayoutState(authenticatedPage);
		expect(state.error).toBeUndefined();

		// Content overflows — scrollHeight exceeds clientHeight
		expect(state.isScrollable).toBe(true);
		expect(state.overflowPx).toBeGreaterThan(0);

		// Safe area padding is applied (calc(1rem + 34px) = 50px)
		expect(state.scrollAreaComputedPaddingBottom).toBe('50px');
	});

	// ------------------------------------------------------------------
	// BUG: Buttons clipped on smaller devices
	// ------------------------------------------------------------------

	test('BUG: action buttons clipped on smaller mobile devices', async ({ authenticatedPage }) => {
		await authenticatedPage.setViewportSize(MOBILE_VIEWPORT_SMALL);
		await authenticatedPage.goto('/dashboard', { waitUntil: 'domcontentloaded' });
		await authenticatedPage.waitForTimeout(2000);

		await injectDrawerWithSuccessScreen(authenticatedPage, {
			bottomOffset: '80px',
			safeArea: '34px',
			useFixedLayout: false
		});
		await authenticatedPage.waitForTimeout(500);

		const state = await getLayoutState(authenticatedPage);
		expect(state.error).toBeUndefined();

		// On smaller devices, buttons are definitively clipped
		expect(state.createBtnVisible).toBe(false);
		expect(state.contractsBtnVisible).toBe(false);
		expect(state.isScrollable).toBe(true);
		expect(state.buttonsInsideScrollArea).toBe(true);
	});

	test('BUG: buttons reachable only after scroll on small devices', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.setViewportSize(MOBILE_VIEWPORT_SMALL);
		await authenticatedPage.goto('/dashboard', { waitUntil: 'domcontentloaded' });
		await authenticatedPage.waitForTimeout(2000);

		await injectDrawerWithSuccessScreen(authenticatedPage, {
			bottomOffset: '80px',
			safeArea: '34px',
			useFixedLayout: false
		});
		await authenticatedPage.waitForTimeout(500);

		// Not visible initially
		const before = await getLayoutState(authenticatedPage);
		expect(before.createBtnVisible).toBe(false);

		// Scroll to bottom
		await authenticatedPage.evaluate(() => {
			const scrollArea = document.querySelector('#test-drawer-container .drawer-scroll-area');
			if (scrollArea) scrollArea.scrollTop = scrollArea.scrollHeight;
		});
		await authenticatedPage.waitForTimeout(300);

		// Visible after scrolling
		const after = await getLayoutState(authenticatedPage);
		expect(after.createBtnVisible).toBe(true);
		expect(after.contractsBtnVisible).toBe(true);
	});

	// ------------------------------------------------------------------
	// CONTROL: Buttons visible on web (no safe area, no bottom nav)
	// ------------------------------------------------------------------

	test('CONTROL: buttons visible on web — no bottom nav or safe area', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.setViewportSize(MOBILE_VIEWPORT_STANDARD);
		await authenticatedPage.goto('/dashboard', { waitUntil: 'domcontentloaded' });
		await authenticatedPage.waitForTimeout(2000);

		await injectDrawerWithSuccessScreen(authenticatedPage, {
			bottomOffset: '0px',
			safeArea: '0px',
			useFixedLayout: false
		});
		await authenticatedPage.waitForTimeout(500);

		const state = await getLayoutState(authenticatedPage);
		expect(state.error).toBeUndefined();

		expect(state.createBtnVisible).toBe(true);
		expect(state.contractsBtnVisible).toBe(true);
	});

	// ------------------------------------------------------------------
	// PLATFORM COMPARISON
	// ------------------------------------------------------------------

	test('same content fits on web but overflows on native', async ({ authenticatedPage }) => {
		await authenticatedPage.setViewportSize(MOBILE_VIEWPORT_STANDARD);
		await authenticatedPage.goto('/dashboard', { waitUntil: 'domcontentloaded' });
		await authenticatedPage.waitForTimeout(2000);

		// Web
		await injectDrawerWithSuccessScreen(authenticatedPage, {
			bottomOffset: '0px',
			safeArea: '0px',
			useFixedLayout: false
		});
		await authenticatedPage.waitForTimeout(300);
		const webState = await getLayoutState(authenticatedPage);

		// Native
		await injectDrawerWithSuccessScreen(authenticatedPage, {
			bottomOffset: '80px',
			safeArea: '34px',
			useFixedLayout: false
		});
		await authenticatedPage.waitForTimeout(300);
		const nativeState = await getLayoutState(authenticatedPage);

		// Web: fits
		expect(webState.isScrollable).toBe(false);
		expect(webState.createBtnVisible).toBe(true);

		// Native: overflows
		expect(nativeState.isScrollable).toBe(true);
		expect(nativeState.overflowPx).toBeGreaterThan(0);
	});

	// ------------------------------------------------------------------
	// EXPECTED: After fix, buttons are pinned footer (outside scroll area)
	// ------------------------------------------------------------------

	test('EXPECTED: after fix, buttons outside scroll area (pinned footer)', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.setViewportSize(MOBILE_VIEWPORT_STANDARD);
		await authenticatedPage.goto('/dashboard', { waitUntil: 'domcontentloaded' });
		await authenticatedPage.waitForTimeout(2000);

		await injectDrawerWithSuccessScreen(authenticatedPage, {
			bottomOffset: '80px',
			safeArea: '34px',
			useFixedLayout: true
		});
		await authenticatedPage.waitForTimeout(500);

		const state = await getLayoutState(authenticatedPage);
		expect(state.error).toBeUndefined();

		// Buttons are OUTSIDE the scroll area (sibling, not child)
		expect(state.buttonsInsideScrollArea).toBe(false);

		// Buttons are always visible
		expect(state.createBtnVisible).toBe(true);
		expect(state.contractsBtnVisible).toBe(true);
	});

	test('EXPECTED: fix works on smaller devices too', async ({ authenticatedPage }) => {
		await authenticatedPage.setViewportSize(MOBILE_VIEWPORT_SMALL);
		await authenticatedPage.goto('/dashboard', { waitUntil: 'domcontentloaded' });
		await authenticatedPage.waitForTimeout(2000);

		await injectDrawerWithSuccessScreen(authenticatedPage, {
			bottomOffset: '80px',
			safeArea: '34px',
			useFixedLayout: true
		});
		await authenticatedPage.waitForTimeout(500);

		const state = await getLayoutState(authenticatedPage);
		expect(state.error).toBeUndefined();

		// Buttons outside scroll area
		expect(state.buttonsInsideScrollArea).toBe(false);

		// Buttons visible even on small viewport
		expect(state.createBtnVisible).toBe(true);
		expect(state.contractsBtnVisible).toBe(true);
	});
});
