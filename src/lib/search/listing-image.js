/**
 * First real photo on a listing. Videos and non-http URLs are skipped.
 * @param {unknown} items
 */
export function listingImage(items) {
	if (!Array.isArray(items)) return '';
	for (const item of items) {
		if (!item || typeof item !== 'object') continue;
		const record = /** @type {Record<string, unknown>} */ (item);
		const url = typeof record.url === 'string' ? record.url.trim() : '';
		if (!/^https?:\/\//i.test(url)) continue;
		if (/\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(url)) continue;
		const kind = typeof record.type === 'string' ? record.type : '';
		if (/\.(jpe?g|png|gif|webp|avif)(\?|#|$)/i.test(url) || /^image\//i.test(kind)) return url;
	}
	return '';
}
