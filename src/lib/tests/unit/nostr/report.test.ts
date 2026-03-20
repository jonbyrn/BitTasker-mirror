import { describe, it, expect, vi, beforeEach } from 'vitest';
import { publishReport, type ReportType } from '$lib/nostr/report';

// ── Mocks ──────────────────────────────────────────────────────────────────

const { mockPublish, mockGetSignedEvent } = vi.hoisted(() => ({
	mockPublish: vi.fn(),
	mockGetSignedEvent: vi.fn()
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		subscribe: vi.fn((cb) => {
			cb({ pool: { publish: mockPublish }, relays: ['wss://relay.test'] });
			return () => {};
		})
	}
}));

vi.mock('svelte/store', async (importOriginal) => {
	const actual = await importOriginal<typeof import('svelte/store')>();
	return {
		...actual,
		get: vi.fn(() => ({ pool: { publish: mockPublish }, relays: ['wss://relay.test'] }))
	};
});

vi.mock('$lib/utils/nostr', () => ({
	getSignedEvent: mockGetSignedEvent
}));

vi.mock('$lib/utils/constants/kinds', () => ({
	default: {
		REPORT: 1984,
		MUTE_LIST: 10000
	}
}));

// ── Helpers ────────────────────────────────────────────────────────────────

const PUBKEY = 'aabbccdd1122334455667788990011223344556677889900aabbccdd11223344';
const EVENT_ID = 'deadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678';

function capturedTags(): string[][] {
	return mockGetSignedEvent.mock.calls[0][0].tags as string[][];
}

function capturedContent(): string {
	return mockGetSignedEvent.mock.calls[0][0].content as string;
}

function capturedKind(): number {
	return mockGetSignedEvent.mock.calls[0][0].kind as number;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('publishReport', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetSignedEvent.mockResolvedValue({ id: 'signed-event-id', kind: 1984 });
	});

	describe('user-only report (no eventId)', () => {
		it('should build a p-tag with the report type for a user report', async () => {
			await publishReport({ reportedPubkey: PUBKEY, reportType: 'spam' });

			const tags = capturedTags();
			expect(tags).toHaveLength(1);
			expect(tags[0]).toEqual(['p', PUBKEY, 'spam']);
		});

		it.each<ReportType>(['spam', 'illegal', 'profanity', 'nudity', 'impersonation', 'other'])(
			'should use report type "%s" in the p-tag',
			async (reportType) => {
				await publishReport({ reportedPubkey: PUBKEY, reportType });

				const tags = capturedTags();
				expect(tags[0][2]).toBe(reportType);
			}
		);

		it('should use kind 1984 (REPORT)', async () => {
			await publishReport({ reportedPubkey: PUBKEY, reportType: 'spam' });
			expect(capturedKind()).toBe(1984);
		});

		it('should set content to empty string when no description is provided', async () => {
			await publishReport({ reportedPubkey: PUBKEY, reportType: 'spam' });
			expect(capturedContent()).toBe('');
		});

		it('should set content to the provided description', async () => {
			await publishReport({
				reportedPubkey: PUBKEY,
				reportType: 'other',
				description: 'This is a detailed report'
			});
			expect(capturedContent()).toBe('This is a detailed report');
		});
	});

	describe('event-specific report (with eventId)', () => {
		it('should build an e-tag (with report type) and a p-tag (author) when eventId is provided', async () => {
			await publishReport({
				reportedPubkey: PUBKEY,
				reportType: 'illegal',
				reportedEventId: EVENT_ID
			});

			const tags = capturedTags();
			expect(tags).toHaveLength(2);
			expect(tags[0]).toEqual(['e', EVENT_ID, 'illegal']);
			expect(tags[1]).toEqual(['p', PUBKEY]);
		});

		it('should place the e-tag before the p-tag', async () => {
			await publishReport({
				reportedPubkey: PUBKEY,
				reportType: 'profanity',
				reportedEventId: EVENT_ID
			});

			const tags = capturedTags();
			expect(tags[0][0]).toBe('e');
			expect(tags[1][0]).toBe('p');
		});

		it('should not include the report type in the p-tag when an eventId is given', async () => {
			await publishReport({
				reportedPubkey: PUBKEY,
				reportType: 'nudity',
				reportedEventId: EVENT_ID
			});

			const tags = capturedTags();
			const pTag = tags.find((t) => t[0] === 'p')!;
			expect(pTag).toHaveLength(2); // ['p', pubkey] — no third element
		});
	});

	describe('relay publishing', () => {
		it('should call pool.publish with the signed event', async () => {
			const signedEvent = { id: 'signed-id', kind: 1984 };
			mockGetSignedEvent.mockResolvedValue(signedEvent);

			await publishReport({ reportedPubkey: PUBKEY, reportType: 'spam' });

			expect(mockPublish).toHaveBeenCalledWith(['wss://relay.test'], signedEvent);
		});

		it('should call getSignedEvent exactly once per report', async () => {
			await publishReport({ reportedPubkey: PUBKEY, reportType: 'spam' });
			expect(mockGetSignedEvent).toHaveBeenCalledTimes(1);
		});
	});
});
