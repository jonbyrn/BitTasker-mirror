<script lang="ts">
	import { UpdateUserProfileStore } from '$houdini';
	import Uploader from '$lib/components/Uploader.svelte';
	import uploadService from '$lib/api/services/upload.service';

	interface VideoIntroData {
		videoUrl: string;
		videoKey: string;
		thumbnailUrl: string;
		thumbnailKey: string;
		duration: number;
	}

	let { user, onComplete } = $props<{
		user: { videoIntro?: VideoIntroData | null } | null | undefined;
		onComplete: (completed: boolean) => void;
	}>();

	const profileStore = new UpdateUserProfileStore();

	// Local state
	let videoData = $state<VideoIntroData | null>(user?.videoIntro || null);
	let isRecording = $state(false);
	let mediaRecorder: MediaRecorder | null = $state(null);
	let recordedChunks: Blob[] = $state([]);
	let isLoading = $state(false);
	let error = $state('');
	let stream: MediaStream | null = $state(null);
	let videoPreview: HTMLVideoElement | null = $state(null);

	// Track completion
	$effect(() => {
		onComplete(!!videoData);
	});

	// Handle video upload
	async function handleVideoUpload(files: File[]) {
		if (!files.length) return;

		try {
			isLoading = true;
			error = '';

			const videoFile = files[0];

			// Create video element to get duration and generate thumbnail
			const video = document.createElement('video');
			video.preload = 'metadata';

			const videoUrl = URL.createObjectURL(videoFile);
			video.src = videoUrl;

			await new Promise((resolve) => {
				video.onloadedmetadata = () => resolve(null);
			});

			// Check video duration (max 3 minutes)
			if (video.duration > 180) {
				throw new Error('Video must be 3 minutes or shorter');
			}

			// Upload video
			const uploadedVideo = await uploadService.uploadSingleFile(videoFile, 'videos');

			// Generate and upload thumbnail
			const canvas = document.createElement('canvas');
			canvas.width = video.videoWidth;
			canvas.height = video.videoHeight;
			canvas.getContext('2d')?.drawImage(video, 0, 0);

			const thumbnailBlob = await new Promise<Blob>((resolve) => {
				canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.7);
			});

			const uploadedThumbnail = await uploadService.uploadSingleFile(
				new File([thumbnailBlob], 'thumbnail.jpg', { type: 'image/jpeg' }),
				'thumbnails'
			);

			// Update video data
			videoData = {
				videoUrl: uploadedVideo.url,
				videoKey: uploadedVideo.key,
				thumbnailUrl: uploadedThumbnail.url,
				thumbnailKey: uploadedThumbnail.key,
				duration: video.duration
			};

			// Cleanup
			URL.revokeObjectURL(videoUrl);
		} catch (err) {
			console.error('Video upload failed:', err);
			error = err instanceof Error ? err.message : 'Failed to upload video';
		} finally {
			isLoading = false;
		}
	}

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
			error = 'Failed to access camera and microphone';
		}
	}

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
			const uploadedVideo = await uploadService.uploadSingleFile(videoFile, 'videos');

			// Generate and upload thumbnail
			const video = document.createElement('video');
			video.src = URL.createObjectURL(videoBlob);

			await new Promise((resolve) => {
				video.onloadeddata = () => resolve(null);
			});

			const canvas = document.createElement('canvas');
			canvas.width = video.videoWidth;
			canvas.height = video.videoHeight;
			canvas.getContext('2d')?.drawImage(video, 0, 0);

			const thumbnailBlob = await new Promise<Blob>((resolve) => {
				canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.7);
			});

			const uploadedThumbnail = await uploadService.uploadSingleFile(
				new File([thumbnailBlob], 'thumbnail.jpg', { type: 'image/jpeg' }),
				'thumbnails'
			);

			// Update video data
			videoData = {
				videoUrl: uploadedVideo.url,
				videoKey: uploadedVideo.key,
				thumbnailUrl: uploadedThumbnail.url,
				thumbnailKey: uploadedThumbnail.key,
				duration: video.duration
			};
		} catch (err) {
			console.error('Failed to save recording:', err);
			error = 'Failed to save recording';
		} finally {
			isLoading = false;
			recordedChunks = [];
		}
	}

	// Remove video
	function removeVideo() {
		videoData = null;
		if (videoPreview) {
			videoPreview.srcObject = null;
		}
	}

	// Save video intro
	async function handleSubmit() {
		try {
			isLoading = true;
			error = '';

			if (!videoData) {
				error = 'Please upload or record a video introduction';
				return;
			}

			// Update profile using GraphQL
			const result = await profileStore.mutate({
				input: {
					videoIntro: videoData
				}
			});

			if (result.errors) {
				throw new Error(result.errors[0].message);
			}

			// Show success message
			const toast = document.getElementById('video-toast-success');
			if (toast) toast.style.display = 'block';
		} catch (err) {
			console.error('Video update failed:', err);
			error = err instanceof Error ? err.message : 'Failed to update video';
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="space-y-6">
	<!-- Video Preview -->
	{#if videoData}
		<div class="relative">
			<video
				src={videoData.videoUrl}
				poster={videoData.thumbnailUrl}
				controls
				class="w-full rounded-lg"
			>
				<track kind="captions" />
			</video>
			<button class="btn btn-circle btn-error absolute top-2 right-2" onclick={removeVideo}>
				✕
			</button>
		</div>
	{:else if isRecording}
		<div class="relative">
			<video bind:this={videoPreview} class="w-full rounded-lg" muted>
				<track kind="captions" />
			</video>
			<div class="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-4">
				<button class="btn btn-circle btn-error" onclick={stopRecording}> ⬛ </button>
			</div>
		</div>
	{/if}

	<!-- Upload/Record Controls -->
	{#if !videoData && !isRecording}
		<div class="grid gap-4 md:grid-cols-2">
			<!-- Upload Video -->
			<div class="card bg-base-200 p-4">
				<h3 class="mb-4 font-medium">Upload Video</h3>
				<Uploader
					id="videoUpload"
					label="Upload Video"
					maxFiles={1}
					allowedTypes={['video/*']}
					customClass="w-full"
					onChange={handleVideoUpload}
				/>
				<p class="text-base-content/70 mt-2 text-sm">Maximum video length: 3 minutes</p>
			</div>

			<!-- TODO:Record Video -->
			<!-- <div class="card bg-base-200 p-4">
				<h3 class="mb-4 font-medium">Record Video</h3>
				<button class="btn btn-primary w-full" onclick={startRecording}> Start Recording </button>
				<p class="text-base-content/70 mt-2 text-sm">
					Recording will automatically stop after 3 minutes
				</p>
			</div> -->
		</div>
	{/if}

	<!-- Error Message -->
	{#if error}
		<div class="alert alert-error">
			<span>{error}</span>
		</div>
	{/if}

	<!-- Submit Button -->
	<div class="flex justify-end">
		<button class="btn btn-primary" onclick={handleSubmit} disabled={isLoading || !videoData}>
			{#if isLoading}
				<span class="loading loading-spinner"></span>
			{/if}
			Save Video Introduction
		</button>
	</div>
</div>

<!-- Success Toast -->
<div id="video-toast-success" class="toast toast-end" style="display: none;">
	<div class="alert alert-success">
		<span>Video introduction updated successfully!</span>
	</div>
</div>
