import { tick } from 'svelte';

const portal_map = new Map<string, HTMLElement>();

export function createPortal(node: HTMLElement, id = 'default') {
	const key = `$$portal.${id}`;
	if (portal_map.has(key)) throw `duplicate portal key "${id}"`;
	portal_map.set(key, node);
	return { destroy: portal_map.delete.bind(portal_map, key) };
}

function mount(node: HTMLElement, key: string) {
	if (!portal_map.has(key)) throw `unknown portal ${key}`;
	const host = portal_map.get(key)!;
	host.insertBefore(node, null);
	return () => host.contains(node) && host.removeChild(node);
}

export function portal(node: HTMLElement, id = 'default') {
	let destroy: (() => void) | undefined;
	const key = `$$portal.${id}`;
	if (!portal_map.has(key)) {
		tick().then(() => {
			destroy = mount(node, key);
		});
	} else {
		destroy = mount(node, key);
	}
	return { destroy: () => destroy?.() };
}

/**
 * Svelte action that teleports a DOM node to `#portal-root` (the global overlay
 * container in the root layout). This escapes any ancestor with overflow:hidden,
 * overflow-x:hidden, or transform that would otherwise break fixed positioning.
 *
 * Usage:  <div use:teleport> ... </div>
 */
export function teleport(node: HTMLElement) {
	const host = document.getElementById('portal-root');
	if (!host) {
		// portal-root not yet in DOM (SSR or very early render) — no-op
		return {};
	}
	host.appendChild(node);
	return {
		destroy() {
			if (host.contains(node)) host.removeChild(node);
		}
	};
}
