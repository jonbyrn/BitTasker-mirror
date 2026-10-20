const PULL_THRESHOLD = 64;
const SCROLL_SLOP = 8;

/** A downward pull at the top of the page refreshes. A short tug or a scrolled page does not. */
export function pullShouldRefresh(input: {
	startY: number;
	currentY: number;
	scrollY: number;
}): boolean {
	if (input.scrollY > SCROLL_SLOP) return false;
	return input.currentY - input.startY >= PULL_THRESHOLD;
}
