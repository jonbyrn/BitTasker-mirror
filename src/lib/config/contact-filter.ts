/**
 * Client-side contact filter for encrypted DMs.
 *
 * Every blocked word and every regex lives in this file. The web app and the
 * Android Capacitor app both send through `sendDirectMessage`, which calls
 * `inspectOutgoingMessage`. Nothing here is sent to a server. Message text
 * stays on the device.
 *
 * Modes:
 * - `pre-escrow` blocks phones, emails, URLs, handles, and off-platform words.
 * - `post-escrow` keeps blocking handles and off-platform words, and allows
 *   normal chat (phone numbers, other emails, and ordinary URLs).
 *
 * Tradeoffs (tuned so the false positives below still pass):
 * - `wa`, `ig`, and `fb` match only as whole tokens. "water", "big", "waffle",
 *   and "ignore" pass. A lone "wa" / "ig" / "fb" is blocked, including the
 *   Washington abbreviation "WA" unless a 5-digit ZIP follows it
 *   ("Seattle, WA 98101" passes; "Seattle, WA" without a ZIP does not).
 * - "signal" is the Signal app, but "signal strength" and signal next to
 *   turn / traffic / wifi / cell / mobile / radio / network, or followed by
 *   strength / bars / quality / noise / lost / weak / strong / level, passes.
 *   "the signal" and "signal me" stay blocked.
 * - Spelled digits block at 3 consecutive words so "seven zero three" and
 *   "siete cero tres" fail. "one two" passes. Counting out loud
 *   ("one two three") is blocked. Only the digits 0-9 are words, so
 *   "twenty", "hundred", and "mil" do not fire.
 * - "um" / "uma" / "una" are also Portuguese and Spanish articles. They count
 *   only inside a run of 3+ digit words, so "um cafe" passes.
 * - Commas are thousands separators, not phone separators. "$25.60",
 *   "1,206 sats", and "1,206,789" pass. A phone written with commas
 *   ("703,555,0199", last group not exactly 3 digits) is still blocked.
 * - Dates `10/20/2026`, `2026-10-20`, dotted `10.20.2026`, and "Oct 20" are
 *   masked before the phone scan. A number written exactly like a date can
 *   pass. Times (`10:32`, `10:32 AM`) are not phone groups.
 * - Contiguous runs of 7+ digits are blocked before escrow. That includes
 *   unseparated amounts (`12060000`) and order ids. Write amounts with
 *   commas or a currency word. After escrow those runs are allowed, so a
 *   transaction hash can be pasted once escrow exists.
 * - Two-character leetspeak is not folded, so "1g" and "5g" stay units.
 *   Longer mixes fold (`wh4ts4pp`, `s3v3n`).
 * - "gmail" is always a platform word, so `ada@gmail.com` stays blocked
 *   after escrow. `ada@example.com` is allowed once escrow is formed.
 *   The words "email", "correo", "phone", and the phrase "call me" stay
 *   blocked after escrow even when the address or number itself would pass.
 * - "messenger" is blocked as a whole word, including "bike messenger".
 * - All URLs are blocked before escrow, including bittasker.com links.
 *   After escrow, ordinary URLs pass and `t.me/` / `wa.me/` still do not.
 * - System location, completion, and payment DMs are checked with the
 *   post-escrow rules so a maps link still sends.
 */

export type ContactFilterMode = 'pre-escrow' | 'post-escrow';

export type ContactFilterCategory = 'phone' | 'email' | 'url' | 'handle' | 'platform';

export type ContactFilterResult = {
	blocked: boolean;
	category: ContactFilterCategory | null;
};

export const PHONE_MIN_DIGITS = 7;
export const PHONE_MAX_GROUPED_DIGITS = 15;
export const SPELLED_DIGIT_MIN = 3;

/** Whole-token only. Never match these inside "water", "big", or "ofb". */
export const SHORT_PLATFORM_WORDS = ['wa', 'wsp', 'ig', 'fb'] as const;

export const PLATFORM_WORDS = [
	'whatsapp',
	'whatsap',
	'telegram',
	'signal',
	'facebook',
	'messenger',
	'instagram',
	'gmail',
	'email',
	'correo',
	'correio',
	'phone',
	'telephone',
	'telefono',
	'telefone',
	'celular',
	'llamame',
	'ligame',
	'callme'
] as const;

