import type { ReviewBilingualContent, ReviewLocale } from '$lib/reviews';
import { normalizeReviewText } from '$lib/reviews';

export interface ReviewTranslationRequest {
	sourceLanguage: ReviewLocale;
	title?: string;
	comment: string;
}

export interface ReviewTranslationResponse extends ReviewBilingualContent {
	translationMode: 'backend' | 'fallback';
}

function getTranslationApiBaseUrl(): string | null {
	const configured = import.meta.env.VITE_REVIEW_TRANSLATION_API_URL;
	return typeof configured === 'string' && configured.trim().length > 0 ? configured.trim() : null;
}

function buildFallbackTranslation(request: ReviewTranslationRequest): ReviewTranslationResponse {
	const title = normalizeReviewText(request.title ?? '');
	const comment = normalizeReviewText(request.comment);
	const translatedTitle = title ? `${title}` : '';

	if (request.sourceLanguage === 'en') {
		return {
			sourceLanguage: 'en',
			en: {
				title: title || undefined,
				comment
			},
			es: {
				title: translatedTitle || undefined,
				comment
			},
			translationMode: 'fallback'
		};
	}

	return {
		sourceLanguage: 'es',
		en: {
			title: translatedTitle || undefined,
			comment
		},
		es: {
			title: title || undefined,
			comment
		},
		translationMode: 'fallback'
	};
}

export async function translateReviewDraft(
	request: ReviewTranslationRequest
): Promise<ReviewTranslationResponse> {
	const baseUrl = getTranslationApiBaseUrl();

	if (!baseUrl) {
		return buildFallbackTranslation(request);
	}

	const response = await fetch(`${baseUrl.replace(/\/$/, '')}/review-translations`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(request)
	});

	if (!response.ok) {
		throw new Error(`Translation backend request failed with ${response.status}`);
	}

	const payload = (await response.json()) as ReviewTranslationResponse;
	return {
		...payload,
		sourceLanguage: payload.sourceLanguage,
		translationMode: 'backend'
	};
}
