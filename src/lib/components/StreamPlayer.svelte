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
	let token = $state<string | null>(null);
	let tokenError = $state(false);
	let posterLoaded = $state(false);
	let encodingTimedOut = $state(false);
	let encodingTimer = $state<ReturnType<typeof setTimeout> | null>(null);

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

	$effect(() => {
		if (isPrivate && status === 'ready' && browser) {
			fetchToken();
		}
	});

	$effect(() => {
		if (poster) {
			posterLoaded = false;
			const img = new Image();
			img.onload = () => (posterLoaded = true);
			img.onerror = () => (posterLoaded = true);
			img.src = poster;
		} else {
			posterLoaded = true;
		}
	});

	$effect(() => {
		if ((status === 'encoding' || status === 'queued') && browser) {
			encodingTimedOut = false;
			if (encodingTimer) clearTimeout(encodingTimer);
			encodingTimer = setTimeout(
				() => {
					encodingTimedOut = true;
				},
				30 * 60 * 1000
			);
		}
		return () => {
			if (encodingTimer) clearTimeout(encodingTimer);
		};
	});

	$effect(() => {
		if (!browser) return;
		if (status === 'ready') {
			addBreadcrumb({ category: 'stream', message: 'StreamPlayer: ready', level: 'info' });
		} else if (status === 'error') {
			addBreadcrumb({ category: 'stream', message: 'StreamPlayer: error', level: 'error' });
		} else if (status === 'expired') {
			addBreadcrumb({ category: 'stream', message: 'StreamPlayer: expired', level: 'warning' });
		} else if (status === 'offline') {
			addBreadcrumb({ category: 'stream', message: 'StreamPlayer: offline', level: 'warning' });
		}
	});
</script>

<div
	class="stream-player aspect-{aspectRatio} overflow-hidden rounded-lg {className}"
	role="region"
	aria-label={ariaLabel}
>
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
			<div class="skeleton h-4/5 w-full rounded-lg motion-reduce:hidden"></div>
			<p class="mt-2 text-center text-sm">
				{status === 'queued'
					? $t('stream_player.status.queued')
					: $t('stream_player.status.encoding')}
			</p>
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
	{:else if !posterLoaded}
		<div class="bg-base-200 flex h-full items-center justify-center">
			<div class="skeleton h-full w-full rounded-lg"></div>
		</div>
	{:else if !videoUid && !videoUrl}
		<div class="bg-base-200 text-base-content/60 flex h-full items-center justify-center">
			<p class="text-sm">{$t('stream_player.status.error')}</p>
		</div>
	{:else if videoUrl && !videoUid}
		<video src={videoUrl} controls playsinline class="h-full w-full" aria-label={ariaLabel}></video>
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
