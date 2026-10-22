import { categoryById } from '../search/taxonomy.js';

const PRICE_MIN = 1;
const PRICE_MAX = 5000;
const FALLBACK_LOW = 15;

/**
 * @param {unknown} raw
 */
export function extractJson(raw) {
	const text = String(raw ?? '');
	const start = text.indexOf('{');
	const end = text.lastIndexOf('}');
	if (start < 0 || end <= start) return null;
	try {
		return JSON.parse(text.slice(start, end + 1));
	} catch {
		return null;
	}
}

/**
 * @param {unknown} value
 * @param {number} max
 */
function cleanText(value, max) {
	return String(value ?? '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, max);
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function numberOrNull(value) {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value !== 'string') return null;
	const parsed = Number(value.replace(/[^0-9.]/g, ''));
	return Number.isFinite(parsed) ? parsed : null;
}

/**
 * @param {number | null} value
 */
function absurdPrice(value) {
	return value == null || value < PRICE_MIN || value > PRICE_MAX;
}

/**
 * @param {unknown} raw
 */
export function parseDraft(raw) {
	const data = extractJson(raw);
	const category = categoryById(String(data?.categoryId || '').trim());
	const allowed = category && category.id !== 'temp-staff' ? category : null;
	const fallbackLow = allowed?.fromPrice ?? FALLBACK_LOW;
	const fallbackHigh = Math.min(PRICE_MAX, Math.max(fallbackLow, fallbackLow * 3));
	let low = numberOrNull(data?.priceLow);
	let high = numberOrNull(data?.priceHigh);
	if (absurdPrice(low) || absurdPrice(high)) {
		low = fallbackLow;
		high = fallbackHigh;
	}
	low = Math.min(PRICE_MAX, Math.max(PRICE_MIN, Math.round(low)));
	high = Math.min(PRICE_MAX, Math.max(PRICE_MIN, Math.round(high)));
	if (high < low) {
		const swap = low;
		low = high;
		high = swap;
	}
	return {
		title: cleanText(data?.title, 80),
		description: cleanText(data?.description, 1200),
		categoryId: allowed?.id || '',
		priceLow: low,
		priceHigh: high,
		priceUnit: allowed?.priceUnit === 'hour' ? 'hour' : 'project'
	};
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function parseCategory(raw) {
	const data = extractJson(raw);
	const category = categoryById(String(data?.categoryId || '').trim());
	if (!category || category.id === 'temp-staff') return '';
	return category.id;
}
