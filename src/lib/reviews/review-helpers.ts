import { bytesToHex } from '@noble/hashes/utils';
import { sha256 } from '@noble/hashes/sha256';
import type {
	ReviewAttachment,
	ReviewBilingualContent,
	ReviewLocale,
	ReviewLocalizedText
} from './contracts';

function normalizeString(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}

function canonicalize(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map((entry) => canonicalize(entry));
	}

	if (value && typeof value === 'object') {
		const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
			left.localeCompare(right)
		);
		return entries.reduce<Record<string, unknown>>((acc, [key, entry]) => {
			acc[key] = canonicalize(entry);
			return acc;
		}, {});
	}

	return value;
}

export function canonicalJSONStringify(value: unknown): string {
	return JSON.stringify(canonicalize(value));
}

export function buildReviewDraftHash(payload: unknown): string {
	return bytesToHex(sha256(new TextEncoder().encode(canonicalJSONStringify(payload))));
}

export function normalizeReviewText(value: string | undefined | null): string {
	return value ? normalizeString(value) : '';
}

export function selectReviewLocaleContent(
	content: ReviewBilingualContent,
	locale: string | null | undefined
): ReviewLocalizedText {
	return locale === 'es' ? content.es : content.en;
}

export function getTranslatedLocale(sourceLanguage: ReviewLocale): ReviewLocale {
	return sourceLanguage === 'en' ? 'es' : 'en';
}

export function createAttachment(
	url: string,
	type: 'image' | 'video',
	alt: string,
	size: number,
	width?: number,
	height?: number,
	mimeType?: string
): ReviewAttachment {
	return {
		url,
		type,
		alt,
		size,
		width,
		height,
		mimeType
	};
}

export function ensureReviewTitle(title: string | undefined | null): string {
	return normalizeReviewText(title) || '';
}