export const PLATFORM_PHRASES = [
	'call me',
	'llama me',
	'liga me',
	'me liga',
	'me llame',
	'me llames',
	'chama me',
	'me chama'
] as const;

/** "signal" is the app. These neighbors are radio, wifi, or traffic. */
export const SIGNAL_PREVIOUS_WORDS = [
	'turn',
	'traffic',
	'wifi',
	'wi',
	'cell',
	'mobile',
	'radio',
	'network'
] as const;

export const SIGNAL_NEXT_WORDS = [
	'strength',
	'bars',
	'quality',
	'noise',
	'lost',
	'weak',
	'strong',
	'level'
] as const;

/** Digit-by-digit words in English, Spanish, and Portuguese. Not tens or hundreds. */
export const SPELLED_DIGIT_WORDS = [
	'zero',
	'oh',
	'one',
	'two',
	'three',
	'four',
	'five',
	'six',
	'seven',
	'eight',
	'nine',
	'cero',
	'uno',
	'una',
	'dos',
	'tres',
	'cuatro',
	'cinco',
	'seis',
	'siete',
	'ocho',
	'nueve',
	'um',
	'uma',
	'dois',
	'duas',
	'quatro',
	'sete',
	'oito',
	'nove'
] as const;

export const LEET_FOLDS: Readonly<Record<string, string>> = {
	'0': 'o',
	'1': 'i',
	'3': 'e',
	'4': 'a',
	'5': 's',
	'7': 't',
	'@': 'a',
	$: 's'
};

/** Cyrillic, Greek, and fullwidth lookalikes folded before matching. */
export const CONFUSABLE_PAIRS: ReadonlyArray<readonly [string, string]> = [
	['\u0430', 'a'],
	['\u0410', 'a'],
	['\u0435', 'e'],
	['\u0415', 'e'],
	['\u043e', 'o'],
	['\u041e', 'o'],
	['\u0440', 'p'],
	['\u0420', 'p'],
	['\u0441', 'c'],
	['\u0421', 'c'],
	['\u0443', 'y'],
	['\u0423', 'y'],
	['\u0445', 'x'],
	['\u0425', 'x'],
	['\u0456', 'i'],
	['\u0406', 'i'],
	['\u0458', 'j'],
	['\u0455', 's'],
	['\u04bb', 'h'],
	['\u0501', 'd'],
	['\u051b', 'q'],
	['\u051d', 'w'],
	['\u03b1', 'a'],
	['\u0391', 'a'],
	['\u03b5', 'e'],
	['\u0395', 'e'],
	['\u03bf', 'o'],
	['\u039f', 'o'],
	['\u03b9', 'i'],
	['\u0399', 'i'],
	['\uff10', '0'],
	['\uff11', '1'],
	['\uff12', '2'],
	['\uff13', '3'],
	['\uff14', '4'],
	['\uff15', '5'],
	['\uff16', '6'],
	['\uff17', '7'],
	['\uff18', '8'],
	['\uff19', '9'],
	['\uff20', '@'],
	['\uff0e', '.'],
	['\uff0f', '/'],
	['\uff0d', '-'],
	['\uff0b', '+'],
	['\u0660', '0'],
	['\u0661', '1'],
	['\u0662', '2'],
	['\u0663', '3'],
	['\u0664', '4'],
	['\u0665', '5'],
	['\u0666', '6'],
	['\u0667', '7'],
	['\u0668', '8'],
	['\u0669', '9'],
	['\u06f0', '0'],
	['\u06f1', '1'],
	['\u06f2', '2'],
	['\u06f3', '3'],
	['\u06f4', '4'],
	['\u06f5', '5'],
	['\u06f6', '6'],
	['\u06f7', '7'],
	['\u06f8', '8'],
	['\u06f9', '9']
];

export const ZERO_WIDTH_PATTERN =
	/[\u200B-\u200D\uFEFF\u2060\u180E\u00AD\u2066-\u2069\u202A-\u202E]/g;

export const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

