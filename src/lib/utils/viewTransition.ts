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
