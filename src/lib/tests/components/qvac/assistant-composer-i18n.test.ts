import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { addMessages, locale } from 'svelte-i18n';
import { render, screen } from '@testing-library/svelte';
import ChatView from '$lib/components/messages/ChatView.svelte';
import { ESSENTIAL_NAMESPACES } from '$lib/i18n/i18n';

vi.mock('$lib/nostr/direct-messages', () => ({
	assertDirectMessageAllowed: vi.fn(async () => undefined),
	getMessageHistory: vi.fn(async () => []),
	isContactBlockedError: () => false,
	sendDirectMessage: vi.fn(),
	listenForIncomingMessages: vi.fn(() => () => undefined),
	parseDMEvent: vi.fn()
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNostrKeyPair: vi.fn(),
	prepareSigner: vi.fn(),
	signerReady: () => false
}));

vi.mock('$lib/utils/helpers/biometrics', () => ({
	getBiometricData: vi.fn(),
	prefetchPasskeyChallenge: vi.fn()
}));

vi.mock('$lib/utils/helpers/mnemonic', () => ({
	getMnemonic: vi.fn()
}));

vi.mock('$lib/utils/helpers/passkey-prompt', () => ({
	SignerLockedError: class SignerLockedError extends Error {},
	isPasskeyPromptError: () => false,
	passkeyErrorText: () => '',
	passkeyPromptSuppressed: () => false
}));

vi.mock('$lib/qvac/assistant-client', () => ({
	maybeReply: vi.fn()
}));

vi.mock('$lib/services/feature-flags', () => ({
	isQvacEnabled: () => true
}));

vi.mock('$lib/components/messages/ChatMessage.svelte', () => ({
	default: vi.fn(() => ({ $$: { ctx: [] } }))
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		showErrorToast: vi.fn(),
		subscribe: (run: (value: unknown) => void) => {
			run({});
			return () => undefined;
		}
	}
}));

const RAW_KEYS = ['messages.type_message_placeholder', 'messages.send_message'];

function messagesFor(language: 'en' | 'es') {
	return JSON.parse(readFileSync(`static/locales/${language}/dashboard/messages.json`, 'utf8')) as {
		messages: { type_message_placeholder: string; send_message: string };
	};
}

beforeAll(async () => {
	addMessages('en', messagesFor('en'));
	addMessages('es', messagesFor('es'));
	await locale.set('en');
});

async function composer(language: 'en' | 'es') {
	await locale.set(language);
	const view = render(ChatView, { recipientPubkey: 'ab'.repeat(32) });
	const input = await screen.findByTestId('chat-input');
	const send = await screen.findByTestId('chat-send');
	return { view, input, send };
}

describe('assistant composer copy', () => {
	it('loads the message composer with the first paint, not only on /messages', () => {
		expect(ESSENTIAL_NAMESPACES).toContain('dashboard/messages');
	});

	it('renders English placeholder and send text instead of the raw keys', async () => {
		const copy = messagesFor('en').messages;
		const { view, input, send } = await composer('en');
		expect(input).toHaveAttribute('placeholder', copy.type_message_placeholder);
		expect(send).toHaveTextContent(copy.send_message);
		expect(send).toHaveAttribute('aria-label', copy.send_message);
		for (const key of RAW_KEYS) {
			expect(input).not.toHaveAttribute('placeholder', key);
			expect(send).not.toHaveTextContent(key);
		}
		expect(copy.type_message_placeholder).not.toBe(RAW_KEYS[0]);
		expect(copy.send_message).not.toBe(RAW_KEYS[1]);
		view.unmount();
	});

	it('renders Spanish placeholder and send text instead of the raw keys', async () => {
		const copy = messagesFor('es').messages;
		const { view, input, send } = await composer('es');
		expect(input).toHaveAttribute('placeholder', copy.type_message_placeholder);
		expect(send).toHaveTextContent(copy.send_message);
		expect(send).toHaveAttribute('aria-label', copy.send_message);
		for (const key of RAW_KEYS) {
			expect(input).not.toHaveAttribute('placeholder', key);
			expect(send).not.toHaveTextContent(key);
		}
		expect(copy.type_message_placeholder).not.toBe(RAW_KEYS[0]);
		expect(copy.send_message).not.toBe(RAW_KEYS[1]);
		view.unmount();
	});
});