export const OBFUSCATED_EMAIL_PATTERN =
	/\b[a-z0-9._%+-]{1,64}\s*(?:@|\(at\)|\[at\]|\{at\}|\bat\b)\s*[a-z0-9-]{2,64}\s*(?:\.|\(dot\)|\[dot\]|\{dot\}|\bdot\b)\s*[a-z]{2,24}\b/i;

export const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+/i;

export const BARE_DOMAIN_PATTERN =
	/\b(?:[a-z0-9-]{2,}\.)+(?:com|net|org|io|me|ly|co|app|dev|xyz|info|biz|us|uk|es|pt|br|gg|link|site|online|store)\b/i;

/** @handle that is not the middle of an email (no domain TLD after it). */
export const AT_HANDLE_PATTERN = /(^|[^a-z0-9._%+-])@([a-z0-9_]{2,})\b(?!\.[a-z]{2,})/i;

export const TELEGRAM_HANDLE_PATTERN = /\bt\s*\.?\s*me\s*\/+/i;
export const WHATSAPP_HANDLE_PATTERN = /\bwa\s*\.?\s*me\s*\/+/i;
export const TELEGRAM_DOT_HANDLE_PATTERN = /\bt\s+dot\s+me\b/i;
export const WHATSAPP_DOT_HANDLE_PATTERN = /\bwa\s+dot\s+me\b/i;
export const TELEGRAM_HOST_PATTERN = /\bt\.me\b/i;
export const WHATSAPP_HOST_PATTERN = /\bwa\.me\b/i;

export const DIGIT_RUN_PATTERN = /\d{7,}/;

export const SPACED_SINGLE_DIGITS_PATTERN = /(?:\d[\s.-]){6,}\d/;

export const GROUPED_PHONE_PATTERN =
	/(?:\+\d{1,3}[\s()./-]*)?(?:\(?\d{1,4}\)?[\s()./-]+){1,6}\d{1,4}/g;

export const COMMA_PHONE_PATTERN = /\d{2,4}(?:,\d{2,4}){1,4}/g;

export const THOUSANDS_PATTERN = /^\d{1,3}(?:,\d{3})+$/;

/** Masked before the phone scan so prices, dates, times, and streets survive. */
export const SAFE_NUMBER_PATTERNS: ReadonlyArray<RegExp> = [
	/\$\s?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?/gi,
	/\b\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?\s*(?:sats?|usd|usdt|rbtc|btc|dollars?)\b/gi,
	/\b\d{1,6}(?:[.,]\d{1,2})?\s*(?:sats?|usd|usdt|rbtc|btc|dollars?)\b/gi,
	/\b\d{4}-\d{2}-\d{2}\b/g,
	/\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g,
	/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?\b/gi,
	/\b\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*(?:,?\s+\d{4})?\b/gi,
	/\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?\b/gi,
	/\b\d{5}-\d{4}\b/g,
	/\b\d{5}-\d{3}\b/g,
	/\b\d{1,6}\s+[a-z][a-z0-9.'-]*(?:\s+[a-z][a-z0-9.'-]*){0,5}\s+(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|way|court|ct|place|pl|plaza|calle|avenida|av|rua|travessa|alameda|camino|highway|hwy)\b/gi
];

export const STATE_WA_PATTERN = /\bwa\s+\d{5}(?:-\d{4})?\b/gi;

const CONFUSABLE_MAP: ReadonlyMap<string, string> = new Map(CONFUSABLE_PAIRS);
const SHORT_PLATFORM_SET = new Set<string>(SHORT_PLATFORM_WORDS);
const PLATFORM_WORD_SET = new Set<string>(PLATFORM_WORDS);
const SIGNAL_PREVIOUS_SET = new Set<string>(SIGNAL_PREVIOUS_WORDS);
const SIGNAL_NEXT_SET = new Set<string>(SIGNAL_NEXT_WORDS);
const SPELLED_DIGIT_SET = new Set<string>(SPELLED_DIGIT_WORDS);
const SPELLED_DIGITS_BY_LENGTH = [...SPELLED_DIGIT_WORDS].sort((a, b) => b.length - a.length);

