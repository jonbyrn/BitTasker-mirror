export type ClickOutsideOptions = {
	callback: () => void;
	exclude?: string;
	/** Ignore outside clicks until this timestamp (ms). Use to avoid iOS ghost click closing dropdown right after open. */
	getIgnoreUntil?: () => number;
};

type ClickOutsideAction = (
	node: HTMLElement,
	options?: ClickOutsideOptions
) => { destroy: () => void };

export const clickOutside: ClickOutsideAction = (node, options) => {
	const handleClick = (event: MouseEvent) => {
		if (!node) return;

		const ignoreUntil = options?.getIgnoreUntil?.();
		if (typeof ignoreUntil === 'number' && Date.now() < ignoreUntil) return;

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
		if (event.defaultPrevented) return;

		options?.callback?.();
	};

	document.addEventListener('click', handleClick, true);

	return {
		destroy() {
			document.removeEventListener('click', handleClick, true);
		}
	};
};
