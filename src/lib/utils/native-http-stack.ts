/**
 * Custom tus-js-client HttpStack that routes same-origin requests through
 * CapacitorHttp (bypassing WebViewLocalServer interception) and cross-origin
 * requests through a saved native XHR reference (preserving upload progress).
 *
 * Without this, Capacitor apps with a virtual hostname (server.hostname) never
 * reach the Cloudflare Worker for /api/cloudflare/stream/tus — the WebView's
 * shouldInterceptRequest hijacks the request and serves index.html instead.
 */
import { CapacitorHttp } from '@capacitor/core';
import { browser as isBrowser } from '$app/environment';

// ---------------------------------------------------------------------------
// TypeScript interfaces matching tus-js-client's HttpStack contract
// ---------------------------------------------------------------------------

export interface HttpStackRequest {
	getMethod(): string;
	getURL(): string;
	setHeader(header: string, value: string): void;
	getHeader(header: string): string | undefined;
	setProgressHandler(handler: ((bytesSent: number) => void) | null): void;
	send(body?: Uint8Array | null): Promise<HttpStackResponse>;
	abort(): Promise<void>;
	getUnderlyingObject(): NativeXhrLike;
}

export interface HttpStackResponse {
	getStatus(): number;
	getHeader(header: string): string | undefined;
	getBody(): string;
	getUnderlyingObject(): NativeXhrLike;
}

/** Minimal XHR shape that tus-js-client reads via getUnderlyingObject() */
export interface NativeXhrLike {
	readyState: number;
	status: number;
	responseText: string;
	onreadystatechange: ((this: XMLHttpRequest, ev: Event) => unknown) | null;
	getResponseHeader(name: string): string | null;
	abort(): void;
}

// ---------------------------------------------------------------------------
// Snapshot of the REAL native XMLHttpRequest before CapacitorHttp patches it
// ---------------------------------------------------------------------------

let NativeXMLHttpRequest: typeof XMLHttpRequest | null = null;

export function captureNativeXHR(): void {
	if (!isBrowser) return;
	if (NativeXMLHttpRequest) return;
	NativeXMLHttpRequest = window.XMLHttpRequest;
}

// ---------------------------------------------------------------------------
// Same-origin detection
// ---------------------------------------------------------------------------

function isSameOrigin(url: string): boolean {
	// Relative URLs are always same-origin
	if (url.startsWith('/')) return true;
	if (!isBrowser) return false;
	const origin = window.location.origin;
	return url.startsWith(origin);
}

// ---------------------------------------------------------------------------
// HttpStack implementation
// ---------------------------------------------------------------------------

class CapacitorNativeHttpRequest implements HttpStackRequest {
	private _method: string;
	private _url: string;
	private _headers: Record<string, string> = {};
	private _progressHandler: ((bytesSent: number) => void) | null = null;
	private _aborted = false;

	// The fake XHR object tus-js-client reads via getUnderlyingObject()
	private _xhr: NativeXhrLike & { _capResponse?: CapacitorHttpResponse };

	constructor(method: string, url: string) {
		this._method = method;
		this._url = url;
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const request = this;
		this._xhr = {
			readyState: 0,
			status: 0,
			responseText: '',
			onreadystatechange: null,
			_capResponse: undefined,
			getResponseHeader(name: string): string | null {
				const resp = request._xhr._capResponse;
				if (!resp?.headers) return null;
				// Case-insensitive header lookup
				const lower = name.toLowerCase();
				for (const key of Object.keys(resp.headers)) {
					if (key.toLowerCase() === lower) return resp.headers[key];
				}
				return null;
			},
			abort(): void {
				request._aborted = true;
			}
		};
	}

	getMethod(): string {
		return this._method;
	}

	getURL(): string {
		return this._url;
	}

	setHeader(header: string, value: string): void {
		this._headers[header] = value;
	}

	getHeader(header: string): string | undefined {
		return this._headers[header];
	}

	setProgressHandler(handler: ((bytesSent: number) => void) | null): void {
		this._progressHandler = handler;
	}

	async send(body?: Uint8Array | null): Promise<HttpStackResponse> {
		if (this._aborted) {
			return createEmptyResponse(this._xhr);
		}

		const sameOrigin = isSameOrigin(this._url);

		if (sameOrigin) {
			return this._sendViaCapacitorHttp(body);
		}
		return this._sendViaNativeXHR(body);
	}

	async abort(): Promise<void> {
		this._aborted = true;
		this._xhr.abort();
	}

	getUnderlyingObject(): NativeXhrLike {
		return this._xhr;
	}

	// --- CapacitorHttp path (same-origin — bypasses WebView interception) ---

