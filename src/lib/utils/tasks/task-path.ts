/** Public, refreshable task page. */
export function taskDetailsPath(id: string): string {
	return `/tasks/${encodeURIComponent(id)}`;
}
