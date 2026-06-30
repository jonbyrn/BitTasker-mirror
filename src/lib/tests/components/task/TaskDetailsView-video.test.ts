import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/svelte';
import '@testing-library/jest-dom';
import type { Attachment } from '$lib/types/task';

/**
 * TaskDetailsView -- video attachment rendering tests.
 *
 * Covers five scenarios:
 * 1. Cloudflare Stream video (cloudflareId + video type) -> StreamPlayer chosen
 * 2. Legacy video (url, no cloudflareId)                 -> native <video>
 * 3. Image attachment                                    -> Gallery section
 * 4. Video attachment with no cloudflareId and no url    -> nothing rendered
 * 5. Mixed attachments                                   -> all three together
 */

// ---------------------------------------------------------------------------
// Hoisted helpers & mock targets
// ---------------------------------------------------------------------------

const hoisted = vi.hoisted(() => {
	function readable<T>(initialValue: T) {
		let value = initialValue;
		return {
			set(next: T) {
				value = next;
			},
			subscribe(fn: (v: T) => void) {
				fn(value);
				return () => {};
			}
		};
	}

	return {
		readable,
		mockFindEventById: vi.fn(),
		mockGetCurrentPrice: vi.fn().mockResolvedValue(100_000),
		mockGetStoredTranslation: vi.fn(),
		// Icons must be functions for Svelte 5 template rendering
		createMockIcon: vi.fn(() => 'svg')
	};
});

// ---------------------------------------------------------------------------
// Module-level mocks (vitest-hoisted to the top of the file)
// ---------------------------------------------------------------------------

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key),
		locale: readable('en')
	};
});

vi.mock('$app/environment', () => ({
	browser: true,
	dev: false,
	building: false
}));

vi.mock('$app/navigation', () => ({
	goto: vi.fn(),
	afterNavigate: vi.fn((cb: (nav: { to: { url: { pathname: string } } | null }) => void) => {
		// Invoke immediately with a mock navigation that won't match task routes
		cb({ to: null });
	}),
	beforeNavigate: vi.fn(),
	invalidateAll: vi.fn()
}));

vi.mock('$lib/stores/user.store', () => ({
	user: hoisted.readable({ npub: 'a'.repeat(64) })
}));

vi.mock('$lib/stores/auth.store', () => ({
	authState: hoisted.readable({ isAuthenticated: false })
}));

vi.mock('$lib/stores/translation.store', () => ({
	currentUserLanguage: hoisted.readable('en')
}));

vi.mock('$lib/api/services/nostr/events', () => ({
	default: {
		findEventById: (...args: Parameters<typeof hoisted.mockFindEventById>) =>
			hoisted.mockFindEventById(...args),
		requestEvents: vi.fn()
	}
}));

vi.mock('$lib/api/services/crypto-price.service', () => ({
	default: {
		getCurrentPrice: (...args: unknown[]) => hoisted.mockGetCurrentPrice(...args)
	}
}));

vi.mock('$lib/services/task-translation.service', () => ({
	taskTranslationService: {
		getStoredTranslation: (...args: unknown[]) => hoisted.mockGetStoredTranslation(...args)
	}
}));

// Mock every child component that would otherwise fail in jsdom or is irrelevant.
vi.mock('$lib/components/StreamPlayer.svelte', () => ({
	default: () => null
}));
vi.mock('$lib/components/Gallery.svelte', () => ({
	default: () => null
}));
vi.mock('$lib/components/task/TaskShareButton.svelte', () => ({
	default: () => null
}));
vi.mock('$lib/components/moderation/ActionsMenu.svelte', () => ({
	default: () => null
}));
vi.mock('$lib/components/task/TranslatableTask.svelte', () => ({
	default: () => null
}));
vi.mock('$lib/components/shared/UsdSatsDisplay.svelte', () => ({
	default: () => null
}));
vi.mock('$lib/components/maps/TaskLocationMap.svelte', () => ({
	default: () => null
}));
vi.mock('$lib/components/Drawer.svelte', () => ({
	default: () => null
}));
vi.mock('$lib/components/bidding/BidForm.svelte', () => ({
	default: () => null
}));

