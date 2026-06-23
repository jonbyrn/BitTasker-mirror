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
