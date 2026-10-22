/**
 * The app shell scrolls inside `.app-shell__content`. `window.scrollY` stays 0,
 * so a new page keeps the previous page's scrollTop unless this runs.
 */
export function resetInnerScroll(url: Pick<URL, 'hash'>, doc: Document = document): void {
	const container = doc.querySelector('.app-shell__content');
	if (!(container instanceof HTMLElement)) return;

	const hash = url.hash;
	if (hash.length > 1) {
		let id = hash.slice(1);
		try {
			id = decodeURIComponent(id);
		} catch {
			// Keep the raw fragment when it is not valid percent-encoding.
		}
		const target = doc.getElementById(id);
		if (target instanceof HTMLElement && container.contains(target)) {
			const top =
				target.getBoundingClientRect().top -
				container.getBoundingClientRect().top +
				container.scrollTop;
			scrollContainerTo(container, Math.max(0, top));
			return;
		}
	}

	scrollContainerTo(container, 0);
}

function scrollContainerTo(container: HTMLElement, top: number): void {
	if (typeof container.scrollTo === 'function') {
		container.scrollTo({ top, left: 0, behavior: 'auto' });
	}
	container.scrollTop = top;
}
