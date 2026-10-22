import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { scrollAfterNavigation } from '$lib/utils/scroll-on-navigate';

function scroller(top: number, hashInside = false) {
	document.body.innerHTML = hashInside
		? `<div class="app-shell__content" id="scroller"><div id="fees"></div></div>`
		: `<div class="app-shell__content" id="scroller"></div><div id="fees"></div>`;
	const content = document.getElementById('scroller') as HTMLElement;
	const fees = document.getElementById('fees') as HTMLElement;
	let scrollTop = top;
	Object.defineProperty(content, 'scrollTop', {
		configurable: true,
		get: () => scrollTop,
		set: (value: number) => {
			scrollTop = value;
		}
	});
	content.scrollTo = vi.fn();
	fees.scrollIntoView = vi.fn();
	window.scrollTo = vi.fn();
	return { content, fees, readTop: () => scrollTop };
}

describe('scroll after navigation', () => {
	afterEach(() => {
		document.body.innerHTML = '';
	});

	it('scrolls the window and the app shell to the top on a footer link', () => {
		const { content, readTop } = scroller(900);

		scrollAfterNavigation({
			type: 'link',
			to: { url: new URL('https://bittasker.com/about') }
		});

		expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
		expect(content.scrollTo).toHaveBeenCalledWith(0, 0);
		expect(readTop()).toBe(0);
	});

	it('scrolls a second footer-to-footer navigation to the top as well', () => {
		const { readTop } = scroller(640);

		scrollAfterNavigation({
			type: 'link',
			to: { url: new URL('https://bittasker.com/privacy') }
		});
		expect(readTop()).toBe(0);
	});

	it('scrolls the app shell to a hash target inside it', () => {
		const { content, fees, readTop } = scroller(400, true);
		content.getBoundingClientRect = () => ({ top: 64 }) as DOMRect;
		fees.getBoundingClientRect = () => ({ top: 900 }) as DOMRect;

		scrollAfterNavigation({
			type: 'goto',
			to: { url: new URL('https://bittasker.com/faq#fees') }
		});

		expect(fees.scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
		expect(content.scrollTo).toHaveBeenCalledWith(0, 1236);
		expect(readTop()).toBe(1236);
		expect(window.scrollTo).not.toHaveBeenCalled();
	});

	it('scrolls a hash outside the shell into view without jumping the shell to the top', () => {
		const { content, fees, readTop } = scroller(400);

		scrollAfterNavigation({
			type: 'goto',
			to: { url: new URL('https://bittasker.com/faq#fees') }
		});

		expect(fees.scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
		expect(content.scrollTo).not.toHaveBeenCalled();
		expect(readTop()).toBe(400);
	});

	it('falls back to the top when the hash target is missing', () => {
		const { readTop } = scroller(300);

		scrollAfterNavigation({
			type: 'link',
			to: { url: new URL('https://bittasker.com/faq#missing') }
		});

		expect(readTop()).toBe(0);
	});

	it('leaves back and forward scroll restoration alone', () => {
		const { content, readTop } = scroller(720);

		scrollAfterNavigation({
			type: 'popstate',
			to: { url: new URL('https://bittasker.com/terms') }
		});

		expect(window.scrollTo).not.toHaveBeenCalled();
		expect(content.scrollTo).not.toHaveBeenCalled();
		expect(readTop()).toBe(720);
	});

	it('is registered from the root layout', () => {
		const source = readFileSync('src/routes/+layout.svelte', 'utf8');
		expect(source).toContain('afterNavigate');
		expect(source).toContain('scrollAfterNavigation');
	});
});