	private async _sendViaCapacitorHttp(body?: Uint8Array | null): Promise<HttpStackResponse> {
		// Simulate XHR state transitions
		this._xhr.readyState = 2; // HEADERS_RECEIVED
		this._xhr.onreadystatechange?.call(
			this._xhr as unknown as XMLHttpRequest,
			new Event('readystatechange')
		);

		// CapacitorHttp native layer requires absolute URLs — resolve relative paths
		const absoluteUrl =
			this._url.startsWith('/') && isBrowser ? window.location.origin + this._url : this._url;

		try {
			const capOpts: {
				url: string;
				method: string;
				headers: Record<string, string>;
				data?: string;
				responseType: 'text';
			} = {
				url: absoluteUrl,
				method: this._method,
				headers: { ...this._headers },
				responseType: 'text'
			};

			if (body && body.length > 0 && this._method !== 'GET' && this._method !== 'HEAD') {
				// Convert Uint8Array to base64 for CapacitorHttp
				capOpts.data = uint8ArrayToBase64(body);
				this._headers['Content-Type'] =
					this._headers['Content-Type'] || 'application/offset+octet-stream';
				capOpts.headers = { ...this._headers };
			}

			const response = await CapacitorHttp.request(capOpts);

			this._xhr.status = response.status;
			this._xhr.responseText =
				typeof response.data === 'string' ? response.data : JSON.stringify(response.data ?? '');
			(this._xhr as unknown as Record<string, unknown>)._capResponse = response;

			// Simulate XHR completion
			this._xhr.readyState = 4; // DONE
			this._xhr.onreadystatechange?.call(
				this._xhr as unknown as XMLHttpRequest,
				new Event('readystatechange')
			);

			// Fire progress (100% complete)
			this._progressHandler?.(body?.length ?? 0);

			return createResponse(this._xhr);
		} catch (err) {
			this._xhr.status = 0;
			this._xhr.readyState = 4;
			throw err;
		}
	}

	// --- Native XHR path (cross-origin — preserves upload progress) ---

	private _sendViaNativeXHR(body?: Uint8Array | null): Promise<HttpStackResponse> {
		return new Promise((resolve, reject) => {
			if (!NativeXMLHttpRequest) {
				reject(new Error('NativeXMLHttpRequest not captured — call captureNativeXHR() first'));
				return;
			}

			const xhr = new NativeXMLHttpRequest();
			this._xhr.readyState = 0;

			xhr.open(this._method, this._url, true);

			// Apply stored headers
			for (const [key, value] of Object.entries(this._headers)) {
				xhr.setRequestHeader(key, value);
			}

			// Wire progress
			if (this._progressHandler && 'upload' in xhr) {
				xhr.upload.onprogress = (e: ProgressEvent) => {
					if (e.lengthComputable) {
						this._progressHandler?.(e.loaded);
					}
				};
			}

			// Wire state changes
			xhr.onreadystatechange = () => {
				this._xhr.readyState = xhr.readyState;
				this._xhr.status = xhr.status;
				this._xhr.responseText = xhr.responseText;

				if (xhr.readyState === 4) {
					if (xhr.status >= 200 && xhr.status < 300) {
						resolve(new NativeXhrResponse(xhr));
					} else {
						reject(new Error(`Upload failed with status ${xhr.status}`));
					}
				}
			};

			xhr.onerror = () => {
				this._xhr.readyState = 4;
				this._xhr.status = 0;
				reject(new Error('Network error during upload'));
			};

			xhr.send((body as unknown as XMLHttpRequestBodyInit) ?? null);
		});
	}
}

/** HttpStack entry point — matches tus-js-client's expected constructor shape */
export class CapacitorNativeHttpStack {
	createRequest(method: string, url: string): HttpStackRequest {
		return new CapacitorNativeHttpRequest(method, url);
	}
	getName(): string {
		return 'CapacitorNativeHttpStack';
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createResponse(xhr: NativeXhrLike): HttpStackResponse {
	return new NativeXhrResponse(xhr);
}

function createEmptyResponse(xhr: NativeXhrLike): HttpStackResponse {
	return new NativeXhrResponse(xhr);
}

class NativeXhrResponse implements HttpStackResponse {
	private _xhr: NativeXhrLike;
	constructor(xhr: NativeXhrLike) {
		this._xhr = xhr;
	}
	getStatus(): number {
		return this._xhr.status;
	}
	getHeader(header: string): string | undefined {
		return this._xhr.getResponseHeader(header) ?? undefined;
	}
	getBody(): string {
		return this._xhr.responseText || '';
	}
	getUnderlyingObject(): NativeXhrLike {
		return this._xhr;
	}
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
	let binary = '';
	const len = bytes.byteLength;
	for (let i = 0; i < len; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

// Re-export CapacitorHttp response type used internally
type CapacitorHttpResponse = Awaited<ReturnType<typeof CapacitorHttp.request>>;
