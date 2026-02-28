/**
 * Review display utilities
 * Centralized helpers for rating colors and star display (used by review components and profile/bid UIs).
 */

/** CSS class for neutral rating (no reviews or zero). */
const RATING_NEUTRAL = 'text-base-content/60';
/**
 * CSS class for non-neutral ratings.
 * We use the primary Bitcoin orange color instead of green/yellow/red.
 */
const RATING_PRIMARY = 'text-primary';

/**
 * Return the Tailwind class for a numeric rating (e.g. average rating stat).
 * Use neutral when there are no reviews or rating is 0.
 */
export function getRatingColor(rating: number, totalReviews?: number): string {
	if (totalReviews === 0 || rating === 0) return RATING_NEUTRAL;
	// All positive ratings use primary to keep the palette simple and consistent.
	return RATING_PRIMARY;
}

/** Default unfilled star class for display (cards, profile). */
const UNFILLED_DEFAULT = 'text-base-content/30';
/** Unfilled star class for compact/small contexts (e.g. stat desc). */
const UNFILLED_MUTED = 'text-base-content/20';

/**
 * Return the Tailwind class for a single star at 1-based index.
 * Used for both display-only stars and form star indicators.
 * @param starIndex1Based - 1..5
 * @param currentRating - 0..5 (decimal allowed)
 * @param unfilledClass - optional; default 'text-base-content/30', use 'text-base-content/20' for muted
 */
export function getStarClassForIndex(
	starIndex1Based: number,
	currentRating: number,
	unfilledClass: string = UNFILLED_DEFAULT
): string {
	const filled = currentRating >= starIndex1Based;
	// Filled stars use the primary Bitcoin orange color.
	return filled ? 'text-primary fill-primary' : unfilledClass;
}

/**
 * Same as getStarClassForIndex with muted unfilled (e.g. inside stat-desc or form).
 */
export function getStarClassForIndexMuted(
	starIndex1Based: number,
	currentRating: number
): string {
	return getStarClassForIndex(starIndex1Based, currentRating, UNFILLED_MUTED);
}
