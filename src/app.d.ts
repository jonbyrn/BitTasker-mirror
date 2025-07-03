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

	interface TurnstileWidget {
		render: (container: string | HTMLElement, params: any) => string;
		reset: (widgetId?: string) => void;
		getResponse: (widgetId?: string) => string;
		isExpired: (widgetId?: string) => boolean;
		remove: (widgetId?: string) => void;
	}

	interface Window {
		turnstile: TurnstileWidget;
		onloadTurnstileCallback: () => void;
	}

	const __APP_VERSION__: string;
}

export { };
