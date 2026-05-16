/** Types for Cloudflare Stream video integration */

export interface DirectCreatorUploadResponse {
	uploadURL: string;
	uid: string;
}

export interface ImagesUploadUrlResponse {
	uploadURL: string;
	id: string;
}

export interface StreamSignedTokenResponse {
	token: string;
	expiresAt: number;
}

export interface StreamApiError {
	error: {
		code: string;
		message: string;
	};
}

export type StreamPlayerStatus =
	| 'uploading'
	| 'encoding'
	| 'queued'
	| 'private-token-loading'
	| 'poster-loading'
	| 'ready'
	| 'error'
	| 'expired'
	| 'offline';

export interface StreamPlayerProps {
	videoUid: string;
	poster?: string | null;
	autoplay?: boolean;
	muted?: boolean;
	controls?: boolean;
	loop?: boolean;
	playsinline?: boolean;
	preload?: 'none' | 'metadata' | 'auto';
	private?: boolean;
	status: StreamPlayerStatus;
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

export interface StreamStatusResponse {
	uid: string;
	state: 'pendingupload' | 'queued' | 'inprogress' | 'ready' | 'error';
	pctComplete?: number;
	errorReason?: string;
}