const ALLOWED: ContactFilterResult = { blocked: false, category: null };

export class ContactBlockedError extends Error {
	readonly code = 'contact-blocked';
	readonly category: ContactFilterCategory;

	constructor(category: ContactFilterCategory) {
		super('contact-blocked');
		this.name = 'ContactBlockedError';
		this.category = category;
	}
}

export function isContactBlockedError(error: unknown): error is ContactBlockedError {
	return (
		error instanceof ContactBlockedError ||
		(error instanceof Error && error.name === 'ContactBlockedError')
	);
}

function blocked(category: ContactFilterCategory): ContactFilterResult {
	return { blocked: true, category };
}

export function normalizeForContactFilter(input: string): string {
	let folded = '';
	for (const char of input) {
		folded += CONFUSABLE_MAP.get(char) ?? char;
	}
	return folded
		.replace(new RegExp(ZERO_WIDTH_PATTERN.source, 'g'), '')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase();
}

function maskPattern(text: string, pattern: RegExp): string {
	const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
	return text.replace(new RegExp(pattern.source, flags), (match) => ' '.repeat(match.length));
}

function digitCount(value: string): number {
	return value.match(/\d/g)?.length ?? 0;
}

function hasCommaPhone(text: string): boolean {
	const matches = text.match(new RegExp(COMMA_PHONE_PATTERN.source, 'g')) ?? [];
	return matches.some((candidate) => {
		if (THOUSANDS_PATTERN.test(candidate)) return false;
		const digits = digitCount(candidate);
		return digits >= PHONE_MIN_DIGITS && digits <= PHONE_MAX_GROUPED_DIGITS;
	});
}

function hasGroupedPhone(text: string): boolean {
	const matches = text.match(new RegExp(GROUPED_PHONE_PATTERN.source, 'g')) ?? [];
	return matches.some((candidate) => {
		const digits = digitCount(candidate);
		return digits >= PHONE_MIN_DIGITS && digits <= PHONE_MAX_GROUPED_DIGITS;
	});
}

function hasPhoneNumber(text: string): boolean {
	let masked = text;
	for (const pattern of SAFE_NUMBER_PATTERNS) {
		masked = maskPattern(masked, pattern);
	}
	if (new RegExp(DIGIT_RUN_PATTERN.source).test(masked)) return true;
	if (new RegExp(SPACED_SINGLE_DIGITS_PATTERN.source).test(masked)) return true;
	if (hasGroupedPhone(masked)) return true;
	if (hasCommaPhone(masked)) return true;
	return false;
}

function applyLeet(token: string): string {
	if (token.length < 4) return token;
	if (!/[a-z]/.test(token) || !/[0-9@$]/.test(token)) return token;
	return token.replace(/[013457@$]/g, (char) => LEET_FOLDS[char] ?? char);
}

