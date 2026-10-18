import { SIGNET_LSP_URL } from './signet-lsp';

/** Signet LSP node from GET /get_info. Used when that request does not answer. */
export const SIGNET_LSP_PUBKEY =
	'02a621de2b3d86d3e618ca847bab220304320f0af58ea3f5e295257db32502366a';

const PUBKEY = /^0[23][0-9a-f]{64}$/i;
const LOOKUP_MS = 4_000;

export interface VirtualChannelFields {
	enableVirtualChannels: boolean;
	enableVirtualChannelsV0: boolean;
	virtualPeerPubkeys: readonly string[];
}

export function virtualChannelFields(
	enabled: boolean,
	pubkeys: readonly string[]
): VirtualChannelFields {
	const keys = pubkeys.map((key) => key.trim()).filter((key) => PUBKEY.test(key));
	return {
		enableVirtualChannels: enabled,
		enableVirtualChannelsV0: enabled,
		virtualPeerPubkeys: enabled ? (keys.length > 0 ? keys : [SIGNET_LSP_PUBKEY]) : []
	};
}

/** Provider pubkey for the allowlist. A failed lookup still returns the known signet key. */
export async function providerVirtualPeers(): Promise<readonly string[]> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), LOOKUP_MS);
	try {
		const response = await fetch(`${SIGNET_LSP_URL}/get_info`, { signal: controller.signal });
		if (!response.ok) return [SIGNET_LSP_PUBKEY];
		const body = (await response.json()) as { pubkey?: unknown };
		const pubkey = typeof body.pubkey === 'string' ? body.pubkey.trim() : '';
		return PUBKEY.test(pubkey) ? [pubkey] : [SIGNET_LSP_PUBKEY];
	} catch (error: unknown) {
		console.warn(
			'[wallet-init] provider key lookup failed',
			error instanceof Error ? error.message : String(error)
		);
		return [SIGNET_LSP_PUBKEY];
	} finally {
		clearTimeout(timer);
	}
}

interface VirtualNode {
	setEnableVirtualChannelsV0?: (enabled: boolean) => void;
	setVirtualPeerPubkeys?: (pubkeys: readonly string[]) => void;
}

interface VirtualWallet {
	_manager?: {
		rlnBinding?: {
			nodeHandle?: VirtualNode;
		};
	};
}

/** Turn virtual channels on before unlock starts the node runtime. */
export function armVirtualChannels(wallet: object, pubkeys: readonly string[]): void {
	const node = (wallet as VirtualWallet)._manager?.rlnBinding?.nodeHandle;
	if (!node || typeof node.setEnableVirtualChannelsV0 !== 'function') return;
	try {
		node.setEnableVirtualChannelsV0(true);
		if (typeof node.setVirtualPeerPubkeys === 'function' && pubkeys.length > 0) {
			node.setVirtualPeerPubkeys(pubkeys);
		}
	} catch (error: unknown) {
		console.warn(
			'[wallet-init] virtual channels failed',
			error instanceof Error ? error.message : String(error)
		);
	}
}
