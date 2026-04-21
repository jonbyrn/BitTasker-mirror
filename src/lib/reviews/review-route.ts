import type { ReviewRouteState, ReviewTab } from './contracts';

const VALID_TABS = new Set<ReviewTab>(['pending', 'given', 'received']);
const DEFAULT_REVIEW_TAB: ReviewTab = 'pending';

export function parseReviewRoute(url: URL): ReviewRouteState {
	const tabParam = url.searchParams.get('tab');
	const tab = VALID_TABS.has(tabParam as ReviewTab) ? (tabParam as ReviewTab) : DEFAULT_REVIEW_TAB;

	return {
		tab,
		highlight: url.searchParams.get('highlight') || null,
		replyTo: url.searchParams.get('replyTo') || null
	};
}

export function buildReviewsUrl(baseUrl: URL, state: Partial<ReviewRouteState> = {}): string {
	const url = new URL(baseUrl.toString());
	url.pathname = '/reviews';
	url.search = '';
	url.searchParams.set('tab', state.tab ?? DEFAULT_REVIEW_TAB);

	if (state.highlight) {
		url.searchParams.set('highlight', state.highlight);
	}

	if (state.replyTo) {
		url.searchParams.set('replyTo', state.replyTo);
	}

	return url.toString();
}

export function isReviewTab(value: string | null | undefined): value is ReviewTab {
	return VALID_TABS.has(value as ReviewTab);
}
