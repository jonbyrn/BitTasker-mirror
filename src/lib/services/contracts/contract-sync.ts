import type { NDKEvent, NDKSubscription } from '@nostr-dev-kit/ndk';
import { ndk } from '$lib/nostr/ndk';
import KINDS from '$lib/utils/constants/kinds';
import { resolveTaskRelayUrls } from '$lib/utils/relayUrls';
import { leadingContractStatus } from '$lib/runes/contract.svelte';

export interface ContractStatusEvent {
	id: string;
	status: string;
	pubkey: string;
	createdAt: number;
}

const TASKER_STATUSES = new Set(['locked', 'approved', 'released', 'released_pending']);
const TASKEE_STATUSES = new Set([
	'funding',
	'work_in_progress',
	'work_submitted',
	'settlement_requested',
	'settled'
]);

export function eventRoleAllowed(status: string, actor: 'tasker' | 'taskee' | undefined): boolean {
	if (!actor) return true;
	if (status === 'cancelled' || status === 'refunded' || status === 'failed') return true;
	if (actor === 'tasker') return TASKER_STATUSES.has(status);
	return TASKEE_STATUSES.has(status);
}

/** Highest allowed status. A terminal state wins over in-progress work. */
export function foldContractEvents(events: readonly ContractStatusEvent[]): string {
	return leadingContractStatus(events.map((event) => event.status));
}

export function subscribeContract(
	contractId: string,
	onEvent: (event: ContractStatusEvent) => void
): () => void {
	const relays = resolveTaskRelayUrls(import.meta.env.VITE_NOSTR_TASK_RELAY_URL);
	let subscription: NDKSubscription | null = ndk.subscribe(
		{ kinds: [KINDS.CONTRACT_STATUS], '#r': [contractId] },
		{
			closeOnEose: false,
			relayUrls: relays,
			onEvent: (event: NDKEvent) => {
				const status = event.tags.find((tag) => tag[0] === 's')?.[1] ?? '';
				if (!status) return;
				onEvent({
					id: event.id ?? '',
					status,
					pubkey: event.pubkey ?? '',
					createdAt: event.created_at ?? 0
				});
			}
		}
	);
	return () => {
		subscription?.stop();
		subscription = null;
	};
}
