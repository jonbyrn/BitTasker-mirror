const FEATURED_TEST_PATTERNS = [
	/\bprobes?\b/i,
	/erc\s*-?\s*1155/i,
	/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i
];

const PLACEHOLDER_TEXT = [
	/lorem\s+ipsum/i,
	/\blorem\b/i,
	/\btests?\b/i,
	/\btesting\b/i,
	/\bteste\b/i,
	/we\s+are\s+hiring/i,
	/we'?re\s+hiring/i
];

/** A title or blurb that is only consonants, such as "hshshsh". */
function isKeyboardMash(value: string): boolean {
	const text = value.trim();
	if (text.length < 6 || text.length > 24 || /\s/.test(text)) return false;
	return !/[aeiouáéíóúü]/i.test(text);
}

/** Hide probe posts, token specs, and listings that publish an email address. */
export function isFeaturedTestTask(item: {
	title?: string | null;
	description?: string | null;
}): boolean {
	const text = `${item.title ?? ''}\n${item.description ?? ''}`;
	if (FEATURED_TEST_PATTERNS.some((pattern) => pattern.test(text))) return true;
	return /\btoken\b/i.test(text) && /\b(eth|ethereum|erc\s*-?\s*20)\b/i.test(text);
}

/**
 * Homepage featured rows only. Lorem, test posts, paragraph titles, and the
 * repeated hiring photo stay off the home page. Browse can still find them.
 */
export function isFeaturedPlaceholder(item: {
	title?: string | null;
	description?: string | null;
	image?: string | null;
}): boolean {
	if (isFeaturedTestTask(item)) return true;
	const title = item.title ?? '';
	const description = item.description ?? '';
	const image = item.image ?? '';
	const text = `${title}\n${description}`;
	if (PLACEHOLDER_TEXT.some((pattern) => pattern.test(text))) return true;
	if (/hiring|we-are-hiring|were-hiring|we_are_hiring/i.test(image)) return true;
	if (title.trim().length > 120) return true;
	return isKeyboardMash(title) || isKeyboardMash(description);
}
