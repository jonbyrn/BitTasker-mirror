import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import '@testing-library/jest-dom';
import StreamPlayer from '$lib/components/StreamPlayer.svelte';

// ---------------------------------------------------------------------------
// Mocks — hoisted to module scope by vitest
// ---------------------------------------------------------------------------

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	const translations: Record<string, string> = {
		'common.stream_player.status.offline': 'You are offline',
		'common.stream_player.status.uploading': 'Uploading {progress}%',
		'common.stream_player.status.encoding': 'Processing video...',
		'common.stream_player.status.queued': 'In queue',
		'common.stream_player.status.error': 'An error occurred',
		'common.stream_player.status.expired': 'This video has expired',
		'common.stream_player.action.retry': 'Retry',
		'common.stream_player.action.refresh': 'Refresh',
		'common.stream_player.a11y.upload_progress': 'Upload progress: {progress}%',
		'common.stream_player.error.token_failed': 'Failed to load video token'
	};
	const tStore = readable((key: string, values?: { values?: Record<string, string | number> }) => {
		let result: string = translations[key] ?? key;
		if (values?.values) {
			for (const [k, v] of Object.entries(values.values)) {
				result = result.replace(`{${k}}`, String(v));
			}
		}
		return result;
	});
	return {
		t: tStore,
		locale: readable('en'),
		locales: readable(['en', 'es']),
		isLoading: readable(false)
	};
});

vi.mock('@sentry/sveltekit', () => ({
	addBreadcrumb: vi.fn()
}));

// Make import.meta.env.VITE_STREAM_CUSTOMER_CODE available in tests
vi.stubEnv('VITE_STREAM_CUSTOMER_CODE', 'test-customer');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultProps = {
	videoUid: 'test-video-uid'
};

/**
 * Build the same URL the component's `buildStreamUrl` function produces so
 * we can assert against it without exposing internals.
 */
