import type { UTEXOWallet } from '@utexo/rgb-sdk-web';
import { getNostrKeyPair, getNpub } from '$lib/utils/nostrKeys';
import {
	listenForIncomingMessages,
	sendDirectMessage,
	type ParsedDirectMessage
} from '$lib/nostr/direct-messages';
import { state } from '$lib/stores/wallet/wallet-state';

const SWAP_PROTOCOL = 'bittasker-utexo-swap';
const SWAP_VERSION = 1;

export type UtexoSwapRole = 'maker' | 'taker';
export type UtexoSwapMessageType = 'maker-init' | 'taker' | 'maker-execute';

export interface UtexoSwapEnvelope {
	protocol: typeof SWAP_PROTOCOL;
	version: typeof SWAP_VERSION;
	type: UtexoSwapMessageType;
	swapId: string;
	payload: string;
}

export interface UtexoSwapMessage {
	envelope: UtexoSwapEnvelope;
	event: ParsedDirectMessage['event'];
	senderPubkey: string;
}

export interface MakerInitParams {
	swapId: string;
	peerPubkey: string;
	request: unknown;
}

export interface TakerParams {
	swapId: string;
	peerPubkey: string;
	makerPayload: string;
}

export interface MakerExecuteParams {
	swapId: string;
	peerPubkey: string;
	takerPayload: string;
}

export interface UtexoSwapSubscription {
	stop: () => void;
}

function requireWallet(wallet: UTEXOWallet | null | undefined): UTEXOWallet {
	if (!wallet) throw new Error('RGB wallet is not initialized.');
	return wallet;
}

function serializeSdkResult(result: unknown): string {
	if (typeof result === 'string') return result;
	return JSON.stringify(result);
}

function createEnvelope(
	type: UtexoSwapMessageType,
	swapId: string,
	payload: string
): UtexoSwapEnvelope {
	if (!swapId.trim()) throw new Error('Swap id is required.');
	return { protocol: SWAP_PROTOCOL, version: SWAP_VERSION, type, swapId, payload };
}

function parseEnvelope(value: string): UtexoSwapEnvelope | null {
	try {
		const parsed: unknown = JSON.parse(value);
		if (!parsed || typeof parsed !== 'object') return null;
		const candidate = parsed as Partial<UtexoSwapEnvelope>;
		if (
			candidate.protocol !== SWAP_PROTOCOL ||
			candidate.version !== SWAP_VERSION ||
			typeof candidate.type !== 'string' ||
			typeof candidate.swapId !== 'string' ||
			typeof candidate.payload !== 'string'
		) {
			return null;
		}
		return candidate as UtexoSwapEnvelope;
	} catch {
		return null;
	}
}

async function sendEnvelope(peerPubkey: string, envelope: UtexoSwapEnvelope): Promise<void> {
	await sendDirectMessage(
		JSON.stringify(envelope),
		peerPubkey,
		undefined,
		[
			['t', SWAP_PROTOCOL],
			['d', envelope.swapId]
		],
		'protocol'
	);
}

export async function makerInit(params: MakerInitParams): Promise<UtexoSwapEnvelope> {
	const wallet = requireWallet(state.utexoWallet);
	const requestJson = JSON.stringify(params.request);
	const result = await wallet.makerInit({ requestJson });
	const envelope = createEnvelope('maker-init', params.swapId, serializeSdkResult(result));
	await sendEnvelope(params.peerPubkey, envelope);
	return envelope;
}

export async function taker(params: TakerParams): Promise<UtexoSwapEnvelope> {
	const wallet = requireWallet(state.utexoWallet);
	const result = await wallet.taker(params.makerPayload);
	const envelope = createEnvelope('taker', params.swapId, serializeSdkResult(result));
	await sendEnvelope(params.peerPubkey, envelope);
	return envelope;
}

export async function makerExecute(params: MakerExecuteParams): Promise<UtexoSwapEnvelope> {
	const wallet = requireWallet(state.utexoWallet);
	const result = await wallet.makerExecute(params.takerPayload);
	const envelope = createEnvelope('maker-execute', params.swapId, serializeSdkResult(result));
	await sendEnvelope(params.peerPubkey, envelope);
	return envelope;
}

export async function subscribeToUtexoSwaps(
	callback: (message: UtexoSwapMessage) => void
): Promise<UtexoSwapSubscription> {
	const [{ nsec }, npub] = await Promise.all([getNostrKeyPair(), getNpub()]);
	const stop = listenForIncomingMessages(npub, nsec, (message) => {
		const envelope = parseEnvelope(message.plaintext);
		if (!envelope) return;
		callback({
			envelope,
			event: message.event,
			senderPubkey: message.senderPubkey
		});
	});
	return { stop };
}

export const utexoSwap = {
	makerInit,
	taker,
	makerExecute,
	subscribe: subscribeToUtexoSwaps
};
