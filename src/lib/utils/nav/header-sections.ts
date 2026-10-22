/** Desktop header items that do not fit on one row at 1280px. */
export const HEADER_OVERFLOW_SECTION_IDS = ['my-account', 'support-help', 'settings'] as const;

export function splitHeaderSections<T extends { id: string }>(
	sections: readonly T[]
): { primary: T[]; overflow: T[] } {
	const overflowIds = new Set<string>(HEADER_OVERFLOW_SECTION_IDS);
	return {
		primary: sections.filter((section) => !overflowIds.has(section.id)),
		overflow: sections.filter((section) => overflowIds.has(section.id))
	};
}
