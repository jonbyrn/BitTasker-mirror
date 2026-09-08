import { createDebug } from '$lib/utils/debug';
import NDK, { NDKEvent, NDKUser, type NDKTag, type NostrEvent } from '@nostr-dev-kit/ndk';
import type { ServiceContractAgreementSnapshot } from '$lib/types/contract';

const d = createDebug('ndk:events:contract');

/**
 * Single-char tags used on the wire for routing / indexing (stay outside the encrypted blob).
 * Matches TAG_PATTERNS.contract in `tags.ts`. Multiple `p` and `v` tags are allowed.
 */
const PUBLIC_CONTRACT_TAG_NAMES = new Set(['d', 't', 'p', 'n', 'v', 's', 'm']);

function isPublicContractTag(tag: NDKTag): boolean {
	return PUBLIC_CONTRACT_TAG_NAMES.has(tag[0]);
}

function isLegacyNostrContractContent(data: unknown): data is Record<string, unknown> {
	if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
	const o = data as Record<string, unknown>;
	return o.type === 'contract' || (typeof o.escrowId === 'string' && typeof o.taskId === 'string');
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

function countTag(tags: NDKTag[], name: string): number {
	return tags.filter((t) => t[0] === name).length;
}

function hasTagName(tags: NDKTag[], name: string): boolean {
	return tags.some((t) => t[0] === name);
}

/**
 * Legacy JSON body → tag rows for fields missing on the wire. Public keys (d,t,p,n,v,s,m) only
 * filled when absent; everything else becomes named tags (encrypted on publish).
 */
function legacyContentToAdditionalTags(
	parsed: Record<string, unknown>,
	wireTags: NDKTag[]
): NDKTag[] {
	const out: NDKTag[] = [];

	// Solve legacy repeated info from content and tags. Tags have priority over content.
	if (!hasTagName(wireTags, 'd') && typeof parsed.escrowId === 'string') {
		out.push(['d', parsed.escrowId]);
	}
	if (!hasTagName(wireTags, 't') && typeof parsed.taskId === 'string') {
		out.push(['t', parsed.taskId]);
	}

	const pCount = countTag(wireTags, 'p');
	const fr = parsed.freelancerPubkey;
	const cl = parsed.clientPubkey;
	if (typeof fr === 'string' && typeof cl === 'string') {
		if (pCount === 0) {
			out.push(['p', fr], ['p', cl]);
		} else if (pCount === 1) {
			const existing = wireTags.find((t) => t[0] === 'p')?.[1];
			if (existing === fr) out.push(['p', cl]);
			else if (existing === cl) out.push(['p', fr]);
		}
	}

	if (!hasTagName(wireTags, 'n') && typeof parsed.network === 'string') {
		out.push(['n', parsed.network]);
	}
	if (!hasTagName(wireTags, 'v') && typeof parsed.version === 'string') {
		out.push(['v', parsed.version]);
	}
	if (!hasTagName(wireTags, 's') && parsed.status !== undefined && parsed.status !== null) {
		out.push(['s', String(parsed.status)]);
	}
	if (!hasTagName(wireTags, 'm')) {
		out.push(['m', 'contract']);
	}

	const pushNamed = (key: string, value: unknown) => {
		if (value === undefined || value === null) return;
		out.push([key, typeof value === 'string' ? value : String(value)]);
	};

	// Encrypted-side / ergonomic names only (no duplicate of public single-char keys)
	pushNamed('paymentId', parsed.escrowId);
	pushNamed('taskTitle', parsed.taskTitle);
	pushNamed('taskDescription', parsed.taskDescription);
	pushNamed('amount', parsed.amount);
	pushNamed('currency', parsed.currency);
	pushNamed('estimatedStartTime', parsed.estimatedStartTime);
	pushNamed('estimatedCompletionTime', parsed.estimatedCompletionTime);
	pushNamed('transactionHash', parsed.transactionHash);
	pushNamed('contractAddress', parsed.contractAddress);

	return out;
}

function isValidContractMessageType(contract: NDKPaymentContract): boolean {
	const m = contract.tagValue('m');
	return m === undefined || m === 'contract';
}

/**
 * Contract class - represents kind 30006
 * - Wire: public tags d,t,p,n,v,s,m; encrypted payload = JSON.stringify(raw tag array) for all other tags.
 * - After `from()`, all data is normalized into `this.tags`; getters/setters only touch tags.
 * - Legacy: decrypted content was a single NostrContract JSON object → merged in `from()`.
 */
export class NDKPaymentContract extends NDKEvent {
	static kind = 30006;
	static kinds = [30006];

	constructor(ndk?: NDK, event?: NostrEvent | NDKEvent) {
		super(ndk, event);
		this.kind ??= 30006;

		this.on('relay:published', (relay) => {
			this.emit('published', relay);
		});
	}

	static async from(event: NDKEvent): Promise<NDKPaymentContract | undefined> {
		const contract = new NDKPaymentContract(event.ndk, event);

		const mWire = contract.tagValue('m');
		if (mWire !== undefined && mWire !== 'contract') {
			return undefined;
		}

		const prevContent = contract.content;
		const authorPubkey = contract.author.pubkey ?? '';
		const currentUserPubkey = contract.ndk?.activeUser?.pubkey ?? '';
		const wireTags = [...contract.tags] as NDKTag[];
		const pTags = contract.getMatchingTags('p');
		const taskeePubkeyFromTags = authorPubkey
			? pTags.find((tag) => tag[1] !== authorPubkey)?.[1]
			: undefined;

		let otherPartyPubkey: string | undefined;
		if (currentUserPubkey && authorPubkey) {
			otherPartyPubkey = currentUserPubkey === authorPubkey ? taskeePubkeyFromTags : authorPubkey;
		} else if (currentUserPubkey) {
			otherPartyPubkey = pTags.find((tag) => tag[1] !== currentUserPubkey)?.[1];
		} else {
			otherPartyPubkey = taskeePubkeyFromTags;
		}

		let decryptFailed = false;
		if (otherPartyPubkey) {
			const otherUser = new NDKUser({ pubkey: otherPartyPubkey });
			try {
				await contract.decrypt(otherUser);
				// d.log('decrypted contract', {
				// 	contract,
				// 	isSenderCurrentUser: sender.pubkey === currentUserPubkey
				// });
			} catch (_e) {
				decryptFailed = true;
				d.warn('NDKPaymentContract.from: decryption failed', { eventId: event.id, err: _e });
				contract.content = prevContent;
			}
		} else if (contract.content && contract.content.length > 0) {
			d.warn('NDKPaymentContract.from: no counterparty pubkey for decrypt', {
				eventId: event.id
			});
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(contract.content);
		} catch {
			if (decryptFailed) {
				d.warn('NDKPaymentContract.from: content not JSON after decrypt failure', {
					eventId: event.id
				});
			}
			return undefined;
		}

		const additions: NDKTag[] = [];

		if (isRawEncryptedTagArray(parsed)) {
			additions.push(...(parsed as NDKTag[]));
		} else if (isLegacyNostrContractContent(parsed)) {
			additions.push(...legacyContentToAdditionalTags(parsed, wireTags));
		} else {
			return undefined;
		}

		contract.tags = [...wireTags, ...additions] as NDKTag[];
		contract.content = '';

		if (!isValidContractMessageType(contract)) {
			return undefined;
		}

		return contract;
	}

	// --- Public wire tags (ergonomic names) ---

	get paymentId(): string {
		return this.tagValue('paymentId') ?? '';
	}

	set paymentId(id: string) {
		this.removeTag('paymentId');
		this.tags.push(['paymentId', id]);
	}

	get taskId(): string {
		return this.tagValue('t') ?? '';
	}

	set taskId(id: string) {
		this.removeTag('t');
		this.tags.push(['t', id]);
	}

	get taskeePubkey(): string | undefined {
		const tasker = this.author.pubkey;
		if (!tasker) return undefined;
		return this.getMatchingTags('p').find((tag) => tag[1] !== tasker)?.[1];
	}

	set taskeePubkey(pubkey: string) {
		const tasker = this.author.pubkey;
		if (!tasker) {
			throw new Error('NDKPaymentContract: author pubkey must be set before taskeePubkey');
		}
		if (pubkey === tasker) {
			throw new Error('NDKPaymentContract: taskeePubkey must differ from Tasker (event author)');
		}
		this.removeTag('p');
		this.tags.push(['p', pubkey], ['p', tasker]);
	}

	get taskerPubkey(): string | undefined {
		return this.author.pubkey;
	}

	get tasker(): NDKUser | undefined {
		return this.author;
	}

	get taskee(): NDKUser | undefined {
		return new NDKUser({ pubkey: this.taskeePubkey });
	}

	get otherPartyNpub(): string | undefined {
		// lets check the author of the contract and compare with the ndk user
		if (this.author.pubkey === this.ndk?.activeUser?.pubkey) {
			return this.taskeePubkey;
		} else {
			return this.taskerPubkey;
		}
	}

	get network(): string | undefined {
		return this.tagValue('n');
	}

	set network(network: string) {
		this.removeTag('n');
		this.tags.push(['n', network]);
	}

	/**
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

	get status(): string | undefined {
		return this.tagValue('s');
	}

	set status(status: string) {
		this.removeTag('s');
		this.tags.push(['s', status]);
	}

	get messageType(): string | undefined {
		return this.tagValue('m');
	}

	set messageType(type: string) {
		this.removeTag('m');
		this.tags.push(['m', type]);
	}

	// --- Encrypted-side tags (plain names; stored in encrypted tag array on wire) ---

	get taskTitle(): string | undefined {
		return this.tagValue('taskTitle');
	}

	set taskTitle(value: string) {
		this.removeTag('taskTitle');
		this.tags.push(['taskTitle', value]);
	}

	get taskDescription(): string | undefined {
		return this.tagValue('taskDescription');
	}

	set taskDescription(value: string) {
		this.removeTag('taskDescription');
		this.tags.push(['taskDescription', value]);
	}

	get amount(): number {
		return parseFloat(this.tagValue('amount') ?? '0');
	}

	set amount(value: string | number) {
		this.removeTag('amount');
		if (typeof value === 'number') {
			value = value.toString();
		}
		this.tags.push(['amount', value]);
	}

	get currency(): string {
		return this.tagValue('currency') ?? 'BTC';
	}

	set currency(value: string) {
		this.removeTag('currency');
		this.tags.push(['currency', value]);
	}

	/**
	 * Unix timestamp in **seconds** (Nostr convention matching `created_at`).
	 * Consumers must multiply by 1000 before passing to `new Date()`.
	 * Returns `undefined` when the tag is absent or contains a non-finite value.
	 */
	get estimatedStartTime(): number | undefined {
		const raw = this.tagValue('estimatedStartTime');
		if (raw === undefined) return undefined;
		const n = Number(raw);
		return Number.isFinite(n) ? n : undefined;
	}

	/**
	 * Set the estimated start time as a Unix timestamp in **seconds**.
	 * The value is stored as-is (no conversion); pass seconds, not milliseconds.
	 */
	set estimatedStartTime(value: number) {
		this.removeTag('estimatedStartTime');
		this.tags.push(['estimatedStartTime', String(value)]);
	}

	/**
	 * Unix timestamp in **seconds** (Nostr convention matching `created_at`).
	 * Consumers must multiply by 1000 before passing to `new Date()`.
	 * Returns `undefined` when the tag is absent or contains a non-finite value.
	 */
	get estimatedCompletionTime(): number | undefined {
		const raw = this.tagValue('estimatedCompletionTime');
		if (raw === undefined) return undefined;
		const n = Number(raw);
		return Number.isFinite(n) ? n : undefined;
	}

	/**
	 * Set the estimated completion time as a Unix timestamp in **seconds**.
	 * The value is stored as-is (no conversion); pass seconds, not milliseconds.
	 */
	set estimatedCompletionTime(value: number) {
		this.removeTag('estimatedCompletionTime');
		this.tags.push(['estimatedCompletionTime', String(value)]);
	}

	get transactionHash(): string | undefined {
		return this.tagValue('transactionHash');
	}

	set transactionHash(value: string) {
		this.removeTag('transactionHash');
		this.tags.push(['transactionHash', value]);
	}

	get contractAddress(): string | undefined {
		return this.tagValue('contractAddress');
	}

	set contractAddress(value: string) {
		this.removeTag('contractAddress');
		this.tags.push(['contractAddress', value]);
	}

	/**
	 * Agreement snapshot for service contracts (includes service location, selected tier, etc.)
	 * Stored as JSON in an encrypted tag.
	 */
	get agreementSnapshot(): ServiceContractAgreementSnapshot | undefined {
		const raw = this.tagValue('agreementSnapshot');
		if (!raw) return undefined;
		try {
			return JSON.parse(raw) as ServiceContractAgreementSnapshot;
		} catch {
			return undefined;
		}
	}

	set agreementSnapshot(value: ServiceContractAgreementSnapshot | undefined) {
		this.removeTag('agreementSnapshot');
		if (value !== undefined) {
			this.tags.push(['agreementSnapshot', JSON.stringify(value)]);
		}
	}

	private shouldEncryptTag(tag: NDKTag): boolean {
		return !isPublicContractTag(tag);
	}

	async toNostrEvent(pubkey?: string): Promise<NostrEvent> {
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

		// Encrypt the event with the taskee as receipient
		await this.encrypt(this.taskee, undefined, 'nip44');

		return super.toNostrEvent(pubkey) as unknown as NostrEvent;
	}
}
