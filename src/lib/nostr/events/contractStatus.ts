import type { Attachment } from '$lib/types/attachment';
import { RgbContractState } from '$lib/types/rgb';
import { createDebug } from '$lib/utils/debug';
import KINDS from '$lib/utils/constants/kinds';
import NDK, { NDKEvent, NDKUser } from '@nostr-dev-kit/ndk';
const d = createDebug('ndk:events:contract-status');

/**
 * Single-char + message-type tags that stay on the wire (outside the encrypted blob).
 * Matches TAG_PATTERNS.contractStatus in `tags.ts`.
 */
const PUBLIC_CONTRACT_STATUS_TAG_NAMES = new Set(['e', 'r', 'p', 's', 'v', 'm']);

function isPublicContractStatusTag(tag: NDKTag): boolean {
	return PUBLIC_CONTRACT_STATUS_TAG_NAMES.has(tag[0]);
}

function isRawEncryptedTagArray(data: unknown): data is string[][] {
	if (!Array.isArray(data)) return false;
	return data.every(
		(row) =>
			Array.isArray(row) &&
			row.length >= 2 &&
			typeof row[0] === 'string' &&
			typeof row[1] === 'string'
	);
}

function hasTagName(tags: NDKTag[], name: string): boolean {
	return tags.some((t) => t[0] === name);
}

function isLegacyNostrContractStatusContent(data: unknown): data is Record<string, unknown> {
	if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
	const o = data as Record<string, unknown>;
	if (o.type === 'contract-status') return true;
	if (typeof o.escrowId === 'string' && o.action !== undefined && o.action !== null) return true;
	if (typeof o.contractEventId === 'string' && typeof o.escrowId === 'string') return true;
	return false;
}

/**
 * Legacy JSON body (NostrContractStatus) â†’ tag rows. Wire tags win over content.
 * Does not duplicate payment id / parent event id inside encrypted tags when `r` / `e` exist on wire.
 */
function legacyStatusContentToAdditionalTags(
	parsed: Record<string, unknown>,
	wireTags: NDKTag[]
): NDKTag[] {
	const out: NDKTag[] = [];

	if (!hasTagName(wireTags, 'e') && typeof parsed.contractEventId === 'string') {
		out.push(['e', parsed.contractEventId]);
	}
	if (!hasTagName(wireTags, 'r') && typeof parsed.escrowId === 'string') {
		out.push(['r', parsed.escrowId]);
	}
	if (!hasTagName(wireTags, 's') && parsed.action !== undefined && parsed.action !== null) {
		out.push(['s', String(parsed.action)]);
	}
	if (!hasTagName(wireTags, 'm')) {
		out.push(['m', 'contract-status']);
	}

	if (parsed.message !== undefined && parsed.message !== null) {
		out.push(['message', String(parsed.message)]);
	}
	// We dont need the timestamp since we have the created_at from the event
	// if (parsed.timestamp !== undefined && parsed.timestamp !== null) {
	// 	out.push(['timestamp', String(parsed.timestamp)]);
	// }
	if (parsed.transactionHash !== undefined && parsed.transactionHash !== null) {
		out.push(['transactionHash', String(parsed.transactionHash)]);
	}
	// Legacy JSON used client/freelancer; normalize to tasker/taskee tag names (same encrypted tag set count).
	if (parsed.proposedClientAmount !== undefined && parsed.proposedClientAmount !== null) {
		out.push(['proposedTaskerAmount', String(parsed.proposedClientAmount)]);
	}
	if (parsed.proposedFreelancerAmount !== undefined && parsed.proposedFreelancerAmount !== null) {
		out.push(['proposedTaskeeAmount', String(parsed.proposedFreelancerAmount)]);
	}
	if (parsed.completionAttachments !== undefined && parsed.completionAttachments !== null) {
		const raw = parsed.completionAttachments;
		out.push(['completionAttachments', typeof raw === 'string' ? raw : JSON.stringify(raw)]);
	}
	if (parsed.completionText !== undefined && parsed.completionText !== null) {
		out.push(['completionText', String(parsed.completionText)]);
	}

	return out;
}

/** Drop redundant long-name tags when public short tags already carry the same value. */
function dedupeContractStatusTags(tags: NDKTag[]): NDKTag[] {
	const e = tags.find((t) => t[0] === 'e')?.[1];
	const r = tags.find((t) => t[0] === 'r')?.[1];
	const s = tags.find((t) => t[0] === 's')?.[1];

	return tags.filter((t) => {
		const [name, val] = t;
		if (name === 'contractEventId' && e !== undefined && val === e) return false;
		if ((name === 'escrowId' || name === 'paymentId') && r !== undefined && val === r) return false;
		if (name === 'action' && s !== undefined && String(val) === s) return false;
		return true;
	});
}

function isValidContractStatusMessageType(ev: NDKContractStatus): boolean {
	const m = ev.tagValue('m');
	return m === undefined || m === 'contract-status';
}

