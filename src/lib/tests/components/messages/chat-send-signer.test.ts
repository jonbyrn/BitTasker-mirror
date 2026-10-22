import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { appStore } from '$lib/stores/app.store';

const getBiometricData = vi.hoisted(() => vi.fn());
const sendDirectMessage = vi.hoisted(() =>
	vi.fn(async () => ({
		id: 'evt-1',
		pubkey: 'aa'.repeat(32),
		tags: [] as string[][],
		created_at: 1,
		content: '',
		kind: 14,
		sig: 'sig'
	}))
);

vi.mock('$app/state', () => ({
	page: {
		url: new URL('http://localhost/messages/to/abc'),
		route: { id: '/(app)/(protected)/messages/to/[pubkey]' },
		params: { pubkey: 'abc' },
		data: {}
	}
}));

vi.mock('$lib/utils/helpers/biometrics', () => ({
	getBiometricData: (...args: unknown[]) => getBiometricData(...args),
	prefetchPasskeyChallenge: vi.fn()
}));

vi.mock('$lib/nostr/direct-messages', () => ({
	assertDirectMessageAllowed: vi.fn(async () => undefined),
	getMessageHistory: vi.fn(async () => []),
	isContactBlockedError: () => false,
	sendDirectMessage: (...args: unknown[]) => sendDirectMessage(...args),
	listenForIncomingMessages: vi.fn(() => () => undefined),
	parseDMEvent: vi.fn()
}));

vi.mock('$lib/nostr/ndk', () => ({
	syncNdkSignerFromAppStore: vi.fn(async () => undefined)
}));

vi.mock('$lib/qvac/assistant-client', () => ({
	maybeReply: vi.fn(async () => 'ok'),
	assistantContact: vi.fn(async () => null)
}));

import ChatView from '$lib/components/messages/ChatView.svelte';

const npub = 'ab'.repeat(32);

describe('DM send session signer', () => {
	beforeEach(() => {
		vi.stubEnv('VITE_E2E_TEST', '');
		vi.stubEnv('VITE_E2E_TURNSTILE_BYPASS', '');
		vi.stubEnv('VITE_SKIP_PASSKEY', '');
		vi.stubEnv('VITE_QVAC_ENABLED', '');
		getBiometricData.mockClear();
		sendDirectMessage.mockClear();
		appStore.update((state) => ({
			...state,
			nostrKeys: { nsec: null, npub: null, mnemonic: null },
			biometricData: null
		}));
	});

	async function sendHello(): Promise<void> {
		render(ChatView, { props: { recipientPubkey: npub } });
		const input = await screen.findByTestId('chat-input');
		await fireEvent.input(input, { target: { value: 'hello' } });
		await fireEvent.click(screen.getByTestId('chat-send'));
	}

	it('does not open WebAuthn when the session signer is already unlocked', async () => {
		appStore.update((state) => ({
			...state,
			nostrKeys: { ...state.nostrKeys, nsec: new Uint8Array(32).fill(7), npub }
		}));
		await sendHello();
		await vi.waitFor(() => expect(sendDirectMessage).toHaveBeenCalled());
		expect(getBiometricData).not.toHaveBeenCalled();
		expect(screen.queryByTestId('chat-unlock-key')).toBeNull();
		expect(get(appStore).nostrKeys.npub).toBe(npub);
	});

	it('does not open WebAuthn on send when the session signer is missing', async () => {
		await sendHello();
		await vi.waitFor(() => expect(sendDirectMessage).not.toHaveBeenCalled());
		expect(getBiometricData).not.toHaveBeenCalled();
		expect(screen.queryByTestId('chat-unlock-key')).toBeNull();
		expect(document.body.textContent ?? '').not.toMatch(/nsec/i);
	});
});
