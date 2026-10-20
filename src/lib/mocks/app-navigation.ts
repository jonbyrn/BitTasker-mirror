// Mock for $app/navigation in tests
export const goto = () => {};
export const resolve = (path: string, _params?: Record<string, string>) => path;
export const preloadData = () => {};
export const preloadRoute = () => {};
export const invalidate = () => {};
export const invalidateAll = () => {};
export const beforeNavigate = () => {};
export const afterNavigate = () => {};
export const disableScrollHandling = () => {};
