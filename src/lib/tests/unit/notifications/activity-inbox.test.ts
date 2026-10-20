import { beforeEach, describe, expect, it, vi } from 'vitest';
import KINDS from '$lib/utils/constants/kinds';
import {
	contractLink,
	notificationFromActivity,
	notificationFromTask,
	receivedAmount,
	submitWorkPlan
} from '$lib/utils/notifications/activity-inbox';

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
				'work_approved'
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

describe('notification copy', () => {
	it('says who was paid, in sats, and names the task', () => {
		const notice = notificationFromActivity(
			event({
				kind: KINDS.CONTRACT_STATUS,
				tags: [
					['p', viewer],
					['r', 'contract-1'],
					['s', 'released']
				],
				content: JSON.stringify({
					contractTitle: 'Translate a menu',
					lockedAmount: 5001,
					lockedCurrency: 'SATS'
				})
			}),
			viewer
		);
		expect(notice?.type).toBe('paid');
		expect(notice?.title).toBe('Payment released: Translate a menu');
		expect(notice?.body).toBe('Payment released: you received 5,001 sats for Translate a menu');
		expect(notice?.data?.deepLink).toBe('/earning/contracts/contract-1');
	});

	it('sends the hirer to the hiring contract', () => {
		const notice = event({
			kind: KINDS.CONTRACT_STATUS,
			tags: [
				['p', other],
				['p', viewer],
				['r', 'contract-1'],
				['s', 'refunded']
			],
			content: JSON.stringify({ contractTitle: 'Translate a menu' })
		});
		expect(contractLink(notice, viewer)).toBe('/hiring/contracts/contract-1');
		expect(notificationFromActivity(notice, viewer)?.type).toBe('escrow_refunded');
		expect(notificationFromActivity(notice, viewer)?.title).toContain('Translate a menu');
	});

	it('names a declined bid with the task', () => {
		const notice = notificationFromActivity(
			event({
				kind: KINDS.BID_STATUS,
				tags: [
					['p', viewer],
					['t', 'task-slug'],
					['s', 'REJECTED']
				],
				content: JSON.stringify({ taskTitle: 'Proofread the post' })
			}),
			viewer
		);
		expect(notice?.type).toBe('bid_rejected');
		expect(notice?.title).toBe('Bid declined: Proofread the post');
	});

	it('tells the worker when the start time has passed and not the hirer', () => {
		const funded = event({
			kind: KINDS.CONTRACT_STATUS,
			tags: [
				['p', viewer],
				['p', other],
				['r', 'contract-1'],
				['s', 'funded']
			],
			content: JSON.stringify({
				contractTitle: 'Paint the fence',
				estimatedStartTime: 1_700_000_100
			})
		});
		const due = submitWorkPlan(funded, viewer, 1_700_000_200);
		expect(due?.notice.type).toBe('can_submit_work');
		expect(due?.notice.title).toBe('You can submit work: Paint the fence');
		expect(due?.atMs).toBeLessThanOrEqual(Date.now());

		const waiting = submitWorkPlan(funded, viewer, 1_700_000_000);
		expect(waiting?.atMs).toBe(1_700_000_100 * 1000);

		const hirer = event({
			kind: KINDS.CONTRACT_STATUS,
			tags: [
				['p', other],
				['p', viewer],
				['r', 'contract-1'],
				['s', 'funded']
			]
		});
		expect(submitWorkPlan(hirer, viewer, 1_700_000_200)).toBeNull();
	});

	it('posts a new task immediately for everyone except the author', () => {
		const task = event({
			kind: KINDS.TASK_CREATION,
			tags: [
				['d', 'paint-fence'],
				['S', 'OPEN']
			],
			content: JSON.stringify({
				title: 'Paint the fence',
				status: 'OPEN',
				description: 'Front gate'
			})
		});
		expect(notificationFromTask(task, viewer)?.title).toBe('New task: Paint the fence');
		expect(notificationFromTask(task, viewer)?.data?.deepLink).toBe('/tasks/paint-fence');
		expect(notificationFromTask(task, viewer)?.body).toBe('Front gate');
		expect(notificationFromTask({ ...task, pubkey: viewer }, viewer)).toBeNull();
	});

	it('formats a dollar escrow without calling it sats', () => {
		expect(receivedAmount({ lockedAmount: 4.13, lockedCurrency: 'USD' })).toBe('$4.13');
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
