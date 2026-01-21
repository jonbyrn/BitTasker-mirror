import { writable } from 'svelte/store';

/**
 * Single source of truth for the app's primary scroll container.
 *
 * After migrating to an app-shell layout (header / scrollable content / footer),
 * `window`/`document` scrolling is no longer the source of scroll events.
 * Components that depend on scroll should subscribe to this store.
 */
export const appScrollContainer = writable<HTMLElement | null>(null);

