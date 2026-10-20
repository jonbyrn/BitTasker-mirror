function channel(hex: string, index: number): number {
	const value = parseInt(hex.slice(index, index + 2), 16) / 255;
	return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function normalizeHex(input: string): string | null {
	const raw = input.trim().replace('#', '');
	if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(raw)) return null;
	const hex =
		raw.length === 3
			? raw
					.split('')
					.map((part) => part + part)
					.join('')
			: raw;
	return hex.toLowerCase();
}

export function relativeLuminance(input: string): number {
	const hex = normalizeHex(input);
	if (!hex) throw new Error(`Not a hex color: ${input}`);
	const r = channel(hex, 0);
	const g = channel(hex, 2);
	const b = channel(hex, 4);
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(foreground: string, background: string): number {
	const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
	const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
	return (lighter + 0.05) / (darker + 0.05);
}

export function parseThemeColors(css: string, theme: 'light' | 'dark'): Record<string, string> {
	const marker = `name: '${theme}'`;
	const start = css.indexOf(marker);
	if (start < 0) return {};
	const next = css.indexOf("@plugin 'daisyui/theme'", start + marker.length);
	const block = css.slice(start, next === -1 ? undefined : next);
	const colors: Record<string, string> = {};
	for (const match of block.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})/g)) {
		colors[match[1]] = match[2];
	}
	return colors;
}

export const TEXT_PAIRS = [
	['primary', 'primary-content'],
	['secondary', 'secondary-content'],
	['accent', 'accent-content'],
	['neutral', 'neutral-content'],
	['info', 'info-content'],
	['success', 'success-content'],
	['warning', 'warning-content'],
	['error', 'error-content'],
	['base-100', 'base-content'],
	['base-200', 'base-content'],
	['base-300', 'base-content']
] as const;

/** WCAG 2.2 AA normal text. */
export const AA_TEXT_CONTRAST = 4.5;
