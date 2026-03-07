type ClickOutsideAction = (
	node: HTMLElement,
	options?: { callback: () => void; exclude?: string }
) => {
	destroy: () => void;
};

export const clickOutside: ClickOutsideAction = (node, options) => {
	const handleInteraction = (event: MouseEvent | PointerEvent) => {
		if (!node) return;

		const target = event.target as Node | null;
		if (!target) return;

		// Check excluded element first (e.g., trigger button outside the dropdown).
		if (options?.exclude) {
			try {
				const targetElement = target instanceof Element ? target : null;
				if (targetElement?.closest(options.exclude)) {
					return;
				}
			} catch {
				// Invalid selector, ignore
			}
		}

		const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
		if (path.includes(node) || node.contains(target)) {
			return;
		}

		// Interaction is outside; close.
		options?.callback?.();
	};

	const handlePointerUp = (event: PointerEvent) => {
		// Only primary pointer to avoid right-click/context interactions.
		if (!event.isPrimary) return;
		handleInteraction(event);
	};

	const handleClick = (event: MouseEvent) => {
		handleInteraction(event);
	};

	document.addEventListener('pointerup', handlePointerUp);
	document.addEventListener('click', handleClick);

	return {
		destroy() {
			document.removeEventListener('pointerup', handlePointerUp);
			document.removeEventListener('click', handleClick);
		}
	};
};
