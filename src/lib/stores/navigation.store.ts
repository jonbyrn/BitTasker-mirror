import { derived, writable } from 'svelte/store';
import { page } from '$app/state';

// List of primary routes that shouldn't show back button by default
const primaryRoutes = [
    '/',
    '/dashboard',
    '/dashboard/',
    '/dashboard/tasks',
    '/dashboard/create-task',
    '/dashboard/wallet',
    '/dashboard/profile',
    '/dashboard/settings',
    '/how-it-works'
];

// Determine if current path is a sub-page by checking if it's not in primaryRoutes
// and if it includes slashes beyond the base route structure (e.g., tasks/123)
function isSubPage(path: string): boolean {
    // Check if it's a primary route
    if (primaryRoutes.includes(path)) {
        return false;
    }

    // Count segments to determine if it's a sub-page
    const segments = path.split('/').filter(segment => segment.length > 0);

    // Check if it's a dashboard sub-page (e.g., /dashboard/tasks/123)
    if (path.startsWith('/dashboard/')) {
        return segments.length > 2;
    }

    // For other paths, any path with more than 1 segment is considered a sub-page
    return segments.length > 1;
}

function createNavigationStore() {
    // Store for manually controlling back button visibility
    const backButtonVisibility = writable<'show' | 'hide' | 'auto'>('auto');

    // Store for the current path (updated from TopBar)
    const currentPath = writable<string>(page.url.pathname);

    // Derived store that combines manual controls with automatic detection
    const showBackButton = derived(
        [backButtonVisibility, currentPath],
        ([$backButtonVisibility, $currentPath]) => {
            // Manual override takes precedence
            if ($backButtonVisibility === 'show') return true;
            if ($backButtonVisibility === 'hide') return false;

            // Auto detection based on path
            return isSubPage($currentPath);
        }
    );

    // Return the public API
    return {
        subscribe: showBackButton.subscribe,
        setBackButton: (visibility: 'show' | 'hide' | 'auto'): void => {
            backButtonVisibility.set(visibility);
        },
        resetBackButton: (): void => {
            backButtonVisibility.set('auto');
        },
    };
}

export const showBackButton = createNavigationStore();