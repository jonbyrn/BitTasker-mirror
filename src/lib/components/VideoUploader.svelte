<script lang="ts">
	import { browser } from '$app/environment';
	import { onDestroy, onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { addBreadcrumb } from '@sentry/sveltekit';
	import StreamPlayer from '$lib/components/StreamPlayer.svelte';
	import { TUS_CHUNK_SIZE, TUS_RETRY_DELAYS } from '$lib/utils/videoUpload';
	import { CapacitorNativeHttpStack, captureNativeXHR } from '$lib/utils/native-http-stack';

	// Lightweight Uppy interface — avoids @uppy/core's complex generics.
	interface UppyCallback {
		(...args: unknown[]): void;
	}
	interface UppyInstance {
		use(plugin: unknown, opts: Record<string, unknown>): void;
		on(event: string, cb: UppyCallback): void;
		addFile(file: Record<string, unknown>): void;
		upload(): Promise<unknown>;
		cancelAll(): void;
		pauseAll(): void;
		resumeAll(): void;
		retryAll(): void;
		destroy(): void;
		setFileMeta(fileId: string, meta: Record<string, unknown>): void;
		removeFile(fileId: string): void;
		getFiles(): unknown[];
	}

	interface VideoUploadResult {
		uid: string;
		thumbnailUrl: string;
		hlsUrl: string;
		duration: number;
		size: number;
		filename: string;
	}

	interface Props {
		existingVideoUid?: string;
		existingPoster?: string | null;
		existingStatus?: 'encoding' | 'ready' | 'error';
		videoUrl?: string | null;
		maxFileSize?: number;
		maxDuration?: number;
		allowedTypes?: string[];
		private?: boolean;
		controls?: boolean;
		loop?: boolean;
		autoplay?: boolean;
		muted?: boolean;
		aspectRatio?: string;
		className?: string;
		onUploadComplete?: (result: VideoUploadResult) => void | Promise<void>;
		onReady?: (result: VideoUploadResult) => void;
		onError?: (error: string) => void;
		onRemove?: (uid: string) => void;
		showRemoveButton?: boolean;
		variant?: 'full' | 'compact';
		initialFile?: File;
	}

	let {
		existingVideoUid = '',
		existingPoster = null,
		existingStatus = undefined as 'encoding' | 'ready' | 'error' | undefined,
		videoUrl = null,
		maxFileSize = 100 * 1024 * 1024,
		maxDuration = 180,
		allowedTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v'],
		private: isPrivate = false,
		controls = true,
		loop = false,
		autoplay = false,
		muted = false,
		aspectRatio = 'video',
		className = '',
		onUploadComplete,
		onReady,
		onError,
		onRemove,
		showRemoveButton = true,
		variant = 'full' as 'full' | 'compact',
		initialFile = undefined as File | undefined
	}: Props = $props();

	const isPlaybackMode = $derived(!!existingVideoUid);
	const customerCode = browser ? import.meta.env.VITE_STREAM_CUSTOMER_CODE : '';

	// ── State machine ──
	// Playback mode is determined by isPlaybackMode ($derived from existingVideoUid).
	// mode tracks the upload flow state machine; initial value is always 'dropzone'.
	type Mode = 'dropzone' | 'preview' | 'uploading' | 'finalizing' | 'playing' | 'error';
	let mode = $state<Mode>('dropzone');

	// ── Upload state ──
	let uploadProgress = $state(0);
	let uploadSpeed = $state(0);
	let uploadedBytes = $state(0);
	let totalBytes = $state(0);
	let isPaused = $state(false);
	let selectedFile = $state<File | null>(null);
	let previewUrl = $state<string | null>(null);
	let videoDuration = $state<number | null>(null);
	let uploadError = $state<string | null>(null);

	// ── Finalizing / encoding state ──
	let pollingActive = $state(false);
	let pollAttempt = $state(0);

	// ── Uploaded UID (init from existing prop, then overwritten on new upload) ──
	let uploadedUid = $state(''); // Mutable, set during upload
	const videoUid = $derived(existingVideoUid || uploadedUid); // Reactive read from both sources
	let videoResult = $state<VideoUploadResult | null>(null);

	// Non-reactive locals
	let encodingTimer: ReturnType<typeof setTimeout> | null = null;
	let pollingTimer: ReturnType<typeof setInterval> | null = null;
	let uppyReady = $state(false);
	let uppyPromise: Promise<void> | null = null;
	let uppyInstance: UppyInstance | null = null;
	let uploadStartTime = 0;

	// ── Native upload state (Android/iOS) ──
	let isNativePlatform = $state(false);
	let nativeUploadId: string | null = null;
	let nativeTempFilename: string | null = null;
	let nativeListenerHandle: { remove: () => Promise<void> } | null = null;

	// ── Derived ──
	let timeRemaining = $derived.by(() => {
		if (!uploadSpeed || uploadSpeed === 0 || !totalBytes) return null;
		const remaining = totalBytes - uploadedBytes;
		return Math.ceil(remaining / uploadSpeed);
	});

	let formattedSpeed = $derived.by(() => {
		if (!uploadSpeed) return '';
		if (uploadSpeed >= 1024 * 1024) {
			return `${(uploadSpeed / (1024 * 1024)).toFixed(1)} MB/s`;
		}
		return `${(uploadSpeed / 1024).toFixed(0)} KB/s`;
	});

	let formattedTimeRemaining = $derived.by(() => {
		const seconds = timeRemaining;
		if (seconds === null) return '';
		if (seconds < 60) return `${seconds}s`;
		if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
		return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
	});

	// ── Native upload helpers ──

	/** Convert ArrayBuffer to base64 string without stack-overflow risk (chunked). */
	function arrayBufferToBase64(buffer: ArrayBuffer): string {
		const bytes = new Uint8Array(buffer);
		let binary = '';
		const SLICE = 8192;
		for (let i = 0; i < bytes.byteLength; i += SLICE) {
			binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + SLICE, bytes.byteLength)));
		}
		return btoa(binary);
	}

	/** Delete the temp cache file on native, silently ignoring errors. */
	async function cleanupNativeTempFile(path: string): Promise<void> {
		if (!path) return;
		try {
			const { Filesystem, Directory } = await import('@capacitor/filesystem');
			await Filesystem.deleteFile({ path, directory: Directory.Cache });
		} catch {
			// cleanup errors are non-fatal
		}
		if (nativeTempFilename === path) nativeTempFilename = null;
	}

	/**
	 * Full native upload flow for Android/iOS:
	 * 1. Get a one-time Cloudflare direct-upload URL via CapacitorHttp (bypasses WebView).
	 * 2. Write the File to native Cache in 4 MB chunks (avoids OOM from base64 inflation).
	 * 3. Upload the cached file via @capgo/capacitor-uploader (native networking + progress).
	 * 4. Use CapacitorHttp for encoding status polling (same bypass reason as step 1).
	 */
	async function startNativeUpload(): Promise<void> {
		if (!selectedFile) {
			uploadError = 'No file selected';
			mode = 'error';
			return;
		}

		const file = selectedFile;
		const { CapacitorHttp } = await import('@capacitor/core');

		try {
			// ── Step 1: Get Cloudflare direct-upload URL ──
			const maxDurSecs = videoDuration ? Math.min(Math.ceil(videoDuration * 1.5), 3600) : 600;
			const urlRes = await CapacitorHttp.request({
				url: `${window.location.origin}/api/cloudflare/stream/upload-url`,
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				data: { maxDurationSeconds: maxDurSecs },
				responseType: 'json'
			});

			if (urlRes.status !== 200 || !urlRes.data?.uploadURL) {
				throw new Error(`Failed to get upload URL (${urlRes.status})`);
			}

			const uploadURL: string = urlRes.data.uploadURL;
			const uid: string = urlRes.data.uid;
			uploadedUid = uid;

			addBreadcrumb({
				category: 'stream',
				message: `VideoUploader native: got upload URL uid=${uid}`,
				level: 'info'
			});

			// ── Step 2: Write file to native cache in 4 MB chunks ──
			const { Filesystem, Directory } = await import('@capacitor/filesystem');
			const ext = file.name.split('.').pop() || 'mp4';
			const tmpName = `bittasker_upload_${Date.now()}.${ext}`;
			nativeTempFilename = tmpName;

			const FILE_CHUNK = 4 * 1024 * 1024; // 4 MB → ~5.4 MB base64 peak per chunk
			for (let offset = 0; offset < file.size; offset += FILE_CHUNK) {
				const ab = await file.slice(offset, offset + FILE_CHUNK).arrayBuffer();
				const b64 = arrayBufferToBase64(ab);
				if (offset === 0) {
					await Filesystem.writeFile({
						path: tmpName,
						data: b64,
						directory: Directory.Cache,
						recursive: true
					});
				} else {
					await Filesystem.appendFile({ path: tmpName, data: b64, directory: Directory.Cache });
				}
			}

			const { uri } = await Filesystem.getUri({ path: tmpName, directory: Directory.Cache });

			addBreadcrumb({
				category: 'stream',
				message: `VideoUploader native: cached file at ${uri} (${file.size} bytes)`,
				level: 'info'
			});

			// ── Step 3: Upload via @capgo/capacitor-uploader ──
			const { Uploader } = await import('@capgo/capacitor-uploader');

			let currentUploadId = '';

			const handle = await Uploader.addListener(
				'events',
				(event: {
					name: 'uploading' | 'completed' | 'failed';
					payload: { percent?: number; error?: string; statusCode?: number };
					id: string;
				}) => {
					// Filter events to only our upload once we have an ID.
					if (currentUploadId && event.id !== currentUploadId) return;

					if (event.name === 'uploading') {
						const pct = event.payload?.percent ?? 0;
						uploadProgress = pct;
						uploadedBytes = Math.round((pct / 100) * file.size);
						totalBytes = file.size;
						const elapsed = (Date.now() - uploadStartTime) / 1000;
						uploadSpeed = elapsed > 0.5 ? uploadedBytes / elapsed : 0;
					} else if (event.name === 'completed') {
						handle.remove();
						nativeListenerHandle = null;
						nativeUploadId = null;
						cleanupNativeTempFile(tmpName);

						const result: VideoUploadResult = {
							uid,
							thumbnailUrl: `https://customer-${customerCode}.cloudflarestream.com/${uid}/thumbnails/thumbnail.jpg`,
							hlsUrl: `https://customer-${customerCode}.cloudflarestream.com/${uid}/manifest/video.m3u8`,
							duration: videoDuration || 0,
							size: file.size,
							filename: file.name
						};
						videoResult = result;
						onUploadComplete?.(result);
						mode = 'finalizing';

						addBreadcrumb({
							category: 'stream',
							message: `VideoUploader native: upload completed uid=${uid}`,
							level: 'info'
						});
					} else if (event.name === 'failed') {
						handle.remove();
						nativeListenerHandle = null;
						nativeUploadId = null;
						cleanupNativeTempFile(tmpName);

						uploadError = event.payload?.error || 'Upload failed';
						mode = 'error';
						onError?.($t('common.components.media_uploader.upload_failed') as string);

						addBreadcrumb({
							category: 'stream',
							message: `VideoUploader native: upload failed - ${uploadError}`,
							level: 'error'
						});
					}
				}
			);

			nativeListenerHandle = handle;

			const { id } = await Uploader.startUpload({
				filePath: uri,
				serverUrl: uploadURL,
				method: 'POST',
				uploadType: 'multipart',
				fileField: 'file',
				mimeType: file.type || 'video/mp4',
				headers: {},
				notificationTitle: 'Uploading video…',
				maxRetries: 2
			});

			currentUploadId = id;
			nativeUploadId = id;

			addBreadcrumb({
				category: 'stream',
				message: `VideoUploader native: upload started id=${id}`,
				level: 'info'
			});
		} catch (e) {
			nativeListenerHandle?.remove();
			nativeListenerHandle = null;
			nativeUploadId = null;
			cleanupNativeTempFile(nativeTempFilename || '');

			uploadError = e instanceof Error ? e.message : 'Upload failed';
			mode = 'error';
			onError?.($t('common.components.media_uploader.upload_failed') as string);

			addBreadcrumb({
				category: 'stream',
				message: `VideoUploader native: error - ${uploadError}`,
				level: 'error'
			});
		}
	}

	// ── Initialization ──
	async function initUppy() {
		if (!browser) return;
		try {
			const [{ default: Uppy }, { default: Tus }] = await Promise.all([
				import('@uppy/core'),
				import('@uppy/tus')
			]);

			// On Capacitor native, use a custom HttpStack that routes same-origin
			// requests through CapacitorHttp (bypassing WebViewLocalServer) and
			// cross-origin requests through a saved native XHR (preserving progress).
			let isNative = false;
			try {
				const { Capacitor: cap } = await import('@capacitor/core');
				isNative = cap.isNativePlatform();
			} catch {
				/* web — no Capacitor */
			}
			if (isNative) {
				captureNativeXHR();
			}

			const instance = new Uppy({
				id: 'video-uploader',
				restrictions: {
					maxFileSize,
					maxNumberOfFiles: 1,
					allowedFileTypes: allowedTypes
				},
				autoProceed: false,
				meta: { folder: 'videos-intro' }
			}) as unknown as UppyInstance;

			const tusOpts: Record<string, unknown> = {
				endpoint: '/api/cloudflare/stream/tus',
				retryDelays: TUS_RETRY_DELAYS,
				chunkSize: TUS_CHUNK_SIZE,
				removeFingerprintOnSuccess: true,
				onAfterResponse: (_req: unknown, res: { getHeader: (name: string) => string | null }) => {
					const mediaId = res.getHeader('stream-media-id');
					if (mediaId) {
						uploadedUid = mediaId;
						addBreadcrumb({
							category: 'stream',
							message: `VideoUploader: received media ID - ${mediaId}`,
							level: 'info'
						});
					}
				}
			};

			if (isNative) {
				tusOpts.httpStack = new CapacitorNativeHttpStack();
			}

			instance.use(Tus, tusOpts);

			instance.on('file-added', async (file: unknown) => {
				const f = file as {
					id: string;
					data: File | Blob;
					meta: Record<string, string>;
					name: string;
					type: string;
				};
				uploadError = null;
				const videoFile =
					f.data instanceof File ? f.data : new File([f.data], f.name, { type: f.type });
				if (previewUrl) URL.revokeObjectURL(previewUrl.split('#')[0]);
				// #t=0.001 forces iOS/WKWebView to seek to the first video frame,
				// preventing the common black-screen thumbnail on mobile Safari.
				previewUrl = URL.createObjectURL(videoFile) + '#t=0.001';
				selectedFile = videoFile;
				try {
					const video = document.createElement('video');
					video.preload = 'metadata';
					video.src = previewUrl;
					await new Promise<void>((resolve, reject) => {
						video.onloadedmetadata = () => resolve();
						video.onerror = () => reject(new Error('Failed to load video'));
					});
					videoDuration = video.duration;
					if (videoDuration > maxDuration) {
						uploadError = `Video exceeds ${maxDuration / 60} min limit`;
						instance.removeFile(f.id);
						return;
					}
					instance.setFileMeta(f.id, {
						...f.meta,
						maxDurationSeconds: String(Math.ceil(videoDuration * 1.5))
					});
				} catch {
					uploadError = 'Failed to validate video';
					instance.removeFile(f.id);
					return;
				}
				mode = 'preview';
				if (variant === 'compact') startUpload();
			});
			instance.on(
				'upload-progress',
				(_file: unknown, progress: { bytesTotal: number | null; bytesUploaded: number | null }) => {
					if (progress.bytesTotal && progress.bytesUploaded != null) {
						uploadedBytes = progress.bytesUploaded;
						totalBytes = progress.bytesTotal;
						uploadProgress = Math.round((progress.bytesUploaded / progress.bytesTotal) * 100);
						const elapsed = (Date.now() - uploadStartTime) / 1000;
						uploadSpeed = elapsed > 0 ? progress.bytesUploaded / elapsed : 0;
					}
				}
			);
			instance.on('upload-success', (_file: unknown, _response: unknown) => {
				const uid = videoUid;
				if (!uid) {
					uploadError = 'No video UID returned';
					mode = 'error';
					return;
				}
				const thumbnailUrl = `https://customer-${customerCode}.cloudflarestream.com/${uid}/thumbnails/thumbnail.jpg`;
				const result: VideoUploadResult = {
					uid,
					thumbnailUrl,
					hlsUrl: `https://customer-${customerCode}.cloudflarestream.com/${uid}/manifest/video.m3u8`,
					duration: videoDuration || 0,
					size: selectedFile?.size || 0,
					filename: selectedFile?.name || 'video'
				};
				videoResult = result;
				onUploadComplete?.(result);
				mode = 'finalizing';
			});
			instance.on('upload-error', (_file: unknown, err: Error) => {
				uploadError = (err as Error).message || 'Upload failed';
				mode = 'error';
				// Notify parent so it can remove the grid item and surface a friendly message
				// below the upload grid rather than showing the raw TUS error string inside the cell.
				onError?.($t('common.components.media_uploader.upload_failed') as string);
			});
			instance.on('restriction-failed', (_file: unknown, err: { message: string }) => {
				uploadError = err.message;
			});

			uppyInstance = instance;
		} catch (e) {
			uploadError = `Failed to initialize uploader: ${e instanceof Error ? e.message : 'Unknown error'}`;
			mode = 'error';
		}
	}

	// Lazy init Uppy on first interaction (only when no existing video)
	function ensureUppy(): Promise<void> {
		if (uppyReady) return Promise.resolve();
		if (!uppyPromise) {
			uppyPromise = (async () => {
				await initUppy();
				uppyReady = true;
			})();
		}
		return uppyPromise;
	}

	// ── Upload controls ──
	async function startUpload() {
		uploadStartTime = Date.now();
		mode = 'uploading';

		if (isNativePlatform) {
			await startNativeUpload();
			return;
		}

		if (!uppyInstance) return;
		try {
			await uppyInstance.upload();
		} catch (e) {
			addBreadcrumb({
				category: 'stream',
				message: `VideoUploader: upload failed - ${e}`,
				level: 'error'
			});
		}
	}

	function pauseUpload() {
		uppyInstance?.pauseAll();
		isPaused = true;
	}

	function resumeUpload() {
		uppyInstance?.resumeAll();
		isPaused = false;
	}

	function retryUpload() {
		uploadError = null;
		uppyInstance?.retryAll();
		if (videoUid) {
			mode = 'finalizing';
		} else {
			mode = 'preview';
		}
	}

	async function cancelUpload() {
		if (isNativePlatform && nativeUploadId) {
			try {
				const { Uploader } = await import('@capgo/capacitor-uploader');
				await Uploader.removeUpload({ id: nativeUploadId });
			} catch {
				// ignore cancellation errors
			}
			nativeListenerHandle?.remove();
			nativeListenerHandle = null;
			nativeUploadId = null;
			cleanupNativeTempFile(nativeTempFilename || '');
		} else {
			uppyInstance?.cancelAll();
		}
		resetUploadState();
	}

	function resetUploadState() {
		uploadProgress = 0;
		uploadSpeed = 0;
		uploadedBytes = 0;
		totalBytes = 0;
		isPaused = false;
		uploadError = null;
		selectedFile = null;
		videoDuration = null;
		pollingActive = false;
		pollAttempt = 0;
		if (previewUrl) {
			URL.revokeObjectURL(previewUrl.split('#')[0]);
			previewUrl = null;
		}
		mode = 'dropzone';
	}

	// ── Remove existing video ──
	function handleRemove(uid: string) {
		uploadedUid = '';
		videoResult = null;
		resetUploadState();
		onRemove?.(uid);
	}

	function handleErrorRetry() {
		uploadError = null;
		resetUploadState();
		ensureUppy();
	}

	// ── Encoding polling (use: action) ──
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
		if (pollingActive) return;
		if (!videoUid) return;
		pollingActive = true;
		clearTimers();
		pollAttempt = 0;

		const backoffDelays = [3_000, 6_000, 12_000, 30_000];

		encodingTimer = setTimeout(
			() => {
				addBreadcrumb({
					category: 'stream',
					message: `VideoUploader: encoding timed out for ${videoUid}`,
					level: 'warning'
				});
			},
			30 * 60 * 1000
		);

		async function poll() {
			try {
				let data: { state?: string; errorReason?: string } | null = null;

				if (isNativePlatform) {
					const { CapacitorHttp } = await import('@capacitor/core');
					const r = await CapacitorHttp.request({
						url: `${window.location.origin}/api/cloudflare/stream/status/${encodeURIComponent(videoUid)}`,
						method: 'GET',
						responseType: 'json'
					});
					if (r.status >= 200 && r.status < 300) {
						data = r.data as { state?: string; errorReason?: string };
					}
				} else {
					const res = await fetch(`/api/cloudflare/stream/status/${encodeURIComponent(videoUid)}`);
					if (res.ok) {
						data = (await res.json()) as { state?: string; errorReason?: string };
					}
				}

				if (!data) {
					scheduleNext();
					return;
				}

				if (data.state === 'ready') {
					try {
						const manifestUrl = `https://customer-${customerCode}.cloudflarestream.com/${videoUid}/manifest/video.mpd?parentOrigin=${encodeURIComponent(window.location.origin)}`;
						const manifestRes = await fetch(manifestUrl, { method: 'HEAD' });
						if (manifestRes.ok) {
							pollingActive = false;
							clearTimers();
							addBreadcrumb({
								category: 'stream',
								message: `VideoUploader: encoding complete + manifest confirmed for ${videoUid}`,
								level: 'info'
							});
							mode = 'playing';
							if (videoResult) onReady?.(videoResult);
						} else {
							scheduleNext();
						}
					} catch {
						scheduleNext();
					}
				} else if (data.state === 'error') {
					pollingActive = false;
					clearTimers();
					addBreadcrumb({
						category: 'stream',
						message: `VideoUploader: encoding failed for ${videoUid}`,
						level: 'error'
					});
					uploadError = data.errorReason || 'Video processing failed';
					mode = 'error';
					onError?.(data.errorReason || 'Video processing failed');
				} else {
					scheduleNext();
				}
			} catch {
				scheduleNext();
			}
		}

		function scheduleNext() {
			const delay = backoffDelays[Math.min(pollAttempt, backoffDelays.length - 1)];
			pollAttempt++;
			pollingTimer = setTimeout(poll, delay);
		}

		poll();
	}

	// ── Svelte action: encoding poll + network listener ──
	function encodingPollAction(_node: HTMLElement) {
		startEncodingPoll();

		const handleOnline = () => {
			clearTimers();
			startEncodingPoll();
		};
		window.addEventListener('online', handleOnline);

		return {
			destroy() {
				clearTimers();
				window.removeEventListener('online', handleOnline);
				pollingActive = false;
			}
		};
	}

	// ── Svelte action: dropzone drag-and-drop + lazy Uppy init ──
	function dropzoneAction(node: HTMLElement) {
		ensureUppy();
		function onDragOver(e: DragEvent) {
			e.preventDefault();
			node.classList.add('border-primary', 'bg-primary/5');
		}
		function onDragLeave() {
			node.classList.remove('border-primary', 'bg-primary/5');
		}
		async function onDrop(e: DragEvent) {
			e.preventDefault();
			node.classList.remove('border-primary', 'bg-primary/5');
			await ensureUppy();
			const file = e.dataTransfer?.files?.[0];
			if (file && uppyInstance) {
				try {
					uppyInstance.addFile({
						name: file.name,
						type: file.type,
						data: file,
						source: 'Local',
						isRemote: false
					});
				} catch {
					/* restriction failed handled by Uppy event */
				}
			}
		}
		node.addEventListener('dragover', onDragOver);
		node.addEventListener('dragleave', onDragLeave);
		node.addEventListener('drop', onDrop);
		return {
			destroy() {
				node.removeEventListener('dragover', onDragOver);
				node.removeEventListener('dragleave', onDragLeave);
				node.removeEventListener('drop', onDrop);
			}
		};
	}

	// Auto-add initialFile in compact mode when provided by parent
	onMount(async () => {
		// Detect native platform first so all subsequent branches work correctly.
		try {
			const { Capacitor: cap } = await import('@capacitor/core');
			isNativePlatform = cap.isNativePlatform();
		} catch {
			/* web — no Capacitor */
		}

		if (initialFile) {
			await ensureUppy();
			if (uppyInstance && initialFile) {
				try {
					uppyInstance.addFile({
						name: initialFile.name,
						type: initialFile.type,
						data: initialFile,
						source: 'Local',
						isRemote: false
					});
				} catch {
					/* restriction failed handled by Uppy event */
				}
			}
		}
	});

	// ── Cleanup ──
	onDestroy(() => {
		clearTimers();
		pollingActive = false;
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		if (uppyInstance) {
			try {
				uppyInstance.destroy();
			} catch {
				/* ignore */
			}
		}
		// Native: remove event listener and cancel any in-progress upload.
		if (nativeListenerHandle) {
			nativeListenerHandle.remove().catch(() => {});
			nativeListenerHandle = null;
		}
		if (nativeUploadId) {
			import('@capgo/capacitor-uploader')
				.then(({ Uploader }) => Uploader.removeUpload({ id: nativeUploadId! }))
				.catch(() => {});
			nativeUploadId = null;
		}
		if (nativeTempFilename) {
			cleanupNativeTempFile(nativeTempFilename);
		}
	});

	// ── File input handler (lazy init Uppy) ──
	async function handleFileInput(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		await ensureUppy();
		if (!uppyInstance) return;
		try {
			uppyInstance.addFile({
				name: file.name,
				type: file.type,
				data: file,
				source: 'Local',
				isRemote: false
			});
		} catch {
			/* restriction failed */
		}
	}
