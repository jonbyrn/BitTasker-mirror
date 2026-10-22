import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resetInnerScroll } from '$lib/utils/helpers/appShellScroll';

function shell(doc: Document, scrollTop: number): HTMLElement {
	doc.body.innerHTML = `
		<div class="app-shell__content" style="overflow:auto;height:100px">
			<div id="top">top</div>
			<div id="fees" style="margin-top:800px">fees</div>
		</div>
	`;
	const container = doc.querySelector('.app-shell__content');
	if (!(container instanceof HTMLElement)) throw new Error('missing scroll container');
	container.scrollTop = scrollTop;
	return container;
}

describe('resetInnerScroll', () => {
	it('returns the inner scroll container to the top', () => {
		const container = shell(document, 640);
		expect(container.scrollTop).toBe(640);

		resetInnerScroll(new URL('https://bittasker.com/about'), document);

		expect(container.scrollTop).toBe(0);
	});

	it('scrolls the inner container to the hash target', () => {
		const container = shell(document, 640);
		const target = document.getElementById('fees');
		if (!(target instanceof HTMLElement)) throw new Error('missing hash target');
		target.getBoundingClientRect = () =>
			({ top: 900, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 900, toJSON() {} }) as DOMRect;
		container.getBoundingClientRect = () =>
			({ top: 40, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 40, toJSON() {} }) as DOMRect;

		resetInnerScroll(new URL('https://bittasker.com/tasker-fees#fees'), document);

		expect(container.scrollTop).toBe(640 + 900 - 40);
	});

	it('scrolls to the top when the hash target is missing', () => {
		const container = shell(document, 480);

		resetInnerScroll(new URL('https://bittasker.com/faq#missing'), document);

		expect(container.scrollTop).toBe(0);
	});
});

describe('footer and CTA heading font', () => {
	const root = resolve(process.cwd());

	it('uses Poppins for footer and CTA headings', () => {
		const css = readFileSync(resolve(root, 'src/app.css'), 'utf8');
		const footer = readFileSync(resolve(root, 'src/lib/components/BitTaskerFooter.svelte'), 'utf8');
		const layout = readFileSync(resolve(root, 'src/routes/(company)/+layout.svelte'), 'utf8');

		expect(css).toMatch(/body h[1-6]\.font-poppins[\s\S]*font-family:\s*'Poppins'/);
		expect(footer.match(/<h4 class="[^"]*font-poppins/g)?.length).toBe(4);
		expect(layout).toContain('<h2 class="text-4xl font-bold font-poppins">');
	});
});
