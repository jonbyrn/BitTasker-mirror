import { goto } from '$app/navigation';

// Check if the browser supports the View Transitions API
export const supportsViewTransitions =
	typeof document !== 'undefined' && 'startViewTransition' in document;

/**
 * Navigate to a new URL with View Transitions API if supported
 * @param {string} url - URL to navigate to
 * @param {Object} options - Navigation options
 */
export const navigateWithTransition = async (url: string, options = {}) => {
	if (supportsViewTransitions) {
		try {
			// Use the View Transitions API
			const transition = document.startViewTransition(async () => {
				await goto(url, options);
			});

			await transition.finished;
		} catch (error) {
			console.error('View transition error:', error);
			// Fallback to regular navigation
			await goto(url, options);
		}
	} else {
		// Browser doesn't support View Transitions API
		await goto(url, options);
	}
};

/**
 * Perform a state update with view transition animation
 * @param {Function} updateFn - Function that updates the state
 */
export const updateWithTransition = async (updateFn: () => void) => {
	if (supportsViewTransitions) {
		try {
			const transition = document.startViewTransition(() => {
				updateFn();
				return Promise.resolve();
			});

			await transition.finished;
			return true;
		} catch (error) {
			console.error('View transition error:', error);
			// Fallback to regular update
			updateFn();
			return false;
		}
	} else {
		// Browser doesn't support View Transitions API
		updateFn();
		return false;
	}
};

/**
 * Simple transition for form steps or content changes
 * @param {Function} updateFn - Function that updates the state
 */
export const animateStepTransition = (updateFn: () => void) => {
	if (supportsViewTransitions) {
		document.startViewTransition(() => {
			updateFn();
		});
	} else {
		updateFn();
	}
};

/**
 * Sequential transition for multi-step forms with exit and entry animations
 * @param {Function} updateFn - Function that updates the state
 * @param {number} exitDuration - Duration of exit animation in ms
 * @param {number} direction - Direction of transition (1 for forward, -1 for backward)
 */
export const sequentialTransition = async (
	updateFn: () => void,
	exitDuration: number = 300,
	direction: number = 1
) => {
	if (supportsViewTransitions) {
		try {
			// First, signal that we're starting to transition out
			const outContainer = document.querySelector('.step-content-container');
			if (outContainer) {
				outContainer.classList.add('transition-out');

				// Use direction to determine the exit animation direction
				outContainer.setAttribute('data-direction', direction.toString());

				// Wait for the exit animation to complete
				await new Promise((resolve) => setTimeout(resolve, exitDuration));
			}

			// Then update the state
			updateFn();

			// Start the transition animation for the new content
			const transition = document.startViewTransition(() => {
				const inContainer = document.querySelector('.step-content-container');
				if (inContainer) {
					inContainer.classList.add('transition-in');
					inContainer.setAttribute('data-direction', direction.toString());
					setTimeout(() => {
						inContainer.classList.remove('transition-in');
					}, exitDuration);
				}
				return Promise.resolve();
			});

			await transition.finished;

			// Clean up classes
			const container = document.querySelector('.step-content-container');
			if (container) {
				container.classList.remove('transition-out', 'transition-in');
				container.removeAttribute('data-direction');
			}

			return true;
		} catch (error) {
			console.error('View transition error:', error);
			updateFn();
			return false;
		}
	} else {
		// Simply update state if no view transitions support
		updateFn();
		return false;
	}
};

/**
 * Add view transition styles to document
 * @param {number} direction - Direction of animations (1 for forward, -1 for backward)
 */
export const addViewTransitionStyles = (direction: number = 1) => {
	if (!supportsViewTransitions || typeof document === 'undefined') return;

	const existingStyle = document.getElementById('view-transition-styles');
	if (existingStyle) {
		existingStyle.remove();
	}

	const style = document.createElement('style');
	style.id = 'view-transition-styles';
	style.textContent = `
		/* Define the transition behavior */
		.transition-out {
			animation: fade-out 300ms ease-in-out forwards;
		}
		
		.transition-in {
			animation: fade-in 300ms ease-in-out forwards;
		}
		
		@keyframes fade-in {
			from { opacity: 0; transform: translateX(${direction > 0 ? '30px' : '-30px'}); }
			to { opacity: 1; transform: translateX(0); }
		}
		
		@keyframes fade-out {
			from { opacity: 1; transform: translateX(0); }
			to { opacity: 0; transform: translateX(${direction > 0 ? '-30px' : '30px'}); }
		}
		
		::view-transition-old(step-content) {
			animation: 180ms cubic-bezier(0.4, 0, 0.2, 1) both fade-out;
		}
		
		::view-transition-new(step-content) {
			animation: 180ms cubic-bezier(0.4, 0, 0.2, 1) 180ms both fade-in;
		}
	`;
	document.head.appendChild(style);
};
