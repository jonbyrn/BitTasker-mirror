<script lang="ts">
	import type { VideoIntroMetadata } from '$lib/types/profile';
	import { t } from 'svelte-i18n';
	import { onDestroy, onMount } from 'svelte';
	import { getSignedEvent, publishEvent } from '$lib/utils/nostr';
	import { subscribeToProfileUpdates, deleteNostrEvent } from '$lib/nostr/profile';
	import Uploader from '$lib/components/Uploader.svelte';
	import uploadService from '$lib/api/services/upload.service';

	let { onComplete } = $props<{ 
		onComplete: (completed: boolean, fromSave?: boolean) => void;
	}>();

	// Local state
	let videoData = $state<VideoIntroMetadata | null>(null);
	let isRecording = $state(false);
	let mediaRecorder: MediaRecorder | null = $state(null);
	let recordedChunks: Blob[] = $state([]);
	let isLoading = $state(false);
	let error = $state('');
	let stream: MediaStream | null = $state(null);
	let videoPreview: HTMLVideoElement | null = $state(null);
	let videoEventId = $state<string | null>(null);
	let isInitialLoading = $state(false);
	let cleanup: (() => void) | null = null;

	// Subscribe to video updates
	onMount(async () => {
		cleanup = await subscribeToProfileUpdates(
			async (event) => {
				try {
					isInitialLoading = true;
					// Handle video metadata update (kind 21)
					if (event.kind === 21) {
						videoEventId = event.id;
						const metadata = JSON.parse(event.content);
						const videoUrl = event.tags.find((t) => t[0] === 'url')?.[1];
						const thumbnailUrl = event.tags.find((t) => t[0] === 'thumb')?.[1];
						const duration = Number(event.tags.find((t) => t[0] === 'duration')?.[1]) || 0;

						if (videoUrl && thumbnailUrl) {
							videoData = {
								video: {
									url: videoUrl,
									key: event.tags.find((t) => t[0] === 'x')?.[1] || '',
									type: 'video/webm',
									alt: 'Profile video',
									size: metadata.video.size,
									duration
								},
								thumbnail: metadata.thumbnail
							};
						}
					}
				} catch (err) {
					console.error('Failed to process video update:', err);
					error = $t('profile.video.failed_to_connect');
				} finally {
					isInitialLoading = false;
				}
			},
			{ 21: null } // Subscribe to kind 21 (video) events
		);
	});

	// Cleanup subscription on component destroy
	onDestroy(() => {
		if (cleanup) cleanup();
		if (stream) {
			stream.getTracks().forEach((track) => track.stop());
		}
	});

	// Track completion
	$effect(() => {
		onComplete(!!videoData);
	});

	// Publish video event to Nostr
	async function publishVideoEvent(videoData: VideoIntroMetadata, relay = import.meta.env.VITE_NOSTR_RELAY_URL) {
		try {
			// Publish to Nostr with extended metadata
			const event = {
				kind: 21, // NIP-71 Video Event
				created_at: Math.floor(Date.now() / 1000),
				tags: [
					['url', videoData.video.url],
					['x', videoData.video.key],
					['m', videoData.video.type],
					['thumb', videoData.thumbnail.url],
					['duration', videoData.video.duration?.toString()],
					['size', videoData.video.size?.toString()],
					['t', 'profile-video']
				],
				content: JSON.stringify({
					video: videoData.video,
					thumbnail: videoData.thumbnail,
					type: 'profile-intro'
				})
			};

			const signedEvent = await getSignedEvent(event);
			await publishEvent(signedEvent, relay);
		} catch (err) {
			console.error('Failed to publish video event:', err);
			throw err;
		}
	}

	// Handle video upload
	async function handleVideoUpload(files: File[]) {
		if (!files.length) return;

		try {
			isLoading = true;
			error = '';

			const videoFile = files[0];
			// Create video element to get metadata
			const video = document.createElement('video');
			video.preload = 'metadata';
			video.crossOrigin = 'anonymous';

			const videoUrl = URL.createObjectURL(videoFile);
			video.src = videoUrl;

			await new Promise((resolve) => {
				video.onloadeddata = () => {
					// Set a small timeout to ensure the video frame is actually loaded
					setTimeout(() => resolve(null), 100);
				};
			});

			// Upload video
			const uploadedVideo = await uploadService.uploadSingleFile(videoFile, {
				folder: 'videos-intro',
				metadata: {
					name: videoFile.name
				}
			});

			// Set video to a specific time to avoid black frame
			video.currentTime = 0.1;

			await new Promise((resolve) => {
				video.onseeked = () => resolve(null);
			});

			const canvas = document.createElement('canvas');
			canvas.width = video.videoWidth;
			canvas.height = video.videoHeight;
			const ctx = canvas.getContext('2d');

			if (ctx) {
				// Clear the canvas first
				ctx.fillStyle = '#FFFFFF';
				ctx.fillRect(0, 0, canvas.width, canvas.height);
				// Draw the video frame
				ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
			}

			const thumbnailBlob = await new Promise<Blob>((resolve) => {
				canvas.toBlob((blob) => resolve(blob!), 'image/webp', 0.7);
			});

			const thumbnailFile = new File([thumbnailBlob], 'thumbnail.webp', { type: 'image/webp' });
			// TODO: Remove this once we have a real upload service
			// const uploadedThumbnail = await uploadService.uploadSingleFile(thumbnailFile, 'thumbnails');
			const uploadedThumbnail = {
				url: 'https://pub-9749cc3802084a9da8131640ddfd3403.r2.dev/thumbnails/1748624684204-ee1d033c0a6f338a.webp',
				key: 'thumbnails/1748624684204-ee1d033c0a6f338a.webp'
			};

			const videoMetadata = {
				video: {
					key: uploadedVideo.key,
					url: uploadedVideo.url,
					type: videoFile.type,
					alt: videoFile.name,
					size: videoFile.size,
					duration: video.duration
				},
				thumbnail: {
					key: uploadedThumbnail.key,
					url: uploadedThumbnail.url,
					type: 'image/webp',
					alt: videoFile.name.replace(/\.[^/.]+$/, '') + ' thumbnail',
					width: video.videoWidth,
					height: video.videoHeight,
					size: thumbnailFile.size
				}
			};

			// Publish to Nostr
			await publishVideoEvent(videoMetadata);
			videoData = videoMetadata;

			// Notify completion change from save (triggers toast in parent)
			onComplete(!!videoData, true);

			// Cleanup
			URL.revokeObjectURL(videoUrl);
		} catch (err) {
			console.error('Video upload failed:', err);
			error = err instanceof Error ? err.message : $t('profile.video.failed_to_upload');
		} finally {
			isLoading = false;
		}
	}

	// TODO: Check if not already natively supported by mobile
	// Start recording
	async function startRecording() {
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				video: true,
				audio: true
			});

			if (videoPreview) {
				videoPreview.srcObject = stream;
				videoPreview.play();
			}

			mediaRecorder = new MediaRecorder(stream);
			recordedChunks = [];

			mediaRecorder.ondataavailable = (e) => {
				if (e.data.size > 0) {
					recordedChunks = [...recordedChunks, e.data];
				}
			};

			mediaRecorder.start();
			isRecording = true;

			// Stop recording after 3 minutes
			setTimeout(() => {
				if (isRecording) stopRecording();
			}, 180000);
		} catch (err) {
			console.error('Failed to start recording:', err);
			error = $t('profile.video.failed_to_access_camera');
		}
	}

	// TODO: Check if not already natively supported by mobile
	// Stop recording
	async function stopRecording() {
		if (!mediaRecorder || !stream) return;

		mediaRecorder.stop();
		stream.getTracks().forEach((track) => track.stop());
		isRecording = false;

		// Wait for the last chunk
		await new Promise<void>((resolve) => {
			mediaRecorder!.onstop = () => resolve();
		});

		try {
			isLoading = true;
			error = '';

			const videoBlob = new Blob(recordedChunks, { type: 'video/webm' });
			const videoFile = new File([videoBlob], 'recording.webm', { type: 'video/webm' });

			// Upload video
			const uploadedVideo = await uploadService.uploadSingleFile(videoFile, {
				folder: 'videos',
				metadata: {
					name: videoFile.name
				}
			});

			// Generate and upload thumbnail
			const video = document.createElement('video');
			video.preload = 'metadata';
			video.crossOrigin = 'anonymous';

			const videoUrl = URL.createObjectURL(videoFile);
			video.src = videoUrl;

			await new Promise((resolve) => {
				video.onloadeddata = () => {
					// Set a small timeout to ensure the video frame is actually loaded
					setTimeout(() => resolve(null), 100);
				};
			});

			// Set video to a specific time to avoid black frame
			video.currentTime = 0.1;

			await new Promise((resolve) => {
				video.onseeked = () => resolve(null);
			});

			const canvas = document.createElement('canvas');
			canvas.width = video.videoWidth;
			canvas.height = video.videoHeight;
			const ctx = canvas.getContext('2d');

			if (ctx) {
				// Clear the canvas first
				ctx.fillStyle = '#FFFFFF';
				ctx.fillRect(0, 0, canvas.width, canvas.height);
				// Draw the video frame
				ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
			}

			const thumbnailBlob = await new Promise<Blob>((resolve) => {
				canvas.toBlob((blob) => resolve(blob!), 'image/webp', 0.7);
			});

			const thumbnailFile = new File([thumbnailBlob], 'thumbnail.webp', { type: 'image/webp' });
			const uploadedThumbnail = await uploadService.uploadSingleFile(thumbnailFile, {
				folder: 'thumbnails',
				metadata: {
					name: thumbnailFile.name
				}
			});

			// Update video data
			const videoMetadata = {
				video: {
					url: uploadedVideo.url,
					key: uploadedVideo.key,
					type: videoFile.type,
					alt: videoFile.name,
					size: videoFile.size,
					duration: video.duration
				},
				thumbnail: {
					key: uploadedThumbnail.key,
					url: uploadedThumbnail.url,
					type: 'image/webp',
					alt: videoFile.name.replace(/\.[^/.]+$/, '') + ' thumbnail'
				}
			};

			// Publish to Nostr
			await publishVideoEvent(videoMetadata);
			videoData = videoMetadata;

			// Notify completion change from save (triggers toast in parent)
			onComplete(!!videoData, true);
		} catch (err) {
			console.error('Failed to save recording:', err);
			error = $t('profile.video.failed_to_save_recording');
		} finally {
			isLoading = false;
			recordedChunks = [];
		}
	}

	// Remove video
	async function removeVideo() {
		if (!videoData) return;

		try {
			isLoading = true;
			error = '';

			// Delete the video event using the shared function
			if (videoEventId) {
				await deleteNostrEvent(videoEventId, '21');
			}

			videoData = null;
			videoEventId = null;

			if (videoPreview) {
				videoPreview.srcObject = null;
			}
		} catch (err) {
			console.error('Failed to remove video:', err);
			error = $t('profile.video.failed_to_remove');
		} finally {
			isLoading = false;
		}
	}
