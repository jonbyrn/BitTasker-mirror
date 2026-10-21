import { describe, expect, it, vi } from 'vitest';
import { safeSocketSend } from '$lib/utils/relayUrls';

describe('safeSocketSend', () => {
	it('does not send after the socket has started closing', () => {
		const send = vi.fn();
		const socket = {
			readyState: WebSocket.CLOSING,
			send
		} as unknown as WebSocket;
		expect(safeSocketSend(socket, '["REQ"]')).toBe(false);
		expect(send).not.toHaveBeenCalled();
	});

	it('swallows a send that races a close', () => {
		const socket = {
			readyState: WebSocket.OPEN,
			send: () => {
				throw new Error('WebSocket is already in CLOSING or CLOSED state');
			}
		} as unknown as WebSocket;
		expect(safeSocketSend(socket, '["REQ"]')).toBe(false);
	});

	it('sends while the socket is open', () => {
		const send = vi.fn();
		const socket = { readyState: WebSocket.OPEN, send } as unknown as WebSocket;
		expect(safeSocketSend(socket, '["REQ"]')).toBe(true);
		expect(send).toHaveBeenCalledWith('["REQ"]');
	});
});
