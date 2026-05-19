<script lang="ts">
	import { browser } from '$app/environment';
	import { SvelteMap, SvelteURLSearchParams } from 'svelte/reactivity';
	import { t } from 'svelte-i18n';
	import type { StreamPlayerStatus } from '$lib/types/video';
	import { addBreadcrumb } from '@sentry/sveltekit';

	interface Props {
		videoUid: string;
		poster?: string | null;
		autoplay?: boolean;
		muted?: boolean;
		controls?: boolean;
		loop?: boolean;
		playsinline?: boolean;
		private?: boolean;
		status?: StreamPlayerStatus;
		uploadProgress?: number;
		thumbnailTime?: number;
		aspectRatio?: string;
		className?: string;
		ariaLabel?: string;
		captionsUrl?: string | null;
		videoUrl?: string | null;
		onerror?: (error: string) => void;
		onready?: (uid: string) => void;
	}

	let {
		videoUid,
		poster = null,
		autoplay = false,
		muted = false,
		controls = true,
		loop = false,
		playsinline = true,
		private: isPrivate = false,
		status = 'ready',
		uploadProgress = 0,
		thumbnailTime: _thumbnailTime = 2,
		aspectRatio = 'video',
		className = '',
		ariaLabel = 'Video player',
		captionsUrl = null,
		videoUrl = null,
		onerror,
		onready
	}: Props = $props();

	const customerCode = browser ? import.meta.env.VITE_STREAM_CUSTOMER_CODE : '';
	// Cloudflare Stream UIDs are 32-character hex strings
	const isStreamUid = $derived(/^[a-f0-9]{32}$/.test(videoUid));
	let token = $state<string | null>(null);
	let tokenError = $state(false);
	let pollingActive = $state(false);
	let posterLoaded = $state(false);
	let encodingTimedOut = $state(false);
	let pollAttempt = $state(0);

	// Breadcrumbs for state transitions are logged inline at the source
	// (encoding poll ready/error, iframe load, encoding timeout) rather
	// than via a watcher, to avoid Svelte effect/reactivity footguns.

	// // Timer handles are plain variables (not reactive) —
	let encodingTimer: ReturnType<typeof setTimeout> | null = null;
	let pollingTimer: ReturnType<typeof setInterval> | null = null;

	// Token cache to avoid re-fetching until 5 min before expiry
	const tokenCache = new SvelteMap<string, { token: string; expiresAt: number }>();

	function buildStreamUrl(): string {
		if (!browser) return '';
		const base = `https://customer-${customerCode}.cloudflarestream.com/${videoUid}/iframe`;

		const params = new SvelteURLSearchParams();
		if (poster) params.set('poster', poster);
		params.set('controls', controls.toString());
		params.set('playsinline', playsinline.toString());
		params.set('loop', loop.toString());
		if (autoplay) params.set('autoplay', 'true');
		if (muted) params.set('muted', 'true');
		if (captionsUrl) params.set('captions', 'on');

		const qs = params.toString();
		const url = qs ? `${base}?${qs}` : base;

		if (isPrivate && token) return `${url}&token=${encodeURIComponent(token)}`;
		return url;
	}

	async function fetchToken(): Promise<void> {
		if (!isPrivate || !browser) return;
		tokenError = false;

		const cached = tokenCache.get(videoUid);
		if (cached && cached.expiresAt > Date.now() + 300_000) {
			token = cached.token;
			return;
		}

		try {
			const res = await fetch(`/api/cloudflare/stream/token/${encodeURIComponent(videoUid)}`);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json();
			token = data.token;
			tokenCache.set(videoUid, {
				token: data.token,
				expiresAt: data.expiresAt ?? Date.now() + 3_600_000
			});
			addBreadcrumb({ category: 'stream', message: 'fetchToken: success', level: 'info' });
		} catch (e) {
			tokenError = true;
			addBreadcrumb({
				category: 'stream',
				message: `fetchToken: error - ${e instanceof Error ? e.message : 'Unknown error'}`,
				level: 'error'
			});
			onerror?.(`Failed to load video token: ${e instanceof Error ? e.message : 'Unknown error'}`);
		}
	}

	function handleRetry(): void {
		tokenError = false;
		fetchToken();
	}

	// ── Svelte actions (use: directive) — replace $effect blocks ──────

	// Action: encoding polling + network listener lifecycle (Capacitor-aware)
	function encodingPoll(_node: HTMLElement) {
		startEncodingPoll();

		let networkCleanup: (() => void) | undefined;

		// Register network-status listener (Capacitor on native, window event on web)
		(async () => {
			try {
				const { Capacitor } = await import('@capacitor/core');
				if (Capacitor.isNativePlatform()) {
					const { Network } = await import('@capacitor/network');
					const handle = await Network.addListener('networkStatusChange', (status) => {
						if (status.connected) {
							clearTimers();
							startEncodingPoll();
						}
					});
					networkCleanup = () => handle.remove();
					return;
				}
			} catch {
				// Fall through to web
			}
			// Web fallback
			const handler = () => {
				clearTimers();
				startEncodingPoll();
			};
			window.addEventListener('online', handler);
			networkCleanup = () => window.removeEventListener('online', handler);
		})();

		return {
			destroy() {
				clearTimers();
				if (networkCleanup) networkCleanup();
				pollingActive = false;
			}
		};
	}

	// Action: token loading for private videos
	function tokenLoad(_node: HTMLElement) {
		fetchToken();
		return { destroy() {} };
	}

	// Action: poster preloading
	function posterPreload(_node: HTMLElement) {
		posterLoaded = false;
		return { destroy() {} };
	}

	// ── Encoding state: poll /api/cloudflare/stream/status/:uid ──────
	// Timer reads/writes happen in plain functions outside the $effect so
	// the effect only depends on status / browser / videoUid / isStreamUid.

	function clearTimers() {
		if (encodingTimer) {
			clearTimeout(encodingTimer);
			encodingTimer = null;
		}
		if (pollingTimer) {
			clearTimeout(pollingTimer);
			pollingTimer = null;
		}
	}

	function startEncodingPoll() {
		if (pollingActive) return; // Prevent double-starts
		pollingActive = true;
		clearTimers();
		encodingTimedOut = false;
		pollAttempt = 0;

		// Adaptive backoff: 3s → 6s → 12s → 30s (capped)
		const backoffDelays = [3_000, 6_000, 12_000, 30_000];

		// Encoding timeout proportional to expected video length.
		// We don't know the exact duration, but a short video should time out faster.
		// Default 30 min; for the adaptive-first approach we still use 30 min as fallback
		// since we don't have duration info at this level.
		encodingTimer = setTimeout(
			() => {
				encodingTimedOut = true;
				addBreadcrumb({
					category: 'stream',
					message: `StreamPlayer: encoding timed out for ${videoUid}`,
					level: 'warning'
				});
			},
			30 * 60 * 1000
		);

		async function poll() {
			try {
				const res = await fetch(`/api/cloudflare/stream/status/${encodeURIComponent(videoUid)}`);
				if (!res.ok) return;
				const data = await res.json();
				if (data.state === 'ready') {
					// Verify manifest is actually available at CDN edge before showing iframe.
					// Cloudflare's Admin API reports "ready" before manifests have propagated
					// to the CDN edge (customer-*.cloudflarestream.com), causing 404s.
					try {
						const manifestUrl = `https://customer-${customerCode}.cloudflarestream.com/${videoUid}/manifest/video.mpd?parentOrigin=${encodeURIComponent(window.location.origin)}`;
						const manifestRes = await fetch(manifestUrl, { method: 'HEAD' });
						if (manifestRes.ok) {
							pollingActive = false;
							clearTimers();
							addBreadcrumb({
								category: 'stream',
								message: `StreamPlayer: encoding complete + manifest confirmed for ${videoUid}`,
								level: 'info'
							});
							onready?.(videoUid);
						} else {
							// Manifest not propagated yet — continue polling
							const delay = backoffDelays[Math.min(pollAttempt, backoffDelays.length - 1)];
							pollAttempt++;
							pollingTimer = setTimeout(poll, delay);
						}
					} catch {
						// Network error during manifest check — continue polling
						const delay = backoffDelays[Math.min(pollAttempt, backoffDelays.length - 1)];
						pollAttempt++;
						pollingTimer = setTimeout(poll, delay);
					}
				} else if (data.state === 'error') {
					pollingActive = false;
					clearTimers();
					addBreadcrumb({
						category: 'stream',
						message: `StreamPlayer: encoding failed for ${videoUid} - ${data.errorReason || 'unknown'}`,
						level: 'error'
					});
					onerror?.(data.errorReason || 'Video processing failed - please try re-uploading');
				} else {
					// Schedule next poll with adaptive backoff
					const delay = backoffDelays[Math.min(pollAttempt, backoffDelays.length - 1)];
					pollAttempt++;
					pollingTimer = setTimeout(poll, delay);
				}
			} catch {
				// Network error during poll — retry with backoff
				const delay = backoffDelays[Math.min(pollAttempt, backoffDelays.length - 1)];
				pollAttempt++;
				pollingTimer = setTimeout(poll, delay);
			}
		}

		// First poll immediately
		poll();
	}