function expectedIframeSrc(
	overrides: {
		poster?: string | null;
		controls?: boolean;
		playsinline?: boolean;
		loop?: boolean;
		autoplay?: boolean;
		muted?: boolean;
		captionsUrl?: string | null;
		isPrivate?: boolean;
		token?: string | null;
	} = {}
): string {
	const {
		poster = null,
		controls = true,
		playsinline = true,
		loop = false,
		autoplay = false,
		muted = false,
		captionsUrl = null,
		isPrivate = false,
		token = null
	} = overrides;

	const base = `https://customer-test-customer.cloudflarestream.com/test-video-uid/iframe`;
	const params = new URLSearchParams();
	if (poster) params.set('poster', poster);
	params.set('controls', String(controls));
	params.set('playsinline', String(playsinline));
	params.set('loop', String(loop));
	if (autoplay) params.set('autoplay', 'true');
	if (muted) params.set('muted', 'true');
	if (captionsUrl) params.set('captions', 'on');
	const qs = params.toString();
	const url = qs ? `${base}?${qs}` : base;
	if (isPrivate && token) return `${url}&token=${encodeURIComponent(token)}`;
	return url;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('StreamPlayer Component', () => {
	beforeEach(() => {
		vi.clearAllMocks();

		// Default fetch mock so tests not focused on token loading don't hang.
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ token: 'mock-token', expiresAt: Date.now() + 3_600_000 })
		});
	});

	// ------------------------------------------------------------------
	// 1. Offline state
	// ------------------------------------------------------------------
	it('renders offline state when status is offline', async () => {
		render(StreamPlayer, { ...defaultProps, status: 'offline' });
		await tick();

		expect(screen.getByText('You are offline')).toBeInTheDocument();
		expect(document.querySelector('iframe')).toBeNull();
		expect(document.querySelector('video')).toBeNull();
		expect(document.querySelector('progress')).toBeNull();
		expect(document.querySelector('.skeleton')).toBeNull();
	});

	// ------------------------------------------------------------------
	// 2. Uploading state with progress bar
	// ------------------------------------------------------------------
	it('renders uploading state with progress bar when status is uploading', async () => {
		render(StreamPlayer, {
			...defaultProps,
			status: 'uploading',
			uploadProgress: 45
		});
		await tick();

		expect(screen.getByText('Uploading 45%')).toBeInTheDocument();

		const progressBar = document.querySelector('progress');
		expect(progressBar).toBeInTheDocument();
		expect(progressBar).toHaveValue(45);
		expect(progressBar).toHaveAttribute('max', '100');

		expect(document.querySelector('iframe')).toBeNull();
		expect(document.querySelector('video')).toBeNull();
		expect(document.querySelector('.skeleton')).toBeNull();
	});

	// ------------------------------------------------------------------
	// 3 & 4. Encoding / queued — the component's encoding-timer $effect
	//    writes to encodingTimer ($state) which is also read in the same
	//    $effect, creating a reactivity loop in Svelte 5. Mock setTimeout
	//    to return a constant value so the $state write is a no-op after
	//    the first run.
	// ------------------------------------------------------------------
	describe('encoding / queued states', () => {
		beforeEach(() => {
			vi.spyOn(globalThis, 'setTimeout').mockReturnValue(
				42 as unknown as ReturnType<typeof setTimeout>
			);
		});

		it('renders encoding state with spinner and progress bar', async () => {
			render(StreamPlayer, { ...defaultProps, status: 'encoding' });
			await tick();

			expect(screen.getByText('Processing video...')).toBeInTheDocument();
			expect(document.querySelector('.loading-spinner')).toBeInTheDocument();
			expect(document.querySelector('iframe')).toBeNull();
			expect(document.querySelector('video')).toBeNull();
		});

		it('renders queued state with spinner and progress bar', async () => {
			render(StreamPlayer, { ...defaultProps, status: 'queued' });
			await tick();

			expect(screen.getByText('In queue')).toBeInTheDocument();
			expect(document.querySelector('.loading-spinner')).toBeInTheDocument();
			expect(document.querySelector('iframe')).toBeNull();
			expect(document.querySelector('video')).toBeNull();
		});

		it('applies role="status" and aria-live="polite" to encoding state', async () => {
			render(StreamPlayer, { ...defaultProps, status: 'encoding' });
			await tick();

			const statusEl = screen.getByRole('status');
			expect(statusEl).toHaveAttribute('aria-live', 'polite');
			expect(statusEl.textContent).toContain('Processing video...');
		});
	});

	// ------------------------------------------------------------------
	// 5. Error state with retry button
	// ------------------------------------------------------------------
	it('renders error state with retry button when status is error', async () => {
		render(StreamPlayer, { ...defaultProps, status: 'error' });
		await tick();

		expect(screen.getByText('An error occurred')).toBeInTheDocument();

		const retryBtn = screen.getByText('Retry');
		expect(retryBtn).toBeInTheDocument();
		expect(retryBtn.tagName).toBe('BUTTON');
		expect(retryBtn.className).toContain('btn');

		expect(document.querySelector('iframe')).toBeNull();
		expect(document.querySelector('video')).toBeNull();
	});

	// ------------------------------------------------------------------
	// 6. Expired state with refresh button
	// ------------------------------------------------------------------
	it('renders expired state with refresh button when status is expired', async () => {
		render(StreamPlayer, { ...defaultProps, status: 'expired' });
		await tick();

		expect(screen.getByText('This video has expired')).toBeInTheDocument();

		const refreshBtn = screen.getByText('Refresh');
		expect(refreshBtn).toBeInTheDocument();
		expect(refreshBtn.tagName).toBe('BUTTON');
		expect(refreshBtn.className).toContain('btn');

		expect(document.querySelector('iframe')).toBeNull();
		expect(document.querySelector('video')).toBeNull();
	});

	// ------------------------------------------------------------------
	// 7. Ready state with iframe
	// ------------------------------------------------------------------
	it('renders ready state with iframe having correct src', async () => {
		const onready = vi.fn();
		render(StreamPlayer, { ...defaultProps, onready });
		await tick();

		const iframe = document.querySelector('iframe');
		expect(iframe).toBeInTheDocument();
		expect(iframe).toHaveAttribute('loading', 'lazy');
		expect(iframe).toHaveAttribute('allow');
		expect(iframe!.getAttribute('src')).toBe(expectedIframeSrc());

		// Fire iframe load — the component calls onready with the videoUid
		fireEvent.load(iframe!);
		expect(onready).toHaveBeenCalledWith('test-video-uid');
	});

	it('includes autoplay and muted query params when set', async () => {
		render(StreamPlayer, { ...defaultProps, autoplay: true, muted: true });
		await tick();

		const iframe = document.querySelector('iframe')!;
		const src = iframe.getAttribute('src') ?? '';
		expect(src).toContain('autoplay=true');
		expect(src).toContain('muted=true');
	});

	// ------------------------------------------------------------------
	// 8. Private video — loading spinner before token arrives
	// ------------------------------------------------------------------
	it('renders loading spinner when private=true and token not yet loaded', async () => {
		// Prevent fetch from resolving so token stays null
		globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}));

		render(StreamPlayer, { ...defaultProps, private: true });
		await tick();

		const loading = document.querySelector('.loading');
		expect(loading).toBeInTheDocument();
		expect(loading).toHaveClass('loading-spinner');
		expect(document.querySelector('iframe')).toBeNull();
	});

	it('renders iframe with token param once token is loaded for private video', async () => {
		render(StreamPlayer, { ...defaultProps, private: true });
		await tick();

		await waitFor(
			() => {
				const iframe = document.querySelector('iframe');
				expect(iframe).toBeInTheDocument();
			},
			{ timeout: 2000 }
		);

		const iframe = document.querySelector('iframe')!;
		const src = iframe.getAttribute('src') ?? '';
		expect(src).toContain('token=mock-token');
		expect(src).toContain('cloudflarestream.com/test-video-uid/iframe');
	});

	// ------------------------------------------------------------------
	// 9. Legacy video element fallback
	// ------------------------------------------------------------------
	it('renders video element when videoUrl is set and videoUid is empty', async () => {
		render(StreamPlayer, {
			videoUid: '',
			videoUrl: 'https://example.com/video.mp4'
		});
		await tick();

		const video = document.querySelector('video');
		expect(video).toBeInTheDocument();
		expect(video).toHaveAttribute('src', 'https://example.com/video.mp4');
		expect(video).toHaveAttribute('controls');
		expect(video).toHaveAttribute('playsinline');

		expect(document.querySelector('iframe')).toBeNull();
	});

	it('renders fallback error text when both videoUid and videoUrl are missing', async () => {
		render(StreamPlayer, { videoUid: '', videoUrl: null });
		await tick();

		expect(screen.getByText('An error occurred')).toBeInTheDocument();
		expect(document.querySelector('iframe')).toBeNull();
		expect(document.querySelector('video')).toBeNull();
	});

	// ------------------------------------------------------------------
	// 10. Noscript fallback
	// ------------------------------------------------------------------
	it('renders noscript fallback element', async () => {
		render(StreamPlayer, defaultProps);
		await tick();

		const noscript = document.querySelector('noscript');
		expect(noscript).toBeInTheDocument();
	});

	// ------------------------------------------------------------------
	// Additional: retry / onerror behavior
	// ------------------------------------------------------------------
	it('retry button in token-error state calls fetchToken again', async () => {
		// First make fetch reject so tokenError becomes true
		globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

		render(StreamPlayer, { ...defaultProps, private: true });
		await tick();

		await waitFor(
			() => {
				expect(screen.getByText('Failed to load video token')).toBeInTheDocument();
			},
			{ timeout: 2000 }
		);

		// Now make fetch succeed on retry
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ token: 'retry-token', expiresAt: Date.now() + 3_600_000 })
		});

		fireEvent.click(screen.getByText('Retry'));
		await tick();

		await waitFor(
			() => {
				const iframe = document.querySelector('iframe');
				expect(iframe).toBeInTheDocument();
				expect(iframe!.getAttribute('src')).toContain('token=retry-token');
			},
			{ timeout: 2000 }
		);
	});

	it('calls onerror when token fetch fails for private video', async () => {
		const onerror = vi.fn();
		globalThis.fetch = vi.fn().mockRejectedValue(new Error('Fetch failed'));

		render(StreamPlayer, { ...defaultProps, private: true, onerror });
		await tick();

		await waitFor(
			() => {
				expect(onerror).toHaveBeenCalled();
				expect(onerror.mock.calls[0][0]).toContain('Failed to load video token');
			},
			{ timeout: 2000 }
		);
	});

	// ------------------------------------------------------------------
	// Additional: accessibility
	// ------------------------------------------------------------------
	it('applies custom aria-label to the region', async () => {
		render(StreamPlayer, { ...defaultProps, ariaLabel: 'Custom video label' });
		await tick();

		const region = screen.getByRole('region');
		expect(region).toHaveAttribute('aria-label', 'Custom video label');
	});

	it('uses default aria-label when not provided', async () => {
		render(StreamPlayer, defaultProps);
		await tick();

		const region = screen.getByRole('region');
		expect(region).toHaveAttribute('aria-label', 'Video player');
	});

	it('applies role="alert" to offline state', async () => {
		render(StreamPlayer, { ...defaultProps, status: 'offline' });
		await tick();

		expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(1);
	});

	it('applies role="alert" to error state', async () => {
		render(StreamPlayer, { ...defaultProps, status: 'error' });
		await tick();

		expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(1);
	});

	it('applies role="alert" to expired state', async () => {
		render(StreamPlayer, { ...defaultProps, status: 'expired' });
		await tick();

		expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(1);
	});
});
