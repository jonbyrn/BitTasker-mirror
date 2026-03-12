type ClickOutsideAction = (
	node: HTMLElement,
	options?: { callback: () => void; exclude?: string }
) => {
	destroy: () => void;
};

const AVATAR_DEBUG =
	typeof window !== 'undefined' && window.location?.search?.includes('avatar-debug=1');

export const clickOutside: ClickOutsideAction = (node, options) => {
	const handleClick = (event: MouseEvent) => {
		if (!node) return;

		const target = event.target as Node;
		const isAvatar = options?.exclude === '#avatar-dropdown-trigger';

		// Check if click is on an excluded element FIRST (e.g., the button that opens the dropdown)
		// This must be checked before checking if inside node, since excluded elements are often outside
		if (options?.exclude) {
			try {
				const excludedElement = document.querySelector(options.exclude);
				if (excludedElement && (excludedElement === target || excludedElement.contains(target))) {
					if (AVATAR_DEBUG && isAvatar) {
						console.log('[AvatarDropdown] clickOutside: hit trigger, no close', {
							ts: Date.now(),
							target: (target as HTMLElement)?.id || (target as HTMLElement)?.tagName
						});
					}
					return;
				}
			} catch {
				// Invalid selector, ignore
			}
		}

		// Check if click is inside the node
		if (node.contains(target)) {
			if (AVATAR_DEBUG && isAvatar) {
				console.log('[AvatarDropdown] clickOutside: inside dropdown, no close', {
					ts: Date.now(),
					target: (target as HTMLElement)?.tagName
				});
			}
			return;
		}

		// Check if default was prevented (shouldn't fire if event was handled)
		if (event.defaultPrevented) {
			return;
		}

		// Click is outside, call callback
		if (AVATAR_DEBUG && isAvatar) {
			console.log('[AvatarDropdown] clickOutside: outside → calling callback (close)', {
				ts: Date.now(),
				target: (target as HTMLElement)?.id || (target as HTMLElement)?.tagName
			});
		}
		options?.callback?.();
	};

	document.addEventListener('click', handleClick, true);

	return {
		destroy() {
			document.removeEventListener('click', handleClick, true);
		}
	};
};