/**
 * Kind 31006 â€” contract / payment status updates.
 *
 * - **Wire:** public tags `e`, `r`, `p`, `s`, `v`, `m`; encrypted `content` = JSON.stringify(tag rows) for all other tags (new format).
 * - **Legacy:** encrypted `content` was a single `NostrContractStatus` JSON object â†’ merged in `from()`.
 * - After `from()`, normalized data lives in `this.tags`; getters/setters use tags.
 * - **Publish:** `toNostrEvent()` splits public vs private tags and encrypts to the **`p` recipient** (either party may author).
 * - Dispute amounts use tags **`proposedTaskerAmount` / `proposedTaskeeAmount`**. Legacy JSON bodies used `proposedClientAmount` / `proposedFreelancerAmount` as **object keys** onlyâ€”those are mapped when building tags in `legacyStatusContentToAdditionalTags` (legacy never published client/freelancer as tag names in a tag array).
 */
export class NDKContractStatus extends NDKEvent {
	static kind = KINDS.CONTRACT_STATUS;
	static kinds = [KINDS.CONTRACT_STATUS];

	/**
	 * When `from()` parsed decrypted content as legacy `NostrContractStatus` JSON (not tag-array format),
	 * this is that object as returned by `JSON.parse`, so no fields are lost to tag mapping.
	 * Undefined for events that used the new encrypted tag-array content or were not built via `from()`.
	 */
	private _legacyContent: Record<string, unknown> | undefined;

	constructor(ndk?: NDK, event?: NostrEvent | NDKEvent) {
		super(ndk, event);
		this.kind ??= KINDS.CONTRACT_STATUS;

		this.on('relay:published', (relay) => {
			this.emit('published', relay);
		});
	}

	static async from(event: NDKEvent): Promise<NDKContractStatus | undefined> {
		const status = new NDKContractStatus(event.ndk, event);

		const mWire = status.tagValue('m');
		if (mWire !== undefined && mWire !== 'contract-status') {
			return undefined;
		}

		const prevContent = status.content;
		const authorPubkey = status.author.pubkey ?? '';
		const currentUserPubkey = status.ndk?.activeUser?.pubkey ?? '';
		const wireTags = [...status.tags] as NDKTag[];
		const pRecipient = status.tagValue('p') ?? status.getMatchingTags('p').find((t) => t[1])?.[1];

		let otherPartyPubkey: string | undefined;
		if (currentUserPubkey && authorPubkey) {
			otherPartyPubkey = currentUserPubkey === authorPubkey ? pRecipient : authorPubkey;
		} else if (currentUserPubkey && pRecipient) {
			otherPartyPubkey = currentUserPubkey === pRecipient ? authorPubkey : pRecipient;
		} else {
			otherPartyPubkey = pRecipient;
		}

		let decryptFailed = false;
		if (otherPartyPubkey) {
			const otherUser = new NDKUser({ pubkey: otherPartyPubkey });
			try {
				await status.decrypt(otherUser);
				//d.log('decrypted contract status', { eventId: event.id });
			} catch (_e) {
				decryptFailed = true;
				d.warn('NDKContractStatus.from: decryption failed', {
					paymentId: status.paymentId,
					event: status,
					err: _e
				});
				status.content = prevContent;
			}
		} else if (status.content && status.content.length > 0) {
			d.warn('NDKContractStatus.from: no counterparty pubkey for decrypt', {
				eventId: event.id
			});
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(status.content);
		} catch {
			if (decryptFailed) {
				d.warn('NDKContractStatus.from: content not JSON after decrypt failure', {
					eventId: event.id
				});
			}
			return undefined;
		}

		const additions: NDKTag[] = [];

		if (isRawEncryptedTagArray(parsed)) {
			additions.push(...(parsed as NDKTag[]));
		} else if (isLegacyNostrContractStatusContent(parsed)) {
			status._legacyContent = parsed as Record<string, unknown>;
			additions.push(...legacyStatusContentToAdditionalTags(parsed, wireTags));
		} else {
			return undefined;
		}

		status.tags = dedupeContractStatusTags([...wireTags, ...additions]) as NDKTag[];
		status.content = '';

		if (!isValidContractStatusMessageType(status)) {
			return undefined;
		}

		return status;
	}

	/** Legacy decrypted JSON body when this instance was normalized from `NostrContractStatus` content; otherwise `undefined`. */
	get legacyContent(): Record<string, unknown> | undefined {
		return this._legacyContent;
	}

	// --- Public wire tags ---

	/** Payment id (blockchain escrow id); canonical wire tag is `r`. */
	get paymentId(): string {
		return this.tagValue('r') ?? '';
	}

	set paymentId(id: string) {
		this.removeTag('r');
		this.tags.push(['r', id]);
	}

	/** Parent Kind 30006 contract event id; wire tag `e`. */
	get parentContractEventId(): string {
		return this.tagValue('e') ?? '';
	}

	set parentContractEventId(id: string) {
		this.removeTag('e');
		this.tags.push(['e', id]);
	}

