import { sendDirectMessage } from '$lib/nostr/direct-messages';
import { customerOrderMessage, merchantStatusMessage, type CheckoutChoice } from './nip15';

async function sendNote(recipientPubkey: string, content: string): Promise<void> {
	try {
		await sendDirectMessage(content, recipientPubkey, undefined, [], 'protocol');
	} catch (error) {
		console.warn(
			'[market] checkout message was not sent',
			error instanceof Error ? error.message : error
		);
	}
}

/** NIP-15 type 0 order, encrypted as a kind 4 message. The public order has no address. */
export async function sendCustomerOrder(
	sellerPubkey: string,
	choice: CheckoutChoice,
	orderId: string,
	buyerPubkey: string
): Promise<void> {
	await sendNote(sellerPubkey, customerOrderMessage(choice, orderId, buyerPubkey));
}

/** NIP-15 type 2 status, sent by the seller after handover or collection. */
export async function sendMerchantStatus(
	buyerPubkey: string,
	orderId: string,
	message: string,
	shipped: boolean
): Promise<void> {
	await sendNote(buyerPubkey, merchantStatusMessage(orderId, message, shipped));
}
