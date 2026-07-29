// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	// Add Google auth types
	interface Window {
		google: {
			accounts: {
				id: {
					initialize: (config: {
						client_id: string;
						callback: (response: { credential: string }) => void;
						auto_select?: boolean;
						cancel_on_tap_outside?: boolean;
					}) => void;
					prompt: () => void;
				};
			};
		};
	}

	// TypeScript interfaces for Turnstile for type checking
	type TurnstileCallback = (token: string) => void;

	interface TurnstileRenderParams {
		sitekey: string;
		callback?: (token: string) => void;
		'error-callback'?: () => void;
		'expired-callback'?: () => void;
		'timeout-callback'?: () => void;
		theme?: 'auto' | 'light' | 'dark';
		language?: string;
		tabindex?: number;
		size?: 'normal' | 'compact';
		appearance?: 'always' | 'execute' | 'interaction-only';
		execution?: 'render' | 'execute';
		[key: string]: unknown;
	}

	interface TurnstileWidget {
		render: (container: string | HTMLElement, params: TurnstileRenderParams) => string;
		reset: (widgetId?: string) => void;
		getResponse: (widgetId?: string) => string;
		isExpired: (widgetId?: string) => boolean;
		remove: (widgetId?: string) => void;
	}

	interface Window {
		turnstile: TurnstileWidget;
		onloadTurnstileCallback: () => void;
		/** Set by Playwright for E2E tests (e.g. virtual WebAuthn). */
		__PLAYWRIGHT_TEST__?: boolean;
	}

	const __APP_VERSION__: string;

	/** Unique identifier stamped at build time via vite.config.ts `define`. */
	const __BUILD_VERSION__: string;

	interface GlobalEventHandlersEventMap {
		'dashboard-dropdown-open': CustomEvent<{ id: string }>;
	}
}

// unplugin-icons type declarations
declare module '~icons/*' {
	import type { Component } from 'svelte';
	const component: Component<{ class?: string }>;
	export default component;
}

declare module '~icons/mdi/*' {
	import type { Component } from 'svelte';
	const component: Component<{ class?: string }>;
	export default component;
}

export {};
