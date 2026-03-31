import { bytesToHex } from '@noble/hashes/utils';
import { nip19 } from 'nostr-tools';
import type { Location } from '$lib/types/task.d';
import { getSignedEvent } from '$lib/utils/nostr';
import { getNostrKeyPair, getNpub } from '$lib/utils/nostrKeys';
import nostrEventsService from '$lib/api/services/nostr/events';
import KINDS from '$lib/utils/constants/kinds';
import nip44 from '$lib/nostr/nip44';

interface ExactLocationEnvelope<TPayload> {
	version: 1;
	entityType: 'task' | 'service';
	entityId: string;
	payload: TPayload;
}

interface ExactTaskLocationPayload {
	pickupLocation: Location | null;
	dropOffLocation: Location | null;
}

interface ExactServiceLocationPayload {
	taskerLocation?: Location;
	taskeeLocation?: Location;
}

// These helpers deliberately propagate read/write failures. Callers choose policy:
// fail closed before public publish, or degrade safely on companion-read misses during updates.

function buildTaskDTag(entityId: string): string {
	return `task-location:${entityId}`;
}

function buildServiceDTag(entityId: string): string {
	return `service-location:${entityId}`;
}

async function encryptForSelf(payload: unknown): Promise<string> {
	const { nsec, npub } = await getNostrKeyPair();
	const nsecHex = bytesToHex(nsec);
	const conversationKey = await nip44.getConversationKey(nsecHex, npub);
	const nonce = crypto.getRandomValues(new Uint8Array(32));
	return nip44.encrypt(JSON.stringify(payload), conversationKey, nonce);
}

async function decryptFromSelf<TPayload>(ciphertext: string): Promise<TPayload> {
	const { nsec, npub } = await getNostrKeyPair();
	const nsecHex = bytesToHex(nsec);
	const conversationKey = await nip44.getConversationKey(nsecHex, npub);
	const plaintext = await nip44.decrypt(ciphertext, conversationKey);
	return JSON.parse(plaintext) as TPayload;
}

async function publishExactLocationEnvelope<TPayload>(
	dTag: string,
	entityType: 'task' | 'service',
	entityId: string,
	payload: TPayload
): Promise<void> {
	const encryptedContent = await encryptForSelf({
		version: 1,
		entityType,
		entityId,
		payload
	} satisfies ExactLocationEnvelope<TPayload>);

	const event = {
		kind: KINDS.PROFILE_LOCATION,
		created_at: Math.floor(Date.now() / 1000),
		tags: [
			['d', dTag],
			['client', 'bittasker'],
			['type', 'encrypted'],
			['scope', 'exact-location'],
			['entity', entityType]
		],
		content: encryptedContent
	};

	const signedEvent = await getSignedEvent(event);
	await nostrEventsService.publishEvent(signedEvent);
}

async function getExactLocationEnvelope<TPayload>(
	dTag: string,
	entityType: 'task' | 'service'
): Promise<ExactLocationEnvelope<TPayload> | null> {
	const npub = await getNpub();
	if (!npub) {
		return null;
	}

	const authorHex = npub.startsWith('npub') ? (nip19.decode(npub).data as string) : npub;
	const response = await nostrEventsService.requestEvents({
		filters: [
			{
				kinds: [KINDS.PROFILE_LOCATION],
				authors: [authorHex],
				'#d': [dTag],
				limit: 5
			}
		]
	});

	const latestEvent =
		response.data
			?.filter((event) => {
				const hasScopeTag = event.tags?.some(
					([tag, value]) => tag === 'scope' && value === 'exact-location'
				);
				const hasEntityTag = event.tags?.some(
					([tag, value]) => tag === 'entity' && value === entityType
				);
				return Boolean(hasScopeTag && hasEntityTag);
			})
			.reduce<{
				content: string;
				created_at: number;
				tags?: string[][];
			} | null>(
				(latest, current) => (!latest || current.created_at > latest.created_at ? current : latest),
				null
			) ?? null;
	if (!latestEvent) {
		return null;
	}

	const envelope = await decryptFromSelf<ExactLocationEnvelope<TPayload>>(latestEvent.content);
	if (
		envelope.version !== 1 ||
		envelope.entityType !== entityType ||
		envelope.entityId !== dTag.replace(/^task-location:|^service-location:/, '')
	) {
		return null;
	}

	return envelope;
}

export async function publishExactTaskLocations(params: {
	entityId: string;
	pickupLocation: Location | null;
	dropOffLocation: Location | null;
}): Promise<void> {
	await publishExactLocationEnvelope(buildTaskDTag(params.entityId), 'task', params.entityId, {
		pickupLocation: params.pickupLocation,
		dropOffLocation: params.dropOffLocation
	} satisfies ExactTaskLocationPayload);
}

export async function getExactTaskLocations(
	entityId: string
): Promise<ExactTaskLocationPayload | null> {
	const envelope = await getExactLocationEnvelope<ExactTaskLocationPayload>(
		buildTaskDTag(entityId),
		'task'
	);
	return envelope?.payload ?? null;
}

export async function publishExactServiceLocation(params: {
	entityId: string;
	taskerLocation?: Location;
	taskeeLocation?: Location;
}): Promise<void> {
	await publishExactLocationEnvelope(
		buildServiceDTag(params.entityId),
		'service',
		params.entityId,
		{
			taskerLocation: params.taskerLocation,
			taskeeLocation: params.taskeeLocation
		} satisfies ExactServiceLocationPayload
	);
}

export async function getExactServiceLocation(
	entityId: string
): Promise<ExactServiceLocationPayload | null> {
	const envelope = await getExactLocationEnvelope<ExactServiceLocationPayload>(
		buildServiceDTag(entityId),
		'service'
	);
	return envelope?.payload ?? null;
}
