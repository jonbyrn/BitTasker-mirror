import type { NostrEvent } from 'nostr-tools';
import { publishNostrEvent } from '$lib/utils/nostr';
import KINDS from '$lib/utils/constants/kinds';

export interface ConsignmentExchangeMessage {
	type: 'rgb-consignment';
	contractId: string;
	assetId: string;
	invoice: string;
	consignment?: string;
	transferId?: string;
	createdAt: number;
}

export async function sendConsignmentToPeer(
	recipientPubkey: string,
	message: Omit<ConsignmentExchangeMessage, 'type' | 'createdAt'>
): Promise<NostrEvent> {
	if (!recipientPubkey.trim()) throw new Error('Consignment recipient is required');
	if (!message.contractId.trim() || !message.assetId.trim() || !message.invoice.trim()) {
		throw new Error('Consignment contract, asset, and invoice are required');
	}
	const result = await publishNostrEvent(
		KINDS.DIRECT_MESSAGES,
		JSON.stringify({ type: 'rgb-consignment', ...message, createdAt: Date.now() }),
		recipientPubkey,
		[
			['m', 'rgb-consignment'],
			['r', message.contractId]
		]
	);
	return result.event;
}

export function parseConsignmentMessage(content: string): ConsignmentExchangeMessage | null {
	try {
		const parsed: unknown = JSON.parse(content);
		if (
			!parsed ||
			typeof parsed !== 'object' ||
			(parsed as { type?: unknown }).type !== 'rgb-consignment' ||
			typeof (parsed as { contractId?: unknown }).contractId !== 'string' ||
			typeof (parsed as { assetId?: unknown }).assetId !== 'string' ||
			typeof (parsed as { invoice?: unknown }).invoice !== 'string' ||
			typeof (parsed as { createdAt?: unknown }).createdAt !== 'number'
		) {
			return null;
		}
		return parsed as ConsignmentExchangeMessage;
	} catch {
		return null;
	}
}
