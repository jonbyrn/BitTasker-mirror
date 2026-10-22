type ClickOutsideAction = (
	node: HTMLElement,
	options?: { callback: () => void; exclude?: string }
) => {
	destroy: () => void;
};

function eventNodes(event: Event): Node[] {
	const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
	const nodes = path.filter((entry): entry is Node => entry instanceof Node);
	if (event.target instanceof Node && !nodes.includes(event.target)) nodes.push(event.target);
	return nodes;
}

export const clickOutside: ClickOutsideAction = (node, options) => {
	// A press that starts inside the control can finish on another element once the
	// header reflows. That click must not immediately close the menu it just opened.
	let pointerInside = false;

	const isInside = (event: Event): boolean => {
		const nodes = eventNodes(event);
		if (options?.exclude) {
			try {
				const excludedElement = document.querySelector(options.exclude);
				if (excludedElement) {
					for (const target of nodes) {
						if (excludedElement === target || excludedElement.contains(target)) return true;
					}
				}
			} catch {
				// Invalid selector, ignore
			}
		}
		return nodes.some((target) => node.contains(target));
	};

	const handlePointerDown = (event: Event) => {
		pointerInside = isInside(event);
	};

	const handleClick = (event: MouseEvent) => {
		if (!node) return;
		const startedInside = pointerInside;
		pointerInside = false;
		if (startedInside || isInside(event) || event.defaultPrevented) return;
		options?.callback?.();
	};

	document.addEventListener('pointerdown', handlePointerDown, true);
	document.addEventListener('click', handleClick, true);

	return {
		destroy() {
			document.removeEventListener('pointerdown', handlePointerDown, true);
			document.removeEventListener('click', handleClick, true);
		}
	};
};
