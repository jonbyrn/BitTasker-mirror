import * as fs from 'fs';
import * as path from 'path';

const FILENAME = 'e2e-last-message.json';

function getE2ELastMessagePath(): string {
	const root = process.cwd();
	return path.join(root, 'tests', 'e2e', '.auth', FILENAME);
}

/** Write the last E2E test message so the receive test can look for it. */
export function writeLastE2EMessage(message: string): void {
	const p = getE2ELastMessagePath();
	const dir = path.dirname(p);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	fs.writeFileSync(p, JSON.stringify({ message, writtenAt: new Date().toISOString() }), 'utf-8');
}

/** Read the last E2E test message (from the send test). Returns null if missing. */
export function readLastE2EMessage(): string | null {
	try {
		const p = getE2ELastMessagePath();
		if (!fs.existsSync(p)) return null;
		const data = JSON.parse(fs.readFileSync(p, 'utf-8')) as { message?: string };
		return typeof data?.message === 'string' ? data.message : null;
	} catch {
		return null;
	}
}
