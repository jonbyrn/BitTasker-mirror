import * as fs from 'fs';
import * as path from 'path';

/**
 * CDP WebAuthn credential shape (from chromedevtools.github.io/devtools-protocol/tot/WebAuthn).
 * Used for persisting and loading credentials across E2E test files.
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

/** Persisted file format for cross-file/cross-run reuse. */
export type WebAuthnCredentialsFile = {
	credentials: WebAuthnCredential[];
	exportedAt?: string;
};

/** Path to the shared credential file (project-root relative). Used by signup-login-auth and passkey-auth-from-file. */
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

/**
 * Read credentials from the shared file. Returns null if file is missing or invalid.
 */
export function readWebAuthnCredentialsFromFile(): WebAuthnCredential[] | null {
	try {
		const p = getWebAuthnCredentialsPath();
		if (!fs.existsSync(p)) return null;
		const raw = fs.readFileSync(p, 'utf-8');
		const data = JSON.parse(raw) as WebAuthnCredentialsFile;
		if (!Array.isArray(data?.credentials)) return null;
		return data.credentials;
	} catch {
		return null;
	}
}

/**
 * Write credentials to the shared file. Ensures directory exists.
 */
export function writeWebAuthnCredentialsToFile(credentials: WebAuthnCredential[]): void {
	if (credentials.length === 0) return;
	const p = getWebAuthnCredentialsPath();
	const dir = path.dirname(p);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	const data: WebAuthnCredentialsFile = {
		credentials,
		exportedAt: new Date().toISOString()
	};
	fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');
}
