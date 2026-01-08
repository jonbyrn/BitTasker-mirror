type ClickOutsideAction = (
	node: HTMLElement,
	options?: { callback: () => void; exclude?: string }
) => {
	destroy: () => void;
};

export const clickOutside: ClickOutsideAction = (node, options) => {
	const handleClick = (event: MouseEvent) => {
		if (!node) return;
		
		const target = event.target as Node;
		
		// Check if click is on an excluded element FIRST (e.g., the button that opens the dropdown)
		// This must be checked before checking if inside node, since excluded elements are often outside
		if (options?.exclude) {
			try {
				const excludedElement = document.querySelector(options.exclude);
				if (excludedElement && (excludedElement === target || excludedElement.contains(target))) {
					return;
				}
			} catch (e) {
				// Invalid selector, ignore
			}
		}
		
		// Check if click is inside the node
		if (node.contains(target)) {
			return;
		}
		
		// Check if default was prevented (shouldn't fire if event was handled)
		if (event.defaultPrevented) {
			return;
		}
		
		// Click is outside, call callback
		options?.callback?.();
	};

	document.addEventListener('click', handleClick, true);

	return {
		destroy() {
			document.removeEventListener('click', handleClick, true);
		}
	};
};
