type DockHeightVarOptions = {
	cssVar?: string;
};

export function dockHeightVar(
	node: HTMLElement,
	{ cssVar = '--app-dock-height' }: DockHeightVarOptions = {}
) {
	if (typeof ResizeObserver === 'undefined') {
		return {
			destroy() {}
		};
	}

	const rootStyle = document.documentElement.style;

	const updateVar = () => {
		const measured = Math.ceil(node.getBoundingClientRect().height);
		if (measured <= 0) {
			return;
		}

		rootStyle.setProperty(cssVar, `${measured}px`);
	};

	updateVar();

	const observer = new ResizeObserver(() => updateVar());
	observer.observe(node);

	return {
		destroy() {
			observer.disconnect();
		}
	};
}
