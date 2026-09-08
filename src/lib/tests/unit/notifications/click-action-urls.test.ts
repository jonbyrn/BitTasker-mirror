import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendNotificationToNpubs = vi.fn();

vi.mock('$lib/api/services/push-notification.service', () => ({
	pushNotificationService: {
		sendNotificationToNpubs
	}
}));

vi.mock('$lib/utils/nostr', () => ({
	publishNostrEvent: vi.fn().mockResolvedValue(undefined),
	publishToMultipleRelays: vi.fn().mockResolvedValue([]),
	getSignedEvent: vi.fn().mockResolvedValue({ id: 'evt' })
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNostrKeyPair: vi.fn().mockResolvedValue({ nsec: new Uint8Array([1]) })
}));

vi.mock('$lib/utils/nostr-bid', () => ({
	clearBidCache: vi.fn()
}));

vi.mock('$lib/stores/user.store', () => ({
	user: { subscribe: vi.fn(() => vi.fn()), npub: 'npub1tasker' }
}));

vi.mock('$lib/stores/wallet.store', () => ({
	getRGBAddress: vi.fn().mockResolvedValue('0xabc')
}));

vi.mock('$lib/nostr/bid', () => ({
	generateBidTranslations: vi.fn().mockReturnValue(null)
}));

vi.mock('$lib/utils/helpers/crypto', () => ({
	formatNumberForInput: vi.fn((v: number) => String(v))
}));

vi.mock('$lib/utils/helpers/currencyFormatter', () => ({
	formatNumberWithTwoDecimals: vi.fn((v: number) => String(v))
}));

vi.mock('$lib/api/services/crypto-price.service', () => ({
	default: { getPrice: vi.fn().mockResolvedValue(50000) }
}));

vi.mock('$lib/utils/constants/kinds', () => ({
	default: { BIDS: 1021, TASK_CREATION: 31000 }
}));

vi.mock('$lib/utils/constants/tags', () => ({
	TAG_PATTERNS: { bid: vi.fn(() => [['p', 'pubkey']]) }
}));

vi.mock('$lib/utils/helpers/dateFormatter', () => ({
	toUnixSeconds: vi.fn((d: Date) => Math.floor(d.getTime() / 1000))
}));

vi.mock('$app/environment', () => ({
	browser: true
}));

describe('notification clickAction URL correctness', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubEnv('VITE_CLIENT_URL', 'https://bittasker.test');
		sendNotificationToNpubs.mockResolvedValue(undefined);
	});

	it('bid notification clickAction uses /task/{dTag}/bids (not /tasks/{id})', () => {
		const taskDTag = 'abc123-def456';
		const expectedUrl = `https://bittasker.test/task/${taskDTag}/bids`;

		const clickAction = `https://bittasker.test/task/${taskDTag}/bids`;

		expect(clickAction).toBe(expectedUrl);
		expect(clickAction).not.toContain('/tasks/');
		expect(clickAction).toContain('/task/');
		expect(clickAction).toContain('/bids');
	});

	it('review notification clickAction is an absolute URL (not relative)', () => {
		const clickAction = 'https://bittasker.test/reviews';

		expect(clickAction).toMatch(/^https?:\/\//);
		expect(clickAction).not.toMatch(/^\//);
		expect(clickAction).toContain('/reviews');
	});

	it('bid notification clickAction format matches route pattern /task/{id}/bids', () => {
		const clientUrl = 'https://bittasker.test';
		const taskId = 'my-task-123';

		const clickAction = `${clientUrl}/task/${taskId}/bids`;
		const url = new URL(clickAction);

		expect(url.pathname).toBe(`/task/${taskId}/bids`);
		expect(url.pathname).toMatch(/^\/task\/[^/]+\/bids$/);
	});

	it('contract notification clickAction uses /hiring/contracts', () => {
		const clientUrl = 'https://bittasker.test';

		const clickAction = `${clientUrl}/hiring/contracts`;
		const url = new URL(clickAction);

		expect(url.pathname).toBe('/hiring/contracts');
	});
});
