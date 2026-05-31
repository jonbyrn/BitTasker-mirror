/**
 * Extend the global `window` with Trezor Connect CDN API.
 *
 * The `@trezor/connect-web` package is loaded from CDN
 * (https://connect.trezor.io/9/trezor-connect.js) rather than bundled due to
 * esbuild compatibility issues with its complex CJS dependency tree.
 *
 * @see src/lib/services/external-wallet/trezor-connector.ts
 */
interface TrezorConnectGlobal {
	init(params: Record<string, unknown>): Promise<void>;
	dispose(): void;
	getPublicKey(params: {
		path: string;
		coin: string;
		showOnTrezor?: boolean;
		scriptType?: string;
	}): Promise<{ success: boolean; payload?: { xpub?: string; error?: string } }>;
	getAddress(params: {
		path: string;
		coin: string;
		showOnTrezor?: boolean;
		scriptType?: string;
	}): Promise<{ success: boolean; payload?: { address?: string; error?: string } }>;
	ethereumGetAddress(params: {
		path: string;
		showOnTrezor?: boolean;
	}): Promise<{ success: boolean; payload?: { address?: string; error?: string } }>;
	ethereumSignTransaction(params: {
		path: string;
		transaction: {
			to: string;
			value: string;
			data: string;
			chainId: number;
			nonce: string;
			gasLimit: string;
			gasPrice: string;
		};
	}): Promise<{
		success: boolean;
		payload?: { r: string; s: string; v: string };
		error?: string;
	}>;
	signTransaction(params: {
		coin: string;
		inputs: Array<{
			address_n: number[];
			prev_index: number;
			prev_hash: string;
			amount: string;
			script_type: string;
		}>;
		outputs: Array<{
			address: string;
			amount: string;
			script_type: string;
		}>;
		push?: boolean;
	}): Promise<{
		success: boolean;
		payload?: { signatures: string[]; serializedTx: string };
		error?: string;
	}>;
	manifest(params: Record<string, unknown>): void;
	cancel(): void;
	setTransports(transports: string[]): void;
}

declare global {
	interface Window {
		TrezorConnect?: TrezorConnectGlobal;
	}
}

export {};