</script>

<div class="video-uploader h-full {className}">
	{#if variant === 'full' && ((isPlaybackMode && mode !== 'finalizing') || mode === 'playing') && videoUid}
		<StreamPlayer
			{videoUid}
			poster={videoResult?.thumbnailUrl ?? existingPoster}
			{videoUrl}
			status={existingStatus ?? 'ready'}
			{controls}
			{loop}
			{autoplay}
			{muted}
			private={isPrivate}
			{aspectRatio}
			onerror={(msg) => {
				uploadError = msg;
				mode = 'error';
				onError?.(msg);
			}}
			onready={() => {
				mode = 'playing';
			}}
		/>
		{#if showRemoveButton}
			<button
				type="button"
				class="btn btn-error btn-block mt-2"
				onclick={() => handleRemove(videoUid)}
				aria-label={$t('common.components.media_uploader.remove_file')}
			>
				{$t('common.components.media_uploader.remove_file')}
			</button>
		{/if}
	{:else if mode === 'error'}
		<div
			class="bg-base-200 flex h-full flex-col items-center justify-center p-4 text-center"
			role="alert"
		>
			<p class="text-error mb-2 text-sm">
				{variant === 'compact'
					? $t('common.components.media_uploader.upload_failed')
					: uploadError || $t('common.stream_player.status.error')}
			</p>
			<button
				type="button"
				class="btn btn-sm btn-outline"
				onclick={handleErrorRetry}
				aria-label={$t('common.stream_player.action.retry')}
			>
				{$t('common.stream_player.action.retry')}
			</button>
		</div>
	{:else if variant === 'compact'}
		<!-- Compact mode: hidden input, no dropzone, progress overlay only -->
		<input
			type="file"
			class="hidden"
			accept={allowedTypes.join(',')}
			onchange={handleFileInput}
			id="video-uploader-input"
		/>
		<label
			for="video-uploader-input"
			class="block h-full w-full cursor-pointer"
			aria-label="Upload video"
		>
			{#if mode === 'dropzone'}
				<div
					class="border-base-300 hover:bg-base-300 flex h-full w-full cursor-pointer items-center justify-center rounded-lg border-2 border-dashed p-2 transition-colors"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="text-base-content/50 h-6 w-6"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
					</svg>
				</div>
			{:else if mode === 'preview' || mode === 'uploading' || mode === 'finalizing'}
				<div class="relative h-full w-full">
					{#if previewUrl}
						<video src={previewUrl} class="h-full w-full rounded-lg object-cover" muted playsinline>
							<track kind="captions" />
						</video>
					{/if}
					{#if mode === 'uploading'}
						<div class="absolute inset-0 flex items-center justify-center rounded-lg bg-black/60">
							<div
								class="radial-progress text-primary"
								style="--value:{uploadProgress}; --size:2.5rem; --thickness:3px;"
								role="progressbar"
								aria-valuenow={uploadProgress}
								aria-valuemin={0}
								aria-valuemax={100}
							>
								{uploadProgress}%
							</div>
						</div>
					{:else if mode === 'finalizing'}
						<div class="absolute inset-0 flex items-center justify-center rounded-lg bg-black/20">
							<span class="loading loading-spinner loading-sm text-primary"></span>
						</div>
					{/if}
				</div>
			{:else if mode === 'playing'}
				<div
					class="border-success/50 flex h-full w-full items-center justify-center rounded-lg border-2 border-dashed p-2"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="text-success h-6 w-6"
						viewBox="0 0 20 20"
						fill="currentColor"
					>
						<path
							fill-rule="evenodd"
							d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
							clip-rule="evenodd"
						/>
					</svg>
				</div>
			{/if}
		</label>
	{:else if mode === 'dropzone'}
		<div
			class="bg-base-200 hover:bg-base-300 border-primary/30 hover:border-primary/60 flex h-full w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors"
			use:dropzoneAction
		>
			<input
				type="file"
				class="hidden"
				accept={allowedTypes.join(',')}
				onchange={handleFileInput}
				id="video-uploader-input"
			/>
			<label for="video-uploader-input" class="flex cursor-pointer flex-col items-center">
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
					{$t('common.components.media_uploader.upload_title')}
				</p>
				<p class="text-base-content/60 text-center text-sm">
					{$t('common.components.media_uploader.drag_or_click')}
				</p>
				<p class="text-base-content/40 mt-2 text-center text-xs">
					MP4, WebM, MOV &bull; {maxFileSize / (1024 * 1024)}MB max &bull; {maxDuration / 60}min
				</p>
			</label>
		</div>
	{:else if mode === 'preview' || mode === 'uploading' || mode === 'finalizing'}
		<div class="relative h-full w-full">
			{#if previewUrl}
				<video
					src={previewUrl}
					class="h-full w-full object-cover"
					muted
					playsinline
					aria-label="Video preview"
				>
					<track kind="captions" />
				</video>
			{/if}

			{#if mode === 'uploading'}
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
								? $t('common.stream_player.status.paused')
								: $t('common.stream_player.status.uploading', {
										values: { progress: uploadProgress }
									})}
						</p>
						{#if formattedSpeed && !isPaused}
							<p class="text-xs opacity-80">
								{formattedSpeed}
								{#if formattedTimeRemaining}
									&bull; {formattedTimeRemaining} remaining
								{/if}
							</p>
						{/if}
					</div>
				</div>
			{:else if mode === 'finalizing'}
				<div class="absolute inset-0 flex items-center justify-center bg-black/20">
					<span class="loading loading-spinner loading-md text-primary"></span>
				</div>
			{/if}
		</div>

		<!-- Action buttons (below the preview) -->
		{#if mode === 'preview' || mode === 'uploading'}
			<div class="mt-3 flex flex-wrap gap-2">
				{#if uploadError}
					<button type="button" class="btn btn-primary btn-sm flex-1" onclick={retryUpload}>
						{$t('common.stream_player.action.retry')}
					</button>
				{:else if mode === 'uploading'}
					{#if !isNativePlatform}
						{#if isPaused}
							<button type="button" class="btn btn-primary btn-sm flex-1" onclick={resumeUpload}>
								{$t('common.stream_player.action.resume')}
							</button>
						{:else}
							<button type="button" class="btn btn-secondary btn-sm flex-1" onclick={pauseUpload}>
								{$t('common.stream_player.action.pause')}
							</button>
						{/if}
					{/if}
				{:else}
					<button type="button" class="btn btn-primary btn-sm flex-1" onclick={startUpload}>
						{$t('common.buttons.upload')}
					</button>
				{/if}
				<button type="button" class="btn btn-ghost btn-sm flex-1" onclick={cancelUpload}>
					{$t('common.buttons.cancel')}
				</button>
			</div>

			{#if uploadError}
				<div class="alert alert-error alert-sm mt-3">
					<span>{uploadError}</span>
				</div>
			{/if}
		{/if}
	{/if}
</div>

<!-- Lifecycle driver: encoding poll action (only when finalizing) -->
{#if mode === 'finalizing' && browser && videoUid}
	<div style="display:none" aria-hidden="true" use:encodingPollAction></div>
{/if}

<style>
	.radial-progress {
		--value: 0;
		--size: 4rem;
		--thickness: 4px;
	}
</style>