// Icons --- must be functions (not strings) so Svelte 5 can call them as components
vi.mock('~icons/mdi/alert-circle', () => ({ default: hoisted.createMockIcon }));
vi.mock('~icons/mdi/calendar-clock', () => ({ default: hoisted.createMockIcon }));
vi.mock('~icons/mdi/map-marker', () => ({ default: hoisted.createMockIcon }));
vi.mock('~icons/mdi/map-marker-check', () => ({ default: hoisted.createMockIcon }));

// ---------------------------------------------------------------------------
// Mock the global Image constructor so prepareGalleryImages resolves
// ---------------------------------------------------------------------------

const installImageMock = () => {
	vi.stubGlobal(
		'Image',
		vi.fn(function () {
			const img: Record<string, unknown> = {
				onload: null,
				onerror: null,
				naturalWidth: 800,
				naturalHeight: 600
			};
			Object.defineProperty(img, 'src', {
				get() {
					return (img as Record<string, unknown>)._src as string;
				},
				set(val: string) {
					(img as Record<string, unknown>)._src = val;
					setTimeout(() => {
						(typeof img.onload === 'function' ? img.onload : () => {})();
					}, 0);
				},
				configurable: true
			});
			return img;
		})
	);
};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const EVENT_ID = 'a'.repeat(64);

function createMockEvent(attachments: Attachment[]) {
	return {
		data: {
			id: EVENT_ID,
			pubkey: 'b'.repeat(64),
			content: JSON.stringify({
				title: 'Test Task',
				description: 'A task with attachments',
				budget: { amount: 100, currency: 'USD', type: 'FIXED' },
				attachments,
				skills: [] as string[],
				categories: [] as string[],
				status: 'OPEN',
				createdAt: Date.now(),
				id: EVENT_ID,
				npub: 'b'.repeat(64),
				creator: {
					username: 'testuser',
					avatar: '',
					rating: 4.5
				},
				isRemovals: false,
				isBoosted: false,
				boostPercentage: null,
				updatedAt: new Date().toISOString(),
				completedAt: null,
				cancelledAt: null,
				deletedAt: null,
				isDeleted: false,
				requiredSkills: [] as string[],
				deadline: null,
				dateRange: null,
				pickupLocation: null,
				dropOffLocation: null
			}),
			tags: [],
			kind: 1,
			created_at: Math.floor(Date.now() / 1000),
			sig: 'c'.repeat(64)
		}
	};
}

async function renderWithAttachments(attachments: Attachment[]) {
	hoisted.mockFindEventById.mockResolvedValue(createMockEvent(attachments));
	const { default: TaskDetailsView } = await import('$lib/components/task/TaskDetailsView.svelte');
	return render(TaskDetailsView, { taskId: EVENT_ID });
}

// ---------------------------------------------------------------------------
// Attachment factories
// ---------------------------------------------------------------------------

function cloudflareVideoAttachment(overrides: Partial<Attachment> = {}): Attachment {
	return {
		url: 'https://customer-abc.cloudflarestream.com/sample.mp4',
		key: 'cf-vid-1',
		type: 'video/mp4',
		alt: 'Cloudflare Stream video',
		size: 2_500_000,
		cloudflareId: 'cf-uid-abc123',
		...overrides
	};
}

function legacyVideoAttachment(overrides: Partial<Attachment> = {}): Attachment {
	return {
		url: 'https://cdn.example.com/demo-video.mp4',
		key: 'legacy-vid-1',
		type: 'video/mp4',
		alt: 'Legacy video attachment',
		size: 1_800_000,
		...overrides
	};
}

function imageAttachment(overrides: Partial<Attachment> = {}): Attachment {
	return {
		url: 'https://cdn.example.com/photo.jpg',
		key: 'img-1',
		type: 'image/jpeg',
		alt: 'Example image',
		size: 500_000,
		...overrides
	};
}

function emptyVideoAttachment(overrides: Partial<Attachment> = {}): Attachment {
	return {
		url: '',
		key: 'empty-vid-1',
		type: 'video/mp4',
		alt: 'Empty video attachment',
		size: 0,
		...overrides
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TaskDetailsView video attachment support', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		installImageMock();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		cleanup();
	});

	// ---- Test 1: Cloudflare Stream video (cloudflareId + video type) ----

	it(
		'renders StreamPlayer when attachment has cloudflareId and video type',
		{ timeout: 30000 },
		async () => {
			const attachment = cloudflareVideoAttachment();
			const { container } = await renderWithAttachments([attachment]);

			// Wait for task data to load (loading spinner disappears, content appears)
			await waitFor(() => {
				expect(container.querySelector('.loading')).not.toBeInTheDocument();
			});

			// The video rendering section should be present (attachment metadata text)
			expect(container.textContent).toContain('Cloudflare Stream video');

			// A native <video> element must NOT be used when StreamPlayer is chosen
			expect(container.querySelector('video')).not.toBeInTheDocument();
		}
	);

	// ---- Test 2: Legacy video (url, no cloudflareId) ----

	it('renders legacy <video> when attachment has url but no cloudflareId', async () => {
		const attachment = legacyVideoAttachment();
		const { container } = await renderWithAttachments([attachment]);

		// Wait for task data to load
		await waitFor(() => {
			expect(container.querySelector('.loading')).not.toBeInTheDocument();
		});

		// A native <video> element should exist for the legacy fallback
		const video = container.querySelector('video');
		expect(video).toBeInTheDocument();

		// The <source> tag should carry the attachment URL
		const source = container.querySelector('source');
		expect(source).toBeInTheDocument();
		expect(source).toHaveAttribute('src', attachment.url);
	});

	// ---- Test 3: Image attachment ----

	it('renders image via Gallery when attachment is image type', async () => {
		const attachment = imageAttachment();
		const { container } = await renderWithAttachments([attachment]);

		// Wait for loading to finish
		await waitFor(() => {
			expect(container.querySelector('.loading')).not.toBeInTheDocument();
		});

		// The attachments section heading renders (task has attachments)
		expect(container.textContent).toContain('dashboard.task_details_by_task.attachments');

		// No video-related elements should appear (the only attachment is an image)
		expect(container.querySelector('video')).not.toBeInTheDocument();
	});

	// ---- Test 4: Video with no cloudflareId and no url ----

	it('renders no video element for attachment with no cloudflareId and no url', async () => {
		const attachment = emptyVideoAttachment();
		const { container } = await renderWithAttachments([attachment]);

		// Wait for loading to finish
		await waitFor(() => {
			expect(container.querySelector('.loading')).not.toBeInTheDocument();
		});

		// No <video> element should be present (isVideoFile('') returns false,
		// so the attachment bypasses the video section entirely, and there
		// is no cloudflareId to trigger StreamPlayer).
		expect(container.querySelector('video')).not.toBeInTheDocument();
	});

	// ---- Test 5: Mixed attachments ----

	it('correctly mixes StreamPlayer, video fallback, and images for multiple attachments', async () => {
		const attachments: Attachment[] = [
			cloudflareVideoAttachment({ key: 'cf-vid-1', alt: 'Cloudflare video' }),
			legacyVideoAttachment({ key: 'legacy-vid-1', alt: 'Legacy video' }),
			imageAttachment({ key: 'img-1', alt: 'A photo' }),
			imageAttachment({
				key: 'img-2',
				alt: 'Another photo',
				url: 'https://cdn.example.com/photo2.png'
			})
		];

		const { container } = await renderWithAttachments(attachments);

		// Wait for loading to finish
		await waitFor(() => {
			expect(container.querySelector('.loading')).not.toBeInTheDocument();
		});

		// The Cloudflare video path: no <video> element (StreamPlayer path was taken)
		expect(container.textContent).toContain('Cloudflare video');

		// The legacy video path: exactly one <video> element
		const videos = container.querySelectorAll('video');
		expect(videos.length).toBe(1);

		// The legacy video <source> has the correct URL
		const source = container.querySelector('source');
		expect(source).toHaveAttribute('src', 'https://cdn.example.com/demo-video.mp4');

		// Both video attachment names appear (template renders alt text for each)
		expect(container.textContent).toContain('Cloudflare video');
		expect(container.textContent).toContain('Legacy video');
	});
});
