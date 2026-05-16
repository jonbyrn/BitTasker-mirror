<script lang="ts">
	import type { VideoIntroMetadata } from '$lib/types/profile';
	import { t } from 'svelte-i18n';
	import { onDestroy, onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { getSignedEvent, publishEvent } from '$lib/utils/nostr';
	import { subscribeToProfileUpdates, deleteNostrEvent } from '$lib/nostr/profile';
	import StreamPlayer from '$lib/components/StreamPlayer.svelte';
	import { checkUploadWarnings, type UploadWarning } from '$lib/utils/video-upload';

	import Uppy from '@uppy/core';
	import type { UppyFile, Meta, Body, FileProgressStarted } from '@uppy/utils';
	import Tus from '@uppy/tus';
	// Note: We use Uppy directly without @uppy/svelte components for full UI control

	type VideoMeta = Meta & { folder?: string };
	type VideoBody = Body;
	type VideoUppy = Uppy<VideoMeta, VideoBody>;
	type VideoUppyFile = UppyFile<VideoMeta, VideoBody>;

	let { onComplete } = $props<{
		onComplete: (completed: boolean, fromSave?: boolean) => void;
	}>();

	// Configuration
	const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
	const MAX_DURATION = 180; // 3 minutes
	const ALLOWED_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v'];

	// Local state
	let videoData = $state<VideoIntroMetadata | null>(null);
	let isLoading = $state(false);
	let error = $state('');
	let videoEventId = $state<string | null>(null);
	let isInitialLoading = $state(false);
	let cleanup: (() => void) | null = null;
	let streamStatus = $state<'encoding' | 'ready' | 'error' | 'uploading'>('encoding');

	// Upload state
	let uppy = $state<VideoUppy | null>(null);
	let uploadProgress = $state(0);
	let uploadSpeed = $state(0);
	let uploadedBytes = $state(0);
	let totalBytes = $state(0);
	let isPaused = $state(false);
	let uploadError = $state<string | null>(null);
	let isUploading = $state(false);
	let uploadWarnings = $state<UploadWarning[]>([]);
	let showWarningModal = $state(false);
	let _pendingFile = $state<File | null>(null);
	let selectedFile = $state<File | null>(null);
	let previewUrl = $state<string | null>(null);
	let videoDuration = $state<number | null>(null);
	let videoWidth = $state<number | null>(null);
	let videoHeight = $state<number | null>(null);
	let lastMediaId: string | null = null;

	// Derived states
	let timeRemaining = $derived(() => {
		if (!uploadSpeed || uploadSpeed === 0 || !totalBytes) return null;
		const remaining = totalBytes - uploadedBytes;
		return Math.ceil(remaining / uploadSpeed);
	});

	let formattedSpeed = $derived(() => {
		if (!uploadSpeed) return '';
		if (uploadSpeed >= 1024 * 1024) {
			return `${(uploadSpeed / (1024 * 1024)).toFixed(1)} MB/s`;
		}
		return `${(uploadSpeed / 1024).toFixed(0)} KB/s`;
	});

	let formattedTimeRemaining = $derived(() => {
		const seconds = timeRemaining();
		if (seconds === null) return '';
		if (seconds < 60) return `${seconds}s`;
		if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
		return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
	});

	// Initialize Uppy
	onMount(async () => {
		if (!browser) return;

		// Subscribe to video updates
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

							// Check actual video status from Cloudflare before setting to 'ready'
							// This prevents showing a broken player for videos still encoding
							if (videoKey && /^[a-f0-9]{32}$/.test(videoKey)) {
								try {
									const statusRes = await fetch(`/api/cloudflare/stream/status/${videoKey}`);
									if (statusRes.ok) {
										const statusData = await statusRes.json();
										if (statusData.state === 'ready') {
											streamStatus = 'ready';
										} else if (statusData.state === 'error') {
											streamStatus = 'error';
										} else {
											// Video is still encoding - let StreamPlayer handle polling
											streamStatus = 'encoding';
										}
									} else {
										// Status check failed, assume encoding
										streamStatus = 'encoding';
									}
								} catch {
									// Network error, assume encoding and let StreamPlayer poll
									streamStatus = 'encoding';
								}
							} else {
								// Not a valid Cloudflare UID, assume ready (might be external URL)
								streamStatus = 'ready';
							}
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

		// Initialize Uppy instance
		initUppy();
	});

	function initUppy() {
		const uppyInstance = new Uppy<VideoMeta, VideoBody>({
			id: 'video-intro-uploader',
			restrictions: {
				maxFileSize: MAX_FILE_SIZE,
				maxNumberOfFiles: 1,
				allowedFileTypes: ALLOWED_TYPES
			},
			autoProceed: false,
			meta: {
				folder: 'videos-intro'
			}
		});

		// Add TUS plugin for resumable uploads to Cloudflare Stream
		// TUS endpoint is our Worker proxy at /api/cloudflare/stream/tus
		// Cloudflare Stream TUS requirements:
		// - Minimum chunk: 5 MB, Recommended: 50 MB, Maximum: 200 MB
		// - Chunk size must be divisible by 256 KiB
		uppyInstance.use(Tus, {
			endpoint: '/api/cloudflare/stream/tus',
			retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
			chunkSize: 52428800, // 50MB chunks (recommended by Cloudflare, divisible by 256 KiB)
			removeFingerprintOnSuccess: true,
			onAfterResponse: (_, response) => {
				// Cloudflare Stream returns the media ID in the stream-media-id header
				const mediaId = response.getHeader('stream-media-id');
				if (mediaId) {
					lastMediaId = mediaId;
				}
			}
		});

		// Event handlers
		uppyInstance.on('file-added', handleFileAdded);
		uppyInstance.on('upload-progress', handleUploadProgress);
		uppyInstance.on('upload-success', handleUploadSuccess);
		uppyInstance.on('upload-error', handleUploadError);
		uppyInstance.on('upload', () => {
			isUploading = true;
			streamStatus = 'uploading';
		});
		uppyInstance.on('complete', () => {
			isUploading = false;
		});
		uppyInstance.on('restriction-failed', (_, err) => {
			uploadError = err.message;
		});

		uppy = uppyInstance;
	}

	async function handleFileAdded(file: VideoUppyFile) {
		uploadError = null;
		const videoFile = file.data as File;

		// Create preview
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		previewUrl = URL.createObjectURL(videoFile);
		selectedFile = videoFile;

		// Validate video duration
		try {
			const video = document.createElement('video');
			video.preload = 'metadata';
			video.src = previewUrl;

			await new Promise<void>((resolve, reject) => {
				video.onloadedmetadata = () => resolve();
				video.onerror = () => reject(new Error('Failed to load video'));
			});

			videoDuration = video.duration;
			videoWidth = video.videoWidth;
			videoHeight = video.videoHeight;

			if (videoDuration > MAX_DURATION) {
				uploadError = $t('common.components.media_uploader.video_duration_limit', {
					values: { maxDuration: MAX_DURATION / 60 }
				});
				uppy?.removeFile(file.id);
				return;
			}
		} catch (err) {
			console.error('Video validation failed:', err);
			uploadError = $t('common.components.media_uploader.failed_to_validate_video');
			uppy?.removeFile(file.id);
			return;
		}

		// Check for warnings
		const warnings = await checkUploadWarnings(videoFile.size);
		if (warnings.length > 0) {
			uploadWarnings = warnings;
			_pendingFile = videoFile;
			showWarningModal = true;
		}
	}

	function handleUploadProgress(_file: VideoUppyFile | undefined, progress: FileProgressStarted) {
		if (progress.bytesTotal && progress.bytesUploaded !== undefined) {
			uploadedBytes = progress.bytesUploaded;
			totalBytes = progress.bytesTotal;
			uploadProgress = Math.round((progress.bytesUploaded / progress.bytesTotal) * 100);

			// Calculate speed (bytes per second)
			uploadSpeed = progress.bytesUploaded / ((Date.now() - uploadStartTime) / 1000);
		}
	}

	let uploadStartTime = 0;

	async function handleUploadSuccess(
		file: VideoUppyFile | undefined,
		response: { uploadURL?: string; body?: VideoBody; status?: number }
	) {
		try {
			isLoading = true;
			streamStatus = 'encoding';

			// Get the UID from the TUS response header (captured in onAfterResponse)
			// or extract from the upload URL
			let uid = lastMediaId;
			if (!uid && response.uploadURL) {
				// Try to extract from URL path: /tus/{uid}
				const match = response.uploadURL.match(/\/tus\/([a-f0-9]+)/);
				if (match) uid = match[1];
			}

			if (!uid) throw new Error('No video UID returned');

			const customerCode = import.meta.env.VITE_STREAM_CUSTOMER_CODE;
			const videoFile = file?.data as File;

			const uploadedThumbnail = {
				url: `https://customer-${customerCode}.cloudflarestream.com/${uid}/thumbnails/thumbnail.jpg`,
				key: `${uid}/thumbnails/thumbnail.jpg`,
				type: 'image/jpeg',
				alt: (videoFile?.name || 'video').replace(/\.[^/.]+$/, '') + ' thumbnail',
				width: videoWidth || 0,
				height: videoHeight || 0
			};

			const videoMetadata: VideoIntroMetadata = {
				video: {
					key: uid,
					url: `https://customer-${customerCode}.cloudflarestream.com/${uid}/manifest/video.m3u8`,
					type: videoFile?.type || 'video/mp4',
					alt: videoFile?.name || 'Profile video',
					size: videoFile?.size || 0,
					duration: videoDuration || 0
				},
				thumbnail: uploadedThumbnail
			};

			await publishVideoEvent(videoMetadata);
			videoData = videoMetadata;
			onComplete(!!videoData, true);

			// Reset upload state
			resetUploadState();
		} catch (err) {
			console.error('Failed to process upload:', err);
			uploadError = err instanceof Error ? err.message : $t('profile.video.failed_to_upload');
			streamStatus = 'error';
		} finally {
			isLoading = false;
		}
	}

	function handleUploadError(_file: VideoUppyFile | undefined, err: Error) {
		uploadError = err.message || $t('profile.video.failed_to_upload');
		streamStatus = 'error';
		isUploading = false;
	}

	function resetUploadState() {
		uploadProgress = 0;
		uploadSpeed = 0;
		uploadedBytes = 0;
		totalBytes = 0;
		isPaused = false;
		uploadError = null;
		isUploading = false;
		selectedFile = null;
		lastMediaId = null;
		if (previewUrl) {
			URL.revokeObjectURL(previewUrl);
			previewUrl = null;
		}
		videoDuration = null;
		videoWidth = null;
		videoHeight = null;
		uppy?.cancelAll();
	}

	async function startUpload() {
		if (!uppy) return;
		uploadStartTime = Date.now();
		showWarningModal = false;
		_pendingFile = null;
		try {
			await uppy.upload();
		} catch (err) {
			console.error('Upload failed:', err);
		}
	}

	function pauseUpload() {
		if (!uppy) return;
		uppy.pauseAll();
		isPaused = true;
	}

	function resumeUpload() {
		if (!uppy) return;
		uppy.resumeAll();
		isPaused = false;
	}

	function retryUpload() {
		if (!uppy) return;
		uploadError = null;
		uppy.retryAll();
	}

	function cancelUpload() {
		if (!uppy) return;
		uppy.cancelAll();
		resetUploadState();
	}

	function dismissWarning() {
		showWarningModal = false;
		_pendingFile = null;
		resetUploadState();
	}

	async function publishVideoEvent(
		videoData: VideoIntroMetadata,
		relay = import.meta.env.VITE_NOSTR_RELAY_URL
	) {
		const event = {
			kind: 21,
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
	}

	async function removeVideo() {
		if (!videoData) return;

		try {
			isLoading = true;
			error = '';

			if (videoEventId) {
				await deleteNostrEvent(videoEventId, '21');
			}

			videoData = null;
			videoEventId = null;
			resetUploadState();
		} catch (err) {
			console.error('Failed to remove video:', err);
			error = $t('profile.video.failed_to_remove');
		} finally {
			isLoading = false;
		}
	}

	onDestroy(() => {
		if (cleanup) cleanup();
		if (uppy) uppy.destroy();
		if (previewUrl) URL.revokeObjectURL(previewUrl);
	});

	$effect(() => {
		onComplete(!!videoData);
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
				{#if videoData}
					<!-- Existing video display -->
					<StreamPlayer
						videoUid={videoData.video.key}
						videoUrl={videoData.video.url || null}
						private={false}
						controls={true}
						status={streamStatus === 'uploading' ? 'encoding' : streamStatus}
						{uploadProgress}
						onready={() => (streamStatus = 'ready')}
						onerror={() => (streamStatus = 'error')}
					/>
					<button
						type="button"
						class="btn btn-error btn-block mt-2"
						onclick={removeVideo}
						disabled={isLoading}
						aria-label={$t('common.components.media_uploader.remove_file')}
					>
						{#if isLoading}
							<span class="loading loading-spinner loading-sm"></span>
						{/if}
						{$t('common.components.media_uploader.remove_file')}
					</button>
				{:else if uppy}
					{#if isUploading || selectedFile}
						<!-- Upload in progress or file selected -->
						<div class="card bg-base-200 border-base-300 border">
							<div class="card-body p-4">
								<!-- Preview -->
								{#if previewUrl}
									<div class="relative aspect-video overflow-hidden rounded-lg">
										<video
											src={previewUrl}
											class="h-full w-full object-cover"
											muted
											playsinline
											aria-label={$t('profile.video.preview')}
										>
											<track kind="captions" />
										</video>

										<!-- Overlay for uploading state -->
										{#if isUploading}
											<div class="absolute inset-0 flex items-center justify-center bg-black/60">
												<div class="text-center text-white">
													<div
														class="radial-progress text-primary mb-2"
														style="--value:{uploadProgress}; --size:4rem; --thickness:4px;"
														role="progressbar"
														aria-valuenow={uploadProgress}
														aria-valuemin={0}
														aria-valuemax={100}
													>
														{uploadProgress}%
													</div>
													<p class="text-sm font-medium">
														{isPaused
															? $t('stream_player.status.paused')
															: $t('stream_player.status.uploading', {
																	values: { progress: uploadProgress }
																})}
													</p>
													{#if formattedSpeed() && !isPaused}
														<p class="text-xs opacity-80">
															{formattedSpeed()}
															{#if formattedTimeRemaining()}
																• {formattedTimeRemaining()}
																{$t('profile.video.remaining')}
															{/if}
														</p>
													{/if}
												</div>
											</div>
										{/if}
									</div>
								{/if}

								<!-- Progress bar -->
								{#if isUploading}
									<div class="mt-3">
										<progress
											class="progress progress-primary w-full"
											value={uploadProgress}
											max="100"
											aria-label={$t('stream_player.a11y.upload_progress', {
												values: { progress: uploadProgress }
											})}
										></progress>
									</div>
								{/if}

								<!-- File info -->
								{#if selectedFile}
									<div class="mt-2 flex items-center justify-between text-sm">
										<span class="text-base-content/70 truncate">
											{selectedFile.name}
										</span>
										<span class="text-base-content/50">
											{(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
											{#if videoDuration}
												• {Math.floor(videoDuration / 60)}:{String(
													Math.floor(videoDuration % 60)
												).padStart(2, '0')}
											{/if}
										</span>
									</div>
								{/if}

								<!-- Error display -->
								{#if uploadError}
									<div class="alert alert-error alert-sm mt-3">
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-5 w-5 shrink-0"
											viewBox="0 0 20 20"
											fill="currentColor"
										>
											<path
												fill-rule="evenodd"
												d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
												clip-rule="evenodd"
											/>
										</svg>
										<span>{uploadError}</span>
									</div>
								{/if}

								<!-- Control buttons -->
								<div class="mt-4 flex flex-wrap gap-2">
									{#if uploadError}
										<button
											type="button"
											class="btn btn-primary btn-sm flex-1"
											onclick={retryUpload}
											aria-label={$t('stream_player.action.retry')}
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="h-4 w-4"
												viewBox="0 0 20 20"
												fill="currentColor"
											>
												<path
													fill-rule="evenodd"
													d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
													clip-rule="evenodd"
												/>
											</svg>
											{$t('stream_player.action.retry')}
										</button>
									{:else if isUploading}
										{#if isPaused}
											<button
												type="button"
												class="btn btn-primary btn-sm flex-1"
												onclick={resumeUpload}
												aria-label={$t('stream_player.action.resume')}
											>
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="h-4 w-4"
													viewBox="0 0 20 20"
													fill="currentColor"
												>
													<path
														fill-rule="evenodd"
														d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
														clip-rule="evenodd"
													/>
												</svg>
												{$t('stream_player.action.resume')}
											</button>
										{:else}
											<button
												type="button"
												class="btn btn-secondary btn-sm flex-1"
												onclick={pauseUpload}
												aria-label={$t('stream_player.action.pause')}
											>
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="h-4 w-4"
													viewBox="0 0 20 20"
													fill="currentColor"
												>
													<path
														fill-rule="evenodd"
														d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z"
														clip-rule="evenodd"
													/>
												</svg>
												{$t('stream_player.action.pause')}
											</button>
										{/if}
									{:else if selectedFile && !isUploading}
										<button
											type="button"
											class="btn btn-primary btn-sm flex-1"
											onclick={startUpload}
											aria-label={$t('common.buttons.upload')}
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="h-4 w-4"
												viewBox="0 0 20 20"
												fill="currentColor"
											>
												<path
													fill-rule="evenodd"
													d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z"
													clip-rule="evenodd"
												/>
											</svg>
											{$t('common.buttons.upload')}
										</button>
									{/if}

									<button
										type="button"
										class="btn btn-ghost btn-sm flex-1"
										onclick={cancelUpload}
										aria-label={$t('common.buttons.cancel')}
									>
										{$t('common.buttons.cancel')}
									</button>
								</div>
							</div>
						</div>
					{:else}
						<!-- Custom Dropzone with professional UI -->
						<label
							class="bg-base-200 hover:bg-base-300 border-primary/30 hover:border-primary/60 flex h-48 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors"
							ondragover={(e) => {
								e.preventDefault();
								e.currentTarget.classList.add('border-primary', 'bg-primary/5');
							}}
							ondragleave={(e) => {
								e.currentTarget.classList.remove('border-primary', 'bg-primary/5');
							}}
							ondrop={(e) => {
								e.preventDefault();
								e.currentTarget.classList.remove('border-primary', 'bg-primary/5');
								const files = e.dataTransfer?.files;
								if (files && files[0] && uppy) {
									try {
										uppy.addFile({
											name: files[0].name,
											type: files[0].type,
											data: files[0],
											source: 'Local',
											isRemote: false
										});
									} catch (err) {
										console.error('Failed to add file:', err);
									}
								}
							}}
						>
							<input
								type="file"
								class="hidden"
								accept={ALLOWED_TYPES.join(',')}
								onchange={(e) => {
									const file = e.currentTarget.files?.[0];
									if (file && uppy) {
										try {
											uppy.addFile({
												name: file.name,
												type: file.type,
												data: file,
												source: 'Local',
												isRemote: false
											});
										} catch (err) {
											console.error('Failed to add file:', err);
										}
									}
								}}
							/>
							<div class="bg-primary/10 mb-3 rounded-full p-4">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="text-primary h-8 w-8"
									viewBox="0 0 20 20"
									fill="currentColor"
									aria-hidden="true"
								>
									<path
										d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z"
									/>
								</svg>
							</div>

							<p class="text-base-content mb-1 text-center font-medium">
								{$t('profile.video.upload_title')}
							</p>
							<p class="text-base-content/60 text-center text-sm">
								{$t('profile.video.drag_or_click')}
							</p>
							<p class="text-base-content/40 mt-2 text-center text-xs">
								MP4, WebM, MOV • {$t('common.components.media_uploader.max_info', {
									values: {
										size: MAX_FILE_SIZE / (1024 * 1024),
										durationInfo: `${MAX_DURATION / 60} min`
									}
								})}
							</p>
						</label>
					{/if}
				{:else}
					<!-- Uppy not initialized yet -->
					<div class="skeleton h-48 w-full rounded-lg"></div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<!-- Warning Modal -->
{#if showWarningModal}
	<div class="modal modal-open" role="dialog" aria-modal="true" aria-labelledby="warning-title">
		<div class="modal-box">
			<h3 id="warning-title" class="text-lg font-bold">
				{$t('profile.video.upload_warning_title')}
			</h3>
			<div class="py-4">
				<ul class="space-y-2">
					{#each uploadWarnings as warning (warning.code)}
						<li class="flex items-start gap-2">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="text-warning mt-0.5 h-5 w-5 shrink-0"
								viewBox="0 0 20 20"
								fill="currentColor"
							>
								<path
									fill-rule="evenodd"
									d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
									clip-rule="evenodd"
								/>
							</svg>
							<span class="text-base-content/80">{warning.message}</span>
						</li>
					{/each}
				</ul>
			</div>
			<div class="modal-action">
				<button type="button" class="btn btn-ghost" onclick={dismissWarning}>
					{$t('common.buttons.cancel')}
				</button>
				<button type="button" class="btn btn-primary" onclick={startUpload}>
					{$t('profile.video.continue_upload')}
				</button>
			</div>
		</div>
		<button
			type="button"
			class="modal-backdrop"
			onclick={dismissWarning}
			aria-label={$t('common.buttons.close')}
		></button>
	</div>
{/if}

<style>
	/* Uppy Dropzone customization for DaisyUI theme */
	:global([data-uppy-element='dropzone']) {
		background: transparent !important;
		border: none !important;
	}

	:global([data-uppy-element='dropzone'][data-state='dragging-over']) {
		background: oklch(var(--p) / 0.1) !important;
	}

	/* Radial progress animation */
	.radial-progress {
		--value: 0;
		--size: 4rem;
		--thickness: 4px;
	}
</style>
