// Mock for $app/navigation in tests
export const goto = () => {};
export const resolve = (path: string, _params?: Record<string, string>) => path;

export function resolveRoute(path: string, params?: Record<string, string | undefined>) {
	let route = path.replace(/\/\([^)]+\)/g, '');
	for (const [key, value] of Object.entries(params ?? {})) {
		route = route.replaceAll(`[${key}]`, value ?? '');
	}
	return route;
}
export const preloadData = () => {};
export const preloadRoute = () => {};
export const invalidate = () => {};
export const invalidateAll = () => {};
export const beforeNavigate = () => {};
export const afterNavigate = () => {};
export const disableScrollHandling = () => {};
