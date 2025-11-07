/**
 * Mobile gesture utilities for swipe actions
 */

export interface SwipeGestureOptions {
	threshold: number; // Minimum distance to trigger swipe (default: 50px)
	velocityThreshold: number; // Minimum velocity to trigger swipe (default: 0.3)
	onSwipeLeft?: () => void;
	onSwipeRight?: () => void;
	onSwipeUp?: () => void;
	onSwipeDown?: () => void;
}

export interface SwipeState {
	startX: number;
	startY: number;
	currentX: number;
	currentY: number;
	startTime: number;
	isSwiping: boolean;
}

const DEFAULT_OPTIONS: Required<Omit<SwipeGestureOptions, 'onSwipeLeft' | 'onSwipeRight' | 'onSwipeUp' | 'onSwipeDown'>> = {
	threshold: 50,
	velocityThreshold: 0.3
};

/**
 * Create swipe gesture handler
 */
export function createSwipeHandler(
	element: HTMLElement,
	options: SwipeGestureOptions
): () => void {
	const opts = { ...DEFAULT_OPTIONS, ...options };
	let swipeState: SwipeState | null = null;

	function handleTouchStart(e: TouchEvent): void {
		if (e.touches.length !== 1) return;

		const touch = e.touches[0];
		swipeState = {
			startX: touch.clientX,
			startY: touch.clientY,
			currentX: touch.clientX,
			currentY: touch.clientY,
			startTime: Date.now(),
			isSwiping: false
		};
	}

	function handleTouchMove(e: TouchEvent): void {
		if (!swipeState || e.touches.length !== 1) return;

		const touch = e.touches[0];
		swipeState.currentX = touch.clientX;
		swipeState.currentY = touch.clientY;

		const deltaX = swipeState.currentX - swipeState.startX;
		const deltaY = swipeState.currentY - swipeState.startY;
		const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

		if (distance > opts.threshold && !swipeState.isSwiping) {
			swipeState.isSwiping = true;
			// Prevent default scrolling while swiping
			e.preventDefault();
		}
	}

	function handleTouchEnd(e: TouchEvent): void {
		if (!swipeState) return;

		const deltaX = swipeState.currentX - swipeState.startX;
		const deltaY = swipeState.currentY - swipeState.startY;
		const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
		const duration = Date.now() - swipeState.startTime;
		const velocity = distance / duration;

		// Check if swipe meets threshold and velocity requirements
		if (distance >= opts.threshold && velocity >= opts.velocityThreshold) {
			const absDeltaX = Math.abs(deltaX);
			const absDeltaY = Math.abs(deltaY);

			// Determine swipe direction
			if (absDeltaX > absDeltaY) {
				// Horizontal swipe
				if (deltaX > 0 && options.onSwipeRight) {
					options.onSwipeRight();
				} else if (deltaX < 0 && options.onSwipeLeft) {
					options.onSwipeLeft();
				}
			} else {
				// Vertical swipe
				if (deltaY > 0 && options.onSwipeDown) {
					options.onSwipeDown();
				} else if (deltaY < 0 && options.onSwipeUp) {
					options.onSwipeUp();
				}
			}
		}

		swipeState = null;
	}

	// Add event listeners
	element.addEventListener('touchstart', handleTouchStart, { passive: false });
	element.addEventListener('touchmove', handleTouchMove, { passive: false });
	element.addEventListener('touchend', handleTouchEnd, { passive: true });

	// Return cleanup function
	return () => {
		element.removeEventListener('touchstart', handleTouchStart);
		element.removeEventListener('touchmove', handleTouchMove);
		element.removeEventListener('touchend', handleTouchEnd);
	};
}

/**
 * Check if device is mobile
 */
export function isMobileDevice(): boolean {
	if (typeof window === 'undefined') return false;
	return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
		navigator.userAgent
	) || window.innerWidth < 768;
}

/**
 * Check if device supports touch
 */
export function isTouchDevice(): boolean {
	if (typeof window === 'undefined') return false;
	return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

