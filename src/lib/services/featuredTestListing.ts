const FEATURED_TEST_PATTERNS = [
	/\bprobes?\b/i,
	/erc\s*-?\s*1155/i,
	/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i
];

/** Hide probe posts, token specs, and listings that publish an email address. */
export function isFeaturedTestTask(item: {
	title?: string | null;
	description?: string | null;
}): boolean {
	const text = `${item.title ?? ''}\n${item.description ?? ''}`;
	return FEATURED_TEST_PATTERNS.some((pattern) => pattern.test(text));
}
