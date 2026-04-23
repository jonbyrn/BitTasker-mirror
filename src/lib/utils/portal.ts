import { tick } from 'svelte';

const portal_map = new Map<string, HTMLElement[]>();

function getPortalHosts(key: string): HTMLElement[] {
	return portal_map.get(key) ?? [];
}

function getActivePortalHost(key: string): HTMLElement | null {
	const hosts = getPortalHosts(key);
	return hosts.at(-1) ?? null;
}

export function createPortal(node: HTMLElement, id = 'default') {
	const key = `$$portal.${id}`;
	const hosts = getPortalHosts(key);
	hosts.push(node);
	portal_map.set(key, hosts);

	return {
		destroy: () => {
			const currentHosts = portal_map.get(key);
			if (!currentHosts) {
				return;
			}

			const hostIndex = currentHosts.lastIndexOf(node);
			if (hostIndex >= 0) {
				currentHosts.splice(hostIndex, 1);
			}

			if (currentHosts.length === 0) {
				portal_map.delete(key);
				return;
			}

			portal_map.set(key, currentHosts);
		}
	};
}

function mount(node: HTMLElement, key: string) {
	const host = getActivePortalHost(key);
	if (!host) throw `unknown portal ${key}`;
	host.insertBefore(node, null);
	return () => host.contains(node) && host.removeChild(node);
}

export function portal(node: HTMLElement, id = 'default') {
	let destroy: (() => void) | undefined;
	const key = `$$portal.${id}`;
	if (!getActivePortalHost(key)) {
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
