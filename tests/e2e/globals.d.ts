export {};

declare global {
	interface Window {
		__PLAYWRIGHT_TEST__?: boolean;
		__E2E_NSEC__?: string;
		__E2E_NPUB__?: string;
		__E2E_MNEMONIC__?: string;
	}
}
