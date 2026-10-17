import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	GATEWAY_SOCKET_CAP,
	allowRepeatedLog,
	gatewaySocketsOpened,
	installGatewayGuard,
	isGatewaySocketUrl,
	resetGatewayGuardForTests
} from '$lib/stores/wallet/gateway-guard';

describe('gateway socket cap', () => {
	afterEach(() => {
		resetGatewayGuardForTests();
		vi.unstubAllGlobals();
	});

	it('recognises the signet gateway and not the app socket', () => {
		expect(
			isGatewaySocketUrl('wss://ln-gateway-signet.utexo.com/v1/lsp-signet_utexo_com/9735')
		).toBe(true);
		expect(isGatewaySocketUrl('wss://api-staging.bittasker.com/socket.io/')).toBe(false);
	});

	it('allows a few gateway sockets and then refuses the rest', () => {
		class NativeSocket {
			url: string;
			constructor(url: string) {
				this.url = url;
			}
		}
		vi.stubGlobal('WebSocket', NativeSocket);
		let hits = 0;
		installGatewayGuard(() => {
			hits += 1;
		});
		const Socket = window.WebSocket as unknown as new (url: string) => { url: string };
		for (let i = 0; i < GATEWAY_SOCKET_CAP; i += 1) {
			const socket = new Socket('wss://ln-gateway-signet.utexo.com/v1/lsp-signet_utexo_com/9735');
			expect(socket.url).toContain('ln-gateway-signet');
		}
		expect(
			() => new Socket('wss://ln-gateway-signet.utexo.com/v1/lsp-signet_utexo_com/9735')
		).toThrow(/socket cap/);
		expect(hits).toBe(1);
		expect(gatewaySocketsOpened()).toBe(GATEWAY_SOCKET_CAP + 1);
		const other = new Socket('wss://api-staging.bittasker.com/socket.io/');
		expect(other.url).toContain('bittasker');
	});

	it('prints a repeated gateway line once', () => {
		const line =
			'[rln-wasm-sdk peer-session] start ws_url=wss://ln-gateway-signet.utexo.com/v1/x?auth_token=secret';
		expect(allowRepeatedLog(line)).toBe(true);
		expect(allowRepeatedLog(line.replace('secret', 'other'))).toBe(false);
		expect(allowRepeatedLog('[wallet-lsp] connected')).toBe(true);
	});
});