	/**
	 * Canonical {@link ContractStatus} for this eventâ€™s `s` tag.
	 * - **`v` = `v2`** (or missing `v` without legacy JSON): `s` is already `ContractStatus` (0â€“11).
	 */
	get status(): ContractStatus | undefined {
		const raw = this.tagValue('s');
		if (raw === undefined || raw === '') return undefined;
		const n = parseInt(raw, 10);
		if (!Number.isFinite(n)) return undefined;

		const useLegacyWire =
			isLegacyContractStatusWireVersion(this.version) ||
			(this.version === undefined && this._legacyContent !== undefined);

		if (useLegacyWire) {
			return null;
		}

		if (isValidContractStatusEnumValue(n)) {
			return n;
		}
		return undefined;
	}

	set status(value: ContractStatus) {
		this.removeTag('s');
		this.tags.push(['s', String(value)]);
	}

	/** Flow version (`v1`, `v2`, â€¦), not app build.
	 * If the version tag is "0.0.1", treat it as "v1" for legacy support.
	 */
	get version(): string | undefined {
		const raw = this.tagValue('v');
		if (raw === '0.0.1') return 'v1';
		return raw;
	}

	set version(version: string) {
		this.removeTag('v');
		this.tags.push(['v', version]);
	}

	get messageType(): string | undefined {
		return this.tagValue('m');
	}

	set messageType(type: string) {
		this.removeTag('m');
		this.tags.push(['m', type]);
	}

	/** Counterparty pubkey (recipient of this encrypted status). */
	get recipientPubkey(): string | undefined {
		return this.tagValue('p');
	}

	set recipientPubkey(pubkey: string) {
		this.removeTag('p');
		this.tags.push(['p', pubkey]);
	}

	// --- Encrypted-side tags ---

	get message(): string | undefined {
		return this.tagValue('message');
	}

	set message(value: string | undefined) {
		this.removeTag('message');
		if (value !== undefined) this.tags.push(['message', value]);
	}

	// We dont need the timestamp since we have the created_at from the event

	// get statusTimestamp(): number | undefined {
	// 	const raw = this.tagValue('timestamp');
	// 	if (raw === undefined) return undefined;
	// 	const n = Number(raw);
	// 	return Number.isFinite(n) ? n : undefined;
	// }

	// set statusTimestamp(value: number | undefined) {
	// 	this.removeTag('timestamp');
	// 	if (value !== undefined) this.tags.push(['timestamp', String(value)]);
	// }

	get transactionHash(): string | undefined {
		return this.tagValue('transactionHash');
	}

	set transactionHash(value: string | undefined) {
		this.removeTag('transactionHash');
		if (value !== undefined) this.tags.push(['transactionHash', value]);
	}

	/** Dispute proposal: Tasker-side amount (legacy JSON: `proposedClientAmount`). */
	get proposedTaskerAmount(): string | undefined {
		return this.tagValue('proposedTaskerAmount');
	}

	set proposedTaskerAmount(value: string | undefined) {
		this.removeTag('proposedTaskerAmount');
		this.removeTag('proposedClientAmount');
		if (value !== undefined) this.tags.push(['proposedTaskerAmount', value]);
	}

	/** Dispute proposal: Taskee-side amount (legacy JSON: `proposedFreelancerAmount`). */
	get proposedTaskeeAmount(): string | undefined {
		return this.tagValue('proposedTaskeeAmount');
	}

	set proposedTaskeeAmount(value: string | undefined) {
		this.removeTag('proposedTaskeeAmount');
		this.removeTag('proposedFreelancerAmount');
		if (value !== undefined) this.tags.push(['proposedTaskeeAmount', value]);
	}

	get completionAttachments(): Attachment[] | undefined {
		const raw = this.tagValue('completionAttachments');
		if (raw === undefined || raw === '') return undefined;
		try {
			return JSON.parse(raw) as Attachment[];
		} catch {
			return undefined;
		}
	}

	set completionAttachments(value: Attachment[] | undefined) {
		this.removeTag('completionAttachments');
		if (value !== undefined && value.length > 0) {
			this.tags.push(['completionAttachments', JSON.stringify(value)]);
		}
	}

	get completionText(): string | undefined {
		return this.tagValue('completionText');
	}

	set completionText(value: string | undefined) {
		this.removeTag('completionText');
		// Empty string is valid - allows completion with only media attachments
		if (value !== undefined) {
			this.tags.push(['completionText', value]);
		}
	}

	private shouldEncryptTag(tag: NDKTag): boolean {
		return !isPublicContractStatusTag(tag);
	}

	async toNostrEvent(pubkey?: string): Promise<NostrEvent> {
		const recipientHex = this.tagValue('p');
		if (!recipientHex) {
			throw new Error('NDKContractStatus: recipient (p tag) is required before publish');
		}

		const encryptedTags: NDKTag[] = [];
		const publicTags: NDKTag[] = [];

		for (const tag of this.tags) {
			if (this.shouldEncryptTag(tag)) {
				encryptedTags.push(tag);
			} else {
				publicTags.push(tag);
			}
		}

		this.tags = publicTags;
		this.content = JSON.stringify(encryptedTags);

		await this.encrypt(new NDKUser({ pubkey: recipientHex }), undefined, 'nip44');

		return super.toNostrEvent(pubkey) as unknown as NostrEvent;
	}
}
