import { browser } from '$app/environment';
import { nip19 } from 'nostr-tools';
import type { NDKEvent, NDKSubscription } from '@nostr-dev-kit/ndk';
import { ndk } from '$lib/nostr/ndk';
import { getNpub } from '$lib/utils/nostrKeys';
import { parseConsignmentMessage } from './consignment-exchange';
import { ContractRune } from '$lib/runes/contract.svelte';
import { decryptDM } from '$lib/utils/nostr';
import { getNostrKeyPair } from '$lib/utils/nostrKeys';

export interface ConsignmentSubscriptionOptions {
	onApplied?: (contractId: string) => void;
	onError?: (error: unknown, event?: NDKEvent) => void;
}

/** Receives encrypted RGB consignment DMs and applies confirmed transfers to local runes. */
export class RgbConsignmentSubscription {
	private subscription: NDKSubscription | null = null;
	private readonly seenEventIds = new Set<string>();

	async start(options: ConsignmentSubscriptionOptions = {}): Promise<void> {
		if (!browser || this.subscription) return;
		let pubkey: string | null;
		try {
			const npub = await getNpub();
			if (!npub) return;
			pubkey = nostrPubkey(npub);
		} catch (error) {
			options.onError?.(error);
			return;
		}
		if (!pubkey) return;
		this.subscription = ndk.subscribe(
			{ kinds: [4], '#p': [pubkey] },
			{
				closeOnEose: false,
				onEvent: (event) => {
					void this.handleEvent(event, options);
				}
			}
		);
	}

	stop(): void {
		this.subscription?.stop();
		this.subscription = null;
		this.seenEventIds.clear();
	}

	private async handleEvent(
		event: NDKEvent,
		options: ConsignmentSubscriptionOptions
	): Promise<void> {
		if (this.seenEventIds.has(event.id)) return;
		this.seenEventIds.add(event.id);
		try {
			// Use nostr-tools nip44 for decryption (matches sender's encryption)
			const { nsec } = await getNostrKeyPair();
			const ourPubkey = nostrPubkey(await getNpub());
			if (!ourPubkey) return;

			let decryptedContent: string;
			if (event.pubkey === ourPubkey) {
				// We are the sender, decrypt with recipient's pubkey
				const recipientTag = event.tags.find((t: string[]) => t[0] === 'p');
				if (!recipientTag || !recipientTag[1]) return;
				decryptedContent = await decryptDM(nsec, event.content, recipientTag[1]);
			} else {
				// We are the recipient, decrypt with sender's pubkey
				decryptedContent = await decryptDM(nsec, event.content, event.pubkey);
			}

			const message = parseConsignmentMessage(decryptedContent);
			if (!message) return;
			const rune = ContractRune.get(message.contractId);
			if (!rune) return;
			await rune.applyIncomingConsignment(message);
			options.onApplied?.(message.contractId);
		} catch (error) {
			if (bech32LetterError(error)) return;
			options.onError?.(error, event);
		}
	}
}

/** Hex pubkey, or an npub. RGB ids such as `sb:utxob:…` are not bech32. */
function nostrPubkey(value: string): string | null {
	const trimmed = value.trim();
	if (/^[0-9a-f]{64}$/i.test(trimmed)) return trimmed.toLowerCase();
	if (!trimmed.startsWith('npub1')) return null;
	try {
		const decoded = nip19.decode(trimmed);
		if (decoded.type !== 'npub' || typeof decoded.data !== 'string') return null;
		return decoded.data;
	} catch {
		return null;
	}
}

function bech32LetterError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /unknown letter/i.test(message);
}

export const rgbConsignmentSubscription = new RgbConsignmentSubscription();
