import type {
	ReviewChallengeRequest,
	ReviewChallengeResponse,
	ReviewAttestationRequest,
	ReviewAttestationResponse,
	ReviewErrorResponse,
	ReviewIssuerRegistryResponse,
	ReplyChallengeRequest,
	ReplyAttestationRequest
} from '$lib/types/review';

export class ReviewApiError extends Error {
	constructor(
		message: string,
		public readonly code: string,
		public readonly status: number,
		public readonly retryAfterSeconds?: number
	) {
		super(message);
		this.name = 'ReviewApiError';
	}

	get isRetryable(): boolean {
		return this.status === 429 || this.status >= 500;
	}
}

export class ReviewsAttestationClient {
	constructor(private baseUrl: string = '') {}

	private async request<T>(path: string, body: unknown): Promise<T> {
		const url = `${this.baseUrl}${path}`;
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});

		const data = await res.json();

		if (!res.ok || (data as ReviewErrorResponse).status === 'error') {
			const err = data as ReviewErrorResponse;
			throw new ReviewApiError(err.message, err.code, res.status, err.retryAfterSeconds);
		}

		return data as T;
	}

	async getIssuers(): Promise<ReviewIssuerRegistryResponse> {
		const url = `${this.baseUrl}/review-attestation-issuers`;
		const res = await fetch(url);
		const data = await res.json();

		if (!res.ok || (data as ReviewErrorResponse).status === 'error') {
			const err = data as ReviewErrorResponse;
			throw new ReviewApiError(err.message, err.code, res.status, err.retryAfterSeconds);
		}

		return data as ReviewIssuerRegistryResponse;
	}

	async requestChallenge(input: ReviewChallengeRequest): Promise<ReviewChallengeResponse> {
		return this.request<ReviewChallengeResponse>('/review-attestations/challenge', input);
	}

	async submitAttestation(input: ReviewAttestationRequest): Promise<ReviewAttestationResponse> {
		return this.request<ReviewAttestationResponse>('/review-attestations', input);
	}

	async requestReplyChallenge(input: ReplyChallengeRequest): Promise<ReviewChallengeResponse> {
		return this.request<ReviewChallengeResponse>('/review-reply-attestations/challenge', input);
	}

	async submitReplyAttestation(input: ReplyAttestationRequest): Promise<ReviewAttestationResponse> {
		return this.request<ReviewAttestationResponse>('/review-reply-attestations', input);
	}
}

export const reviewsAttestationClient = new ReviewsAttestationClient('');
