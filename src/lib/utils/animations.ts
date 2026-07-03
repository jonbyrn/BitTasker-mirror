import { animate, stagger } from 'motion';

const EASING = {
	standard: [0.2, 0, 0, 1],
	decelerate: [0, 0, 0, 1]
};

function prefersReducedMotion(): boolean {
	if (typeof window === 'undefined') return false;
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function animateDrawerPanelOpen(el: HTMLElement) {
	if (prefersReducedMotion()) return;
	animate(el, { y: ['80%', '0%'] }, {
		type: 'spring',
		stiffness: 400,
		damping: 30,
		mass: 0.8
	} as Parameters<typeof animate>[2]);
}

export function staggerGridItems(container: HTMLElement) {
	if (prefersReducedMotion()) return;
	const items = container.querySelectorAll('.nav-grid-item');
	if (items.length === 0) return;
	animate(items, { scale: [0.9, 1], opacity: [0, 1] }, {
		duration: 0.2,
		delay: stagger(0.03, { startDelay: 0.05 }),
		easing: EASING.decelerate
	} as Parameters<typeof animate>[2]);
}

export function animateIconTap(el: HTMLElement) {
	if (prefersReducedMotion()) return;
	animate(el, { scale: [1, 0.82, 1.06, 1] }, {
		duration: 0.3,
		easing: EASING.standard
	} as Parameters<typeof animate>[2]);
}

export function animatePress(el: HTMLElement) {
	if (prefersReducedMotion()) return;
	animate(el, { scale: [1, 0.94] }, { duration: 0.1, easing: EASING.standard } as Parameters<
		typeof animate
	>[2]);
}

export function animatePressRelease(el: HTMLElement) {
	if (prefersReducedMotion()) return;
	animate(el, { scale: [0.94, 1] }, { duration: 0.2, easing: EASING.decelerate } as Parameters<
		typeof animate
	>[2]);
}

export function animateProfileCards(container: HTMLElement) {
	if (prefersReducedMotion()) return;
	const cards = container.querySelectorAll('.card');
	if (cards.length === 0) return;
	animate(cards, { opacity: [0, 1], y: [20, 0] }, {
		duration: 0.35,
		delay: stagger(0.08),
		easing: EASING.decelerate
	} as Parameters<typeof animate>[2]);
}

export function animateAvatarEntry(el: HTMLElement) {
	if (prefersReducedMotion()) return;
	animate(el, { scale: [0.8, 1], opacity: [0, 1] }, {
		type: 'spring',
		stiffness: 300,
		damping: 20,
		mass: 0.8
	} as Parameters<typeof animate>[2]);
}

export function animateRatingPop(el: HTMLElement) {
	if (prefersReducedMotion()) return;
	animate(el, { scale: [0.5, 1.1, 1] }, { duration: 0.25, easing: EASING.decelerate } as Parameters<
		typeof animate
	>[2]);
}

export function animateSkillsStagger(container: HTMLElement) {
	if (prefersReducedMotion()) return;
	const badges = container.querySelectorAll('.badge');
	if (badges.length === 0) return;
	animate(badges, { opacity: [0, 1], scale: [0.9, 1] }, {
		duration: 0.2,
		delay: stagger(0.03),
		easing: EASING.decelerate
	} as Parameters<typeof animate>[2]);
}

const FOOTER_HIDE_DURATION = 0.22;
const FOOTER_SHOW_DURATION = 0.25;

/**
 * Animate the bottom dock out of view (keyboard opening).
 * Runs on GPU (transform + opacity only). Returns a Promise that resolves
 * when the visual animation completes — caller should then collapse layout.
 */
export function animateFooterHide(dock: HTMLElement): Promise<void> {
	if (prefersReducedMotion()) {
		dock.style.opacity = '0';
		dock.style.transform = 'translateY(100%)';
		return Promise.resolve();
	}
	return animate(dock, { y: '100%', opacity: 0 }, {
		duration: FOOTER_HIDE_DURATION,
		easing: [0.4, 0, 1, 1]
	} as Parameters<typeof animate>[2]).finished;
}

/**
 * Animate the bottom dock into view (keyboard closing).
 * Caller should expand layout BEFORE calling this.
 * Runs on GPU (transform + opacity only).
 */
export function animateFooterShow(dock: HTMLElement): Promise<void> {
	if (prefersReducedMotion()) {
		dock.style.opacity = '1';
		dock.style.transform = 'translateY(0)';
		return Promise.resolve();
	}
	return animate(dock, { y: '0%', opacity: 1 }, {
		duration: FOOTER_SHOW_DURATION,
		easing: [0.2, 0, 0, 1]
	} as Parameters<typeof animate>[2]).finished;
}
