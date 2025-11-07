/**
 * Pull-to-refresh utility for mobile
 */

export interface PullToRefreshOptions {
	threshold: number; // Distance to pull before triggering refresh (default: 80px)
	onRefresh: () => Promise<void> | void;
	resistance: number; // Resistance factor for pull (default: 2.5)
}

const DEFAULT_OPTIONS: Required<Omit<PullToRefreshOptions, 'onRefresh'>> = {
	threshold: 80,
	resistance: 2.5
};

export interface PullToRefreshState {
	isPulling: boolean;
	pullDistance: number;
	isRefreshing: boolean;
}

/**
 * Create pull-to-refresh handler
 */
export function createPullToRefreshHandler(
	element: HTMLElement,
	options: PullToRefreshOptions
): () => void {
	const opts = { ...DEFAULT_OPTIONS, ...options };
	let state: PullToRefreshState = {
		isPulling: false,
		pullDistance: 0,
		isRefreshing: false
	};

	let startY = 0;
	let currentY = 0;

	function handleTouchStart(e: TouchEvent): void {
		// Only trigger if at top of scrollable area
		if (element.scrollTop !== 0 || state.isRefreshing) return;

		if (e.touches.length === 1) {
			startY = e.touches[0].clientY;
			currentY = startY;
		}
	}

	function handleTouchMove(e: TouchEvent): void {
		if (element.scrollTop !== 0 || state.isRefreshing) return;

		if (e.touches.length === 1) {
			currentY = e.touches[0].clientY;
			const deltaY = currentY - startY;

			if (deltaY > 0) {
				// Pulling down
				state.isPulling = true;
				state.pullDistance = Math.min(deltaY / opts.resistance, opts.threshold * 1.5);

				// Prevent default scrolling when pulling
				if (state.pullDistance > 10) {
					e.preventDefault();
				}
			}
		}
	}

	async function handleTouchEnd(): void {
		if (!state.isPulling || state.isRefreshing) {
			state.isPulling = false;
			state.pullDistance = 0;
			return;
		}

		if (state.pullDistance >= opts.threshold) {
			state.isRefreshing = true;
			state.pullDistance = opts.threshold;

			try {
				await options.onRefresh();
			} finally {
				// Reset after refresh completes
				setTimeout(() => {
					state.isRefreshing = false;
					state.isPulling = false;
					state.pullDistance = 0;
				}, 300);
			}
		} else {
			// Reset if not enough pull
			state.isPulling = false;
			state.pullDistance = 0;
		}
	}

	// Add event listeners
	element.addEventListener('touchstart', handleTouchStart, { passive: true });
	element.addEventListener('touchmove', handleTouchMove, { passive: false });
	element.addEventListener('touchend', handleTouchEnd, { passive: true });

	// Return state getter and cleanup function
	return () => {
		element.removeEventListener('touchstart', handleTouchStart);
		element.removeEventListener('touchmove', handleTouchMove);
		element.removeEventListener('touchend', handleTouchEnd);
	};
}

/**
 * Get pull-to-refresh state
 */
export function getPullToRefreshState(): PullToRefreshState {
	// This would be managed by the component using the handler
	// For now, return a default state
	return {
		isPulling: false,
		pullDistance: 0,
		isRefreshing: false
	};
}