function wordTokens(light: string): string[] {
	// Hyphens and underscores join a split word ("e-mail", "call-me").
	// Dots stay as separators so "gmail.com" does not become "gmailcom".
	// "what.sapp" and "s.e.v.e.n" are handled by joining tokens below.
	const joinedLetters = light.replace(/([a-z])[_'-]+(?=[a-z])/g, '$1');
	const raw = joinedLetters.split(/[^a-z0-9$]+/).filter(Boolean);
	const collapsed: string[] = [];
	let run: string[] = [];
	const flush = () => {
		if (run.length >= 4) {
			collapsed.push(run.join(''));
		} else if (run.length >= 2 && SHORT_PLATFORM_SET.has(run.join(''))) {
			collapsed.push(run.join(''));
		} else {
			collapsed.push(...run);
		}
		run = [];
	};
	for (const token of raw) {
		if (/^[a-z0-9]$/.test(token)) {
			run.push(token);
			continue;
		}
		flush();
		collapsed.push(token);
	}
	flush();
	return collapsed.map(applyLeet);
}

function platformToken(token: string): string | null {
	if (SHORT_PLATFORM_SET.has(token) || PLATFORM_WORD_SET.has(token)) return token;
	if (token.length > 5 && token.endsWith('s')) {
		const stem = token.slice(0, -1);
		if (PLATFORM_WORD_SET.has(stem)) return stem;
	}
	return null;
}

function signalIsFalseFriend(tokens: string[], index: number): boolean {
	const previous = tokens[index - 1] ?? '';
	const next = tokens[index + 1] ?? '';
	return SIGNAL_PREVIOUS_SET.has(previous) || SIGNAL_NEXT_SET.has(next);
}

function tokensHitPlatform(tokens: string[]): boolean {
	for (let index = 0; index < tokens.length; index += 1) {
		const base = platformToken(tokens[index]);
		if (!base) continue;
		if (base === 'signal' && signalIsFalseFriend(tokens, index)) continue;
		return true;
	}
	for (let index = 0; index < tokens.length; index += 1) {
		const pair = `${tokens[index]}${tokens[index + 1] ?? ''}`;
		const triple = `${pair}${tokens[index + 2] ?? ''}`;
		if (pair.length >= 4 && PLATFORM_WORD_SET.has(pair)) return true;
		if (triple.length >= 4 && PLATFORM_WORD_SET.has(triple)) return true;
	}
	const phraseText = tokens.join(' ');
	return PLATFORM_PHRASES.some((phrase) => new RegExp(`\\b${phrase}\\b`).test(phraseText));
}

function hasPlatformWords(light: string): boolean {
	const withoutStateWa = light.replace(new RegExp(STATE_WA_PATTERN.source, 'gi'), ' ');
	if (tokensHitPlatform(wordTokens(withoutStateWa))) return true;
	if (!withoutStateWa.includes('@')) return false;
	return tokensHitPlatform(wordTokens(withoutStateWa.replace(/@/g, 'a')));
}

function spelledRunInTokens(tokens: string[]): number {
	let best = 0;
	let run = 0;
	for (const token of tokens) {
		if (SPELLED_DIGIT_SET.has(token) || /^\d$/.test(token)) {
			run += 1;
			best = Math.max(best, run);
		} else {
			run = 0;
		}
	}
	return best;
}

function spelledRunInCollapsed(text: string): number {
	let best = 0;
	let run = 0;
	let index = 0;
	while (index < text.length) {
		const found = SPELLED_DIGITS_BY_LENGTH.find((word) => text.startsWith(word, index));
		if (found) {
			run += 1;
			best = Math.max(best, run);
			index += found.length;
			continue;
		}
		run = 0;
		index += 1;
	}
	return best;
}

function hasSpelledPhone(light: string): boolean {
	const tokens = wordTokens(light);
	if (spelledRunInTokens(tokens) >= SPELLED_DIGIT_MIN) return true;
	return tokens.some(
		(token) => token.length >= 6 && spelledRunInCollapsed(token) >= SPELLED_DIGIT_MIN
	);
}

function hasEmail(text: string): boolean {
	return EMAIL_PATTERN.test(text) || OBFUSCATED_EMAIL_PATTERN.test(text);
}

function hasUrl(text: string): boolean {
	return URL_PATTERN.test(text) || BARE_DOMAIN_PATTERN.test(text);
}

function hasHandle(text: string): boolean {
	return (
		AT_HANDLE_PATTERN.test(text) ||
		TELEGRAM_HANDLE_PATTERN.test(text) ||
		WHATSAPP_HANDLE_PATTERN.test(text) ||
		TELEGRAM_DOT_HANDLE_PATTERN.test(text) ||
		WHATSAPP_DOT_HANDLE_PATTERN.test(text) ||
		TELEGRAM_HOST_PATTERN.test(text) ||
		WHATSAPP_HOST_PATTERN.test(text)
	);
}

export function inspectOutgoingMessage(
	text: string,
	mode: ContactFilterMode = 'pre-escrow'
): ContactFilterResult {
	const light = normalizeForContactFilter(text);
	if (!light.trim()) return ALLOWED;

	if (hasHandle(light)) return blocked('handle');
	if (hasPlatformWords(light)) return blocked('platform');

	if (mode === 'pre-escrow') {
		if (hasPhoneNumber(light) || hasSpelledPhone(light)) return blocked('phone');
		if (hasEmail(light)) return blocked('email');
		if (hasUrl(light)) return blocked('url');
	}

	return ALLOWED;
}
