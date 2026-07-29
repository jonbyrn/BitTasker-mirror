import { afterEach, describe, expect, it } from 'vitest';
import { tick } from 'svelte';
import { createPortal, portal } from '$lib/utils/portal';

function createHost() {
	const host = document.createElement('div');
	document.body.appendChild(host);
	return host;
}

function createPortalNode() {
	const node = document.createElement('div');
	node.textContent = 'modal-body';
	return node;
}

afterEach(() => {
	document.body.innerHTML = '';
});

describe('portal utility', () => {
	it('allows multiple hosts to register the same portal key without throwing', async () => {
		const firstHost = createHost();
		const secondHost = createHost();
		const firstRegistration = createPortal(firstHost, 'modals') as unknown as {
			destroy: () => void;
		};
		let secondRegistration: { destroy: () => void } | null = null;

		expect(() => {
			secondRegistration = createPortal(secondHost, 'modals') as unknown as { destroy: () => void };
		}).not.toThrow();

		const node = createPortalNode();
		const mounted = portal(node, 'modals');
		await tick();

		expect(secondHost.contains(node)).toBe(true);
		expect(firstHost.contains(node)).toBe(false);

		(secondRegistration as unknown as { destroy: () => void })?.destroy();
		firstRegistration.destroy();
		(mounted as unknown as { destroy: () => void }).destroy();
	});

	it('mounts into the most recently registered host and falls back when that host is destroyed', async () => {
		const firstHost = createHost();
		const secondHost = createHost();
		const firstRegistration = createPortal(firstHost, 'modals');
		const secondRegistration = createPortal(secondHost, 'modals');

		const latestNode = createPortalNode();
		const latestMount = portal(latestNode, 'modals');
		await tick();

		expect(secondHost.contains(latestNode)).toBe(true);
		expect(firstHost.contains(latestNode)).toBe(false);

		latestMount.destroy();
		secondRegistration.destroy();

		const fallbackNode = createPortalNode();
		const fallbackMount = portal(fallbackNode, 'modals');
		await tick();

		expect(firstHost.contains(fallbackNode)).toBe(true);

		fallbackMount.destroy();
		firstRegistration.destroy();
	});
});