</script>

<div
	class="stream-player aspect-{aspectRatio} overflow-hidden rounded-lg {className}"
	role="region"
	aria-label={ariaLabel}
>
	<!-- Lifecycle drivers: these hidden elements control polling, token loading, and poster preloading via Svelte use: actions (no $effect) -->
	{#if (status === 'encoding' || status === 'queued') && browser && videoUid && isStreamUid}
		<div style="display:none" aria-hidden="true" use:encodingPoll></div>
	{/if}
	{#if isPrivate && status === 'ready' && browser}
		<div style="display:none" aria-hidden="true" use:tokenLoad></div>
	{/if}
	<!-- offline -->
	{#if status === 'offline'}
		<div
			class="bg-base-200 text-base-content/60 flex h-full flex-col items-center justify-center p-4 text-center"
			role="alert"
		>
			<p>{$t('stream_player.status.offline')}</p>
		</div>

		<!-- uploading -->
	{:else if status === 'uploading'}
		<div
			class="bg-base-200 flex h-full flex-col items-center justify-center p-4"
			role="status"
			aria-live="polite"
		>
			<div class="w-full max-w-xs">
				<progress
					class="progress progress-primary w-full"
					value={uploadProgress}
					max="100"
					aria-label={$t('stream_player.a11y.upload_progress', {
						values: { progress: uploadProgress }
					})}
				></progress>
				<p class="mt-2 text-center text-sm">
					{$t('stream_player.status.uploading', {
						values: { progress: Math.round(uploadProgress) }
					})}
				</p>
			</div>
		</div>

		<!-- encoding / queued -->
	{:else if status === 'encoding' || status === 'queued'}
		<div
			class="bg-base-200 flex h-full flex-col items-center justify-center p-4"
			role="status"
			aria-live="polite"
		>
			{#if poster}
				<div
					class="relative flex w-full flex-1 items-center justify-center overflow-hidden rounded-lg"
				>
					<img src={poster} alt="" class="h-full w-full object-cover opacity-40" />
					<div class="absolute inset-0 flex flex-col items-center justify-center bg-black/30">
						<span class="loading loading-spinner loading-lg text-primary mb-3"></span>
						<p class="text-sm font-medium text-white">
							{status === 'queued'
								? $t('stream_player.status.queued')
								: $t('stream_player.status.encoding')}
						</p>
						<progress class="progress progress-primary mt-2 w-48"></progress>
					</div>
				</div>
			{:else}
				<span class="loading loading-spinner loading-lg text-primary mb-3"></span>
				<progress class="progress progress-primary w-full max-w-xs"></progress>
				<p class="mt-2 text-center text-sm">
					{status === 'queued'
						? $t('stream_player.status.queued')
						: $t('stream_player.status.encoding')}
				</p>
			{/if}
		</div>

		<!-- encoding timed out -->
	{:else if encodingTimedOut}
		<div
			class="bg-base-200 flex h-full flex-col items-center justify-center p-4 text-center"
			role="alert"
		>
			<p class="text-warning mb-2 text-sm">
				Video processing is taking longer than expected - please try re-uploading
			</p>
		</div>

		<!-- error states checked FIRST so they override loading spinners -->
	{:else if status === 'error' || tokenError}
		<div
			class="bg-base-200 flex h-full min-h-[120px] flex-col items-center justify-center p-4 text-center"
			role="alert"
		>
			<p class="text-error mb-2 text-sm">
				{tokenError ? $t('stream_player.error.token_failed') : $t('stream_player.status.error')}
			</p>
			<button class="btn btn-sm btn-outline" onclick={handleRetry} autofocus>
				{$t('stream_player.action.retry')}
			</button>
		</div>

		<!-- expired -->
	{:else if status === 'expired'}
		<div
			class="bg-base-200 flex h-full flex-col items-center justify-center p-4 text-center"
			role="alert"
		>
			<p class="text-warning mb-2 text-sm">{$t('stream_player.status.expired')}</p>
			<button class="btn btn-sm btn-outline" onclick={handleRetry} autofocus>
				{$t('stream_player.action.refresh')}
			</button>
		</div>

		<!-- ready (including private-token-loading and poster-loading sub-states) -->
	{:else if isPrivate && !token && !tokenError}
		<div
			class="bg-base-200 flex h-full items-center justify-center"
			role="status"
			aria-live="polite"
		>
			<div class="loading loading-spinner loading-md"></div>
		</div>
	{:else if poster && !posterLoaded}
		<div class="bg-base-200 flex h-full items-center justify-center">
			<div class="skeleton h-full w-full rounded-lg"></div>
			<img
				src={poster}
				alt=""
				class="hidden"
				use:posterPreload
				onload={() => (posterLoaded = true)}
				onerror={() => (posterLoaded = true)}
			/>
		</div>
	{:else if !videoUid && !videoUrl}
		<div class="bg-base-200 text-base-content/60 flex h-full items-center justify-center">
			<p class="text-sm">{$t('stream_player.status.error')}</p>
		</div>
	{:else if videoUrl && !isStreamUid}
		<video src={videoUrl} controls playsinline class="h-full w-full" aria-label={ariaLabel}>
			<track kind="captions" />
		</video>
	{:else if videoUrl && !videoUid}
		<video src={videoUrl} controls playsinline class="h-full w-full" aria-label={ariaLabel}>
			<track kind="captions" />
		</video>
	{:else}
		<iframe
			src={buildStreamUrl()}
			title={ariaLabel}
			allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
			class="h-full w-full"
			loading="lazy"
			onload={() => {
				onready?.(videoUid);
				addBreadcrumb({
					category: 'stream',
					message: 'StreamPlayer: iframe loaded',
					level: 'info'
				});
			}}
		></iframe>
	{/if}
</div>

<noscript>
	<div
		class="aspect-{aspectRatio} bg-base-200 flex items-center justify-center overflow-hidden rounded-lg {className}"
	>
		<p class="text-base-content/60 text-sm">{$t('stream_player.status.error')}</p>
	</div>
</noscript>
