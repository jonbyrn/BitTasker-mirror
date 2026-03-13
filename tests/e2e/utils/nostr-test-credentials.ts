import * as fs from 'fs';
import * as path from 'path';

export type NostrCredentialSet = {
	label: string;
	nsec: string;
	npub?: string;
};

type NostrCredentialsFile = {
	credentialSets: NostrCredentialSet[];
	exportedAt?: string;
};

export function getNostrCredentialsPath(): string {
	return path.join(process.cwd(), 'tests', 'e2e', '.auth', 'nostr-credentials.json');
}

export function nostrCredentialsFileExists(): boolean {
	try {
		const file = getNostrCredentialsPath();
		return fs.existsSync(file) && fs.statSync(file).isFile();
	} catch {
		return false;
	}
}

function readRaw(): NostrCredentialsFile | null {
	try {
		const file = getNostrCredentialsPath();
		if (!fs.existsSync(file)) return null;
		const raw = fs.readFileSync(file, 'utf-8');
		const parsed = JSON.parse(raw) as NostrCredentialsFile;
		if (!Array.isArray(parsed.credentialSets)) return null;
		return parsed;
	} catch {
		return null;
	}
}

export function readNostrCredentialSet(label: string): NostrCredentialSet | null {
	const file = readRaw();
	if (!file) return null;
	return file.credentialSets.find((entry) => entry.label === label) ?? null;
}

export function writeNostrCredentialSet(entry: NostrCredentialSet): void {
	const filePath = getNostrCredentialsPath();
	const dir = path.dirname(filePath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}

	const existing = readRaw();
	const withoutCurrent = (existing?.credentialSets ?? []).filter(
		(item) => item.label !== entry.label
	);
	const next: NostrCredentialsFile = {
		credentialSets: [...withoutCurrent, entry],
		exportedAt: new Date().toISOString()
	};

	fs.writeFileSync(filePath, JSON.stringify(next, null, 2), 'utf-8');
}
