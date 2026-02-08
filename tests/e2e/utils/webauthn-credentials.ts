import * as fs from 'fs';
import * as path from 'path';

/**
 * CDP WebAuthn credential shape (from chromedevtools.github.io/devtools-protocol/tot/WebAuthn).
 */
export type WebAuthnCredential = {
	credentialId: string;
	isResidentCredential: boolean;
	rpId: string;
	privateKey: string;
	userHandle?: string;
	signCount: number;
	largeBlob?: string;
	backupEligibility?: boolean;
	backupState?: boolean;
	userName?: string;
	userDisplayName?: string;
};

/** One user's credentials (e.g. one passkey per user). */
export type CredentialSet = {
	label: string;
	credentials: WebAuthnCredential[];
};

/** File format: supports multiple users (signup, nostr, etc.). */
export type WebAuthnCredentialsFile = {
	credentialSets: CredentialSet[];
	exportedAt?: string;
};

/** Legacy format (single list); we migrate on read. */
type LegacyCredentialsFile = {
	credentials?: WebAuthnCredential[];
	exportedAt?: string;
};

const DEFAULT_LABEL = 'signup';

export function getWebAuthnCredentialsPath(): string {
	const root = process.cwd();
	return path.join(root, 'tests', 'e2e', '.auth', 'webauthn-credentials.json');
}

export function webauthnCredentialsFileExists(): boolean {
	try {
		const p = getWebAuthnCredentialsPath();
		return fs.existsSync(p) && fs.statSync(p).isFile();
	} catch {
		return false;
	}
}

function readRaw(): WebAuthnCredentialsFile | null {
	try {
		const p = getWebAuthnCredentialsPath();
		if (!fs.existsSync(p)) return null;
		const raw = fs.readFileSync(p, 'utf-8');
		const data = JSON.parse(raw) as WebAuthnCredentialsFile | LegacyCredentialsFile;
		// Legacy: { credentials: [...] } → one set with default label
		if (data && 'credentials' in data && Array.isArray((data as LegacyCredentialsFile).credentials)) {
			const leg = data as LegacyCredentialsFile;
			return {
				credentialSets: [{ label: DEFAULT_LABEL, credentials: leg.credentials ?? [] }],
				exportedAt: leg.exportedAt
			};
		}
		if (data && Array.isArray((data as WebAuthnCredentialsFile).credentialSets)) {
			return data as WebAuthnCredentialsFile;
		}
		return null;
	} catch {
		return null;
	}
}

/**
 * Read one credential set by label (e.g. 'signup', 'nostr'). Returns null if missing.
 */
export function readCredentialSet(label: string): WebAuthnCredential[] | null {
	const file = readRaw();
	if (!file) return null;
	const set = file.credentialSets.find((s) => s.label === label);
	return set?.credentials?.length ? set.credentials : null;
}

/**
 * Read first available credential set (for default/first user).
 */
export function readFirstCredentialSet(): WebAuthnCredential[] | null {
	const file = readRaw();
	if (!file?.credentialSets?.length) return null;
	const first = file.credentialSets[0];
	return first?.credentials?.length ? first.credentials : null;
}

/** All labels in the file. */
export function getCredentialSetLabels(): string[] {
	const file = readRaw();
	if (!file?.credentialSets) return [];
	return file.credentialSets.map((s) => s.label);
}

const USERNAME_DOMAIN_SUFFIX = '@bittasker.com';

/**
 * Return the username part for a credential set (e.g. 'signup', 'nostr').
 * Strips the @bittasker.com suffix from the first credential's userName.
 * Returns null if the set is missing or userName has no known format.
 */
export function getUsernameForLabel(label: string): string | null {
	const credentials = readCredentialSet(label);
	if (!credentials?.length) return null;
	const userName = credentials[0].userName;
	if (!userName || typeof userName !== 'string') return null;
	if (userName.endsWith(USERNAME_DOMAIN_SUFFIX)) {
		return userName.slice(0, -USERNAME_DOMAIN_SUFFIX.length);
	}
	return userName;
}

/**
 * Write or replace one credential set by label. Merges with existing sets.
 */
export function writeCredentialSet(label: string, credentials: WebAuthnCredential[]): void {
	if (credentials.length === 0) return;
	const dir = path.dirname(getWebAuthnCredentialsPath());
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	const existing = readRaw();
	const sets = existing?.credentialSets ?? [];
	const without = sets.filter((s) => s.label !== label);
	const next: WebAuthnCredentialsFile = {
		credentialSets: [...without, { label, credentials }],
		exportedAt: new Date().toISOString()
	};
	fs.writeFileSync(getWebAuthnCredentialsPath(), JSON.stringify(next, null, 2), 'utf-8');
}

/**
 * Read credentials (backward compat + default). Prefers first set if no label.
 */
export function readWebAuthnCredentialsFromFile(label?: string): WebAuthnCredential[] | null {
	if (label) return readCredentialSet(label);
	return readFirstCredentialSet();
}

/**
 * Write credentials (backward compat: writes as default label).
 */
export function writeWebAuthnCredentialsToFile(credentials: WebAuthnCredential[]): void {
	writeCredentialSet(DEFAULT_LABEL, credentials);
}
