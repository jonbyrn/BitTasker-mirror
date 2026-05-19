<script lang="ts">
	import type { VideoIntroMetadata } from '$lib/types/profile';
	import { t } from 'svelte-i18n';
	import { onDestroy, onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { getSignedEvent, publishEvent } from '$lib/utils/nostr';
	import { subscribeToProfileUpdates, deleteNostrEvent } from '$lib/nostr/profile';
	import VideoUploader from '$lib/components/VideoUploader.svelte';

	interface VideoUploadResult {
		uid: string;
		thumbnailUrl: string;
		hlsUrl: string;
		duration: number;
		size: number;
		filename: string;
	}

	let { onComplete } = $props<{
		onComplete: (completed: boolean, fromSave?: boolean) => void;
	}>();

	// State
	let videoData = $state<VideoIntroMetadata | null>(null);
	let error = $state('');
	let videoEventId = $state<string | null>(null);
	let isInitialLoading = $state(false);
	let cleanup: (() => void) | null = null;

	// Build VideoIntroMetadata from upload result
	function buildVideoMetadata(result: VideoUploadResult): VideoIntroMetadata {
		return {
			video: {
				key: result.uid,
				url: result.hlsUrl,
				type: 'video/mp4',
				alt: result.filename || 'Profile video',
				size: result.size,
				duration: result.duration
			},
			thumbnail: {
				url: result.thumbnailUrl,
				key: `${result.uid}/thumbnails/thumbnail.jpg`,
				type: 'image/jpeg',
				alt: (result.filename || 'video').replace(/\.[^/.]+$/, '') + ' thumbnail'
			}
		};
	}

	// Publish video event to Nostr
	async function publishVideoEvent(metadata: VideoIntroMetadata, relay = import.meta.env.VITE_NOSTR_RELAY_URL) {
		const event = {
			kind: 21,
			created_at: Math.floor(Date.now() / 1000),
			tags: [
				['url', metadata.video.url],
				['x', metadata.video.key],
				['m', metadata.video.type],
				['thumb', metadata.thumbnail.url],
				['duration', metadata.video.duration?.toString()],
				['size', metadata.video.size?.toString()],
				['t', 'profile-video']
			],
			content: JSON.stringify({
				video: metadata.video,
				thumbnail: metadata.thumbnail,
				type: 'profile-intro'
			})
		};

		const signedEvent = await getSignedEvent(event);
		await publishEvent(signedEvent, relay);
	}

	// Remove video from Nostr and clear state
	async function removeVideo() {
		if (!videoData) return;
		try {
			error = '';
			if (videoEventId) {
				await deleteNostrEvent(videoEventId, '21');
			}
			videoData = null;
			videoEventId = null;
		} catch (err) {
			console.error('Failed to remove video:', err);
			error = $t('profile.video.failed_to_remove');
		}
	}

	// Subscribe to profile updates to load existing video
	onMount(async () => {
		if (!browser) return;
		cleanup = await subscribeToProfileUpdates(
			async (event) => {
				try {
					isInitialLoading = true;
					if (event.kind === 21) {
						videoEventId = event.id;
						const metadata = JSON.parse(event.content);
						const videoUrl = event.tags.find((t) => t[0] === 'url')?.[1];
						const thumbnailUrl = event.tags.find((t) => t[0] === 'thumb')?.[1];
						const duration = Number(event.tags.find((t) => t[0] === 'duration')?.[1]) || 0;
						const videoKey = event.tags.find((t) => t[0] === 'x')?.[1] || '';

						if (videoUrl && thumbnailUrl) {
							videoData = {
								video: {
									url: videoUrl,
									key: videoKey,
									type: 'video/webm',
									alt: 'Profile video',
									size: metadata.video.size,
									duration
								},
								thumbnail: metadata.thumbnail
							};
							onComplete(true);
						}
					}
				} catch (err) {
					console.error('Failed to process video update:', err);
					error = $t('profile.video.failed_to_connect');
				} finally {
					isInitialLoading = false;
				}
			},
			{ 21: null }
		);
	});

	onDestroy(() => {
		if (cleanup) cleanup();
	});
</script>
{#if isInitialLoading}
	<div class="space-y-6">
		<div class="space-y-4">
			<div>
				<div class="skeleton h-6 w-48 rounded"></div>
				<div class="skeleton mt-1 h-4 w-64 rounded"></div>
			</div>
			<div class="skeleton h-48 w-full rounded-lg"></div>
		</div>
	</div>
{:else}
	<div class="space-y-6">
		<div class="space-y-4">
			<p class="text-base-content/70">{$t('profile.video.description')}</p>

			{#if error}
				<div class="alert alert-error alert-outline whitespace-normal">{error}</div>
			{/if}

			<div class="space-y-4 pr-4">
				<VideoUploader
					existingVideoUid={videoData?.video.key}
					existingPoster={videoData?.thumbnail?.url || null}
					videoUrl={videoData?.video.url || null}
					maxDuration={180}
					maxFileSize={100 * 1024 * 1024}
					private={false}
					controls={true}
					onUploadComplete={async (result) => {
						// Publish to Nostr (fire-and-forget, don't block UI)
						const metadata = buildVideoMetadata(result);
						await publishVideoEvent(metadata);
					}}
					onReady={() => {
						onComplete(true);
					}}
					onError={(msg) => {
						error = msg;
					}}
					onRemove={async (_uid) => {
						await removeVideo();
					}}
					showRemoveButton={!!videoData}
				/>
			</div>
		</div>
	</div>
{/if}
