// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
		
		// Add Google auth types
		interface Window {
		  google: {
			accounts: {
			  id: {
				initialize: (config: any) => void;
				prompt: () => void;
			  };
			};
		  };
		};
	}
}

export { };
