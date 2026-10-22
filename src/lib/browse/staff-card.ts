/** Posted tasks reused on the staff board use task ids (`task-…`), not shift ids. */
export function isTaskStaffId(id: string): boolean {
	return id.startsWith('task-');
}

/** Drop blank role, schedule, or place fragments so the card does not render `· ·`. */
export function staffMetaSegments(parts: readonly (string | null | undefined)[]): string[] {
	return parts.map((part) => String(part ?? '').trim()).filter((part) => part.length > 0);
}
