export type ScrollNavigation = {
	type: string;
	to?: { url: { hash: string } } | null;
};

/**
 * SvelteKit resets the window. This app scrolls `.app-shell__content`, which
 * stays put across layout-preserving navigations. Back and forward keep the
 * position SvelteKit already restored.
 */
export function scrollAfterNavigation(
	navigation: ScrollNavigation,
	doc: Document = document
): void {
	if (navigation.type === 'popstate') return;

	const hash = navigation.to?.url.hash ?? '';
	if (hash.length > 1) {
		let id = hash.slice(1);
		try {
			id = decodeURIComponent(id);
		} catch {
			// Keep the raw fragment when it is not valid encoding.
		}
		const target = doc.getElementById(id);
		if (target) {
			target.scrollIntoView({ block: 'start' });
			return;
		}
	}

	doc.defaultView?.scrollTo(0, 0);
	doc.documentElement.scrollTop = 0;
	doc.body.scrollTop = 0;
	doc.querySelectorAll('.app-shell__content').forEach((node) => {
		if (!(node instanceof HTMLElement)) return;
		node.scrollTop = 0;
		node.scrollTo?.(0, 0);
	});
}
