export type ClickOutsideOptions = {
	callback: () => void;
	exclude?: string;
};

type ClickOutsideAction = (node: HTMLElement, options?: ClickOutsideOptions) => { destroy: () => void };

export const clickOutside: ClickOutsideAction = (node, options) => {
		// Handle both mouse and touch events so iOS Safari reliably detects outside taps
	const handleEvent = (event: Event) => {
		if (!node) return;

		const target = event.target as Node;

		if (options?.exclude) {
			try {
				const el = document.querySelector(options.exclude);
				if (el && (el === target || el.contains(target))) return;
			} catch {
				// invalid selector
			}
		}

		if (node.contains(target)) return;
		// For passive touch listeners defaultPrevented will always be false, but this is
		// still useful for normal click handlers.
		if (event.defaultPrevented) return;

		options?.callback?.();
	};

	const touchOptions: AddEventListenerOptions = { passive: true, capture: true };

	document.addEventListener('click', handleEvent, true);
	document.addEventListener('touchstart', handleEvent, touchOptions);

	return {
		destroy() {
			document.removeEventListener('click', handleEvent, true);
			// When removing, only `capture` matters for matching; `passive` is ignored.
			document.removeEventListener('touchstart', handleEvent, { capture: true } as EventListenerOptions);
		}
	};
};
