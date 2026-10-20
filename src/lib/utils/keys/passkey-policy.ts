/**
 * Passkey prompts are allowed only inside an explicit user action:
 * login, unlock, funding, or escrow. Page loads must not call WebAuthn.
 */
export type PasskeyPromptReason = 'login' | 'unlock' | 'funding' | 'escrow';

export const PASSKEY_UNLOCK_REQUIRED = 'PASSKEY_UNLOCK_REQUIRED';

let promptDepth = 0;

export function passkeyPromptAllowed(): boolean {
	return promptDepth > 0;
}

export async function withPasskeyPrompt<T>(
	_reason: PasskeyPromptReason,
	fn: () => Promise<T>
): Promise<T> {
	promptDepth += 1;
	try {
		return await fn();
	} finally {
		promptDepth -= 1;
	}
}

export function mayPromptForPasskey(interactive?: boolean): boolean {
	return Boolean(interactive) || passkeyPromptAllowed();
}