</script>

{#if isInitialLoading}
	<div class="space-y-6">
		<!-- Title and Description Skeleton -->
		<div class="space-y-4">
			<div>
				<div class="bg-base-300 h-6 w-48 animate-pulse rounded"></div>
				<div class="bg-base-300 mt-1 h-4 w-64 animate-pulse rounded"></div>
			</div>

			<!-- Upload Area Skeleton -->
			<div class="bg-base-300 h-24 w-full animate-pulse rounded-lg border"></div>
		</div>
	</div>
{:else}
	<div class="space-y-6">
		<div class="space-y-4">
			<div>
				<p class="text-base-content/70">{$t('profile.video.description')}</p>
			</div>

			{#if error}
				<div class="alert alert-error alert-outline whitespace-normal">{error}</div>
			{/if}

			<div class="space-y-4 pr-4">
				<!-- Upload video -->
				{#if !isLoading}
					<Uploader
						id="videoUpload"
						label={$t('profile.video.upload_title')}
						allowedTypes={['video/*']}
						maxFiles={1}
						onChange={handleVideoUpload}
						className="w-full"
						maxDuration={180}
						maxFileSize={100}
						files={videoData ? [videoData.video.url] : []}
						onRemove={removeVideo}
					/>
				{:else}
					<div class="bg-base-300 h-24 w-full animate-pulse rounded-lg border"></div>
				{/if}

				<!-- TODO:Record video -->
				<!-- <div class="border-base-300 rounded-lg border p-4">
					<div class="space-y-4">
						{#if isRecording}
							<video bind:this={videoPreview} class="w-full rounded-lg" muted>
								<track kind="captions" />
							</video>
							<button class="btn btn-error btn-block" onclick={stopRecording} disabled={isLoading}>
								{$t('profile.video.stop_recording')}
							</button>
						{:else}
							<button class="btn btn-primary btn-block" onclick={startRecording} disabled={isLoading}>
								{$t('profile.video.record_video')}
							</button>
						{/if}
					</div>
				</div> -->
			</div>
		</div>
	</div>
{/if}
