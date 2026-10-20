import { beforeEach, describe, expect, it, vi } from 'vitest';
import KINDS from '$lib/utils/constants/kinds';
import { notificationFromActivity } from '$lib/utils/notifications/activity-inbox';

const viewer = 'a'.repeat(64);
const other = 'b'.repeat(64);

function event(partial: {
	kind: number;
	pubkey?: string;
	tags: string[][];
	content?: string;
	id?: string;
}) {
	return {
		id: partial.id ?? '1'.repeat(64),
		kind: partial.kind,
		pubkey: partial.pubkey ?? other,
		created_at: 1_700_000_000,
		tags: partial.tags,
		content: partial.content ?? '',
		sig: ''
	};
}

describe('notificationFromActivity', () => {
	it('turns an accepted bid into a notification for the bidder', () => {
		const notice = notificationFromActivity(
			event({
				kind: KINDS.BID_STATUS,
				pubkey: other,
				tags: [
					['e', 'f'.repeat(64)],
					['p', viewer],
					['t', 'task-slug'],
					['s', 'ACCEPTED'],
					['m', 'bid-status']
				]
			}),
			viewer
		);
		expect(notice?.type).toBe('bid_accepted');
		expect(notice?.data?.deepLink).toBe('/task/task-slug/bids');
	});

	it('notifies the tasker about a new bid and ignores the bidder copy', () => {
		const incoming = notificationFromActivity(
			event({
				kind: KINDS.BIDS,
				tags: [
					['p', viewer],
					['t', 'task-slug'],
					['s', 'pending'],
					['m', 'bid']
				]
			}),
			viewer
		);
		expect(incoming?.type).toBe('new_bid_on_task');

		const own = notificationFromActivity(
			event({
				kind: KINDS.BIDS,
				pubkey: viewer,
				tags: [
					['p', other],
					['m', 'bid']
				]
			}),
			viewer
		);
		expect(own).toBeNull();
	});

	it('covers escrow, delivery, approval, payment, chat, reviews, and service orders', () => {
		const cases: Array<[number, string[][], string]> = [
			[
				KINDS.CONTRACT_STATUS,
				[
					['p', viewer],
					['r', 'contract-1'],
					['s', 'funding']
				],
				'escrow_connected'
			],
			[
				KINDS.CONTRACT_STATUS,
				[
					['p', viewer],
					['r', 'contract-1'],
					['s', 'locked']
				],
				'escrow_locked'
			],
			[
				KINDS.CONTRACT_STATUS,
				[
					['p', viewer],
					['r', 'contract-1'],
					['s', 'funded']
				],
				'escrow_funded'
			],
			[
				KINDS.CONTRACT_STATUS,
				[
					['p', viewer],
					['r', 'contract-1'],
					['s', 'work_submitted']
				],
				'deliverable_submitted'
			],
			[
				KINDS.CONTRACT_STATUS,
				[
					['p', viewer],
					['r', 'contract-1'],
					['s', 'approved']
				],
				'approved'
			],
			[
				KINDS.CONTRACT_STATUS,
				[
					['p', viewer],
					['r', 'contract-1'],
					['s', 'settlement_requested']
				],
				'payment_requested'
			],
			[
				KINDS.CONTRACT_STATUS,
				[
					['p', viewer],
					['r', 'contract-1'],
					['s', 'settled']
				],
				'paid'
			],
			[
				KINDS.DIRECT_MESSAGES,
				[
					['p', viewer],
					['m', 'direct-message']
				],
				'new_message'
			],
			[
				KINDS.REVIEW,
				[
					['p', viewer],
					['e', 'contract-1']
				],
				'review_received'
			],
			[
				KINDS.SERVICE_QUOTE_REQUEST,
				[
					['p', viewer],
					['m', 'service-quote-request'],
					['a', '30402:abc:svc-1']
				],
				'service_ordered'
			]
		];

		for (const [kind, tags, type] of cases) {
			const notice = notificationFromActivity(
				event({
					kind,
					tags,
					content:
						kind === KINDS.REVIEW
							? JSON.stringify({ type: 'review', rating: { overallRating: 5 } })
							: kind === KINDS.CONTRACT_STATUS
								? JSON.stringify({ contractTitle: 'Paint the fence' })
								: ''
				}),
				viewer
			);
			expect(notice?.type).toBe(type);
		}
	});

	it('ignores protocol kind-4 traffic and a bid the viewer sent', () => {
		expect(
			notificationFromActivity(
				event({
					kind: KINDS.DIRECT_MESSAGES,
					tags: [
						['p', viewer],
						['m', 'rgb-consignment']
					]
				}),
				viewer
			)
		).toBeNull();
	});
});

describe('loadActivityNotifications passkey', () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it('reads the inbox without asking for a passkey', async () => {
		const getNostrKeyPair = vi.fn(() => {
			throw new Error('passkey prompt');
		});
		vi.doMock('$lib/utils/nostrKeys', () => ({
			getNpub: vi.fn().mockResolvedValue(viewer),
			getNostrKeyPair
		}));
		vi.doMock('$lib/nostr/relayQuery', () => ({
			queryRelayEvents: vi.fn().mockResolvedValue([
				event({
					kind: KINDS.BID_STATUS,
					tags: [
						['p', viewer],
						['s', 'REJECTED'],
						['m', 'bid-status'],
						['t', 'task-slug']
					]
				})
			])
		}));
		vi.stubEnv('VITE_NOSTR_RELAY_URL', 'wss://relay.example');

		const { loadActivityNotifications } = await import('$lib/utils/notifications/activity-inbox');
		const items = await loadActivityNotifications();

		expect(getNostrKeyPair).not.toHaveBeenCalled();
		expect(items.map((item) => item.type)).toContain('bid_rejected');
	});
});
