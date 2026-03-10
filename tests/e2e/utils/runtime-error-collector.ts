import type { ConsoleMessage, Page } from '@playwright/test';

export type RuntimeErrorRecord = {
	source: 'console' | 'pageerror';
	message: string;
	timestamp: number;
};

export type RuntimeErrorCollector = {
	entries: () => RuntimeErrorRecord[];
	messages: () => string[];
	clear: () => void;
	hasMatches: () => boolean;
	dispose: () => void;
};

const EXPLICIT_RUNTIME_PATTERNS = [
	/wallet\.error\.initialization_failed/i,
	/initialization failed/i,
	/wallet(?:\s+|[-_.])?(?:init|initialization).*(?:failed|error|exception)/i,
	/auth(?:entication)?(?:\s+runtime)?\s+(?:failed|error|exception)/i,
	/failed to authenticate/i,
	/passkey.*(?:failed|error|exception)/i,
	/webauthn.*(?:failed|error|exception)/i
];

function isWalletOrAuthRuntimeFailure(message: string): boolean {
	return EXPLICIT_RUNTIME_PATTERNS.some((pattern) => pattern.test(message));
}

function pushIfMatch(
	records: RuntimeErrorRecord[],
	source: RuntimeErrorRecord['source'],
	message: string
): void {
	if (!isWalletOrAuthRuntimeFailure(message)) return;
	records.push({
		source,
		message,
		timestamp: Date.now()
	});
}

function formatConsoleMessage(msg: ConsoleMessage): string {
	return `[${msg.type()}] ${msg.text()}`;
}

export function attachRuntimeErrorCollector(page: Page): RuntimeErrorCollector {
	const records: RuntimeErrorRecord[] = [];

	const onConsole = (msg: ConsoleMessage) => {
		const formatted = formatConsoleMessage(msg);
		pushIfMatch(records, 'console', formatted);
	};

	const onPageError = (error: Error) => {
		pushIfMatch(records, 'pageerror', error?.message ?? String(error));
	};

	page.on('console', onConsole);
	page.on('pageerror', onPageError);

	return {
		entries: () => records.slice(),
		messages: () => records.map((record) => record.message),
		clear: () => {
			records.length = 0;
		},
		hasMatches: () => records.length > 0,
		dispose: () => {
			page.off('console', onConsole);
			page.off('pageerror', onPageError);
		}
	};
}
