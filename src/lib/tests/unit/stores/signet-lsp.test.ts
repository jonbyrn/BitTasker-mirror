import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	BOT_LSP_PUBKEY,
	FAUCET_IFA_ASSET,
	FROZEN_RGB_FINGERPRINT,
	SIGNET_LSP_URL,
	SIGNET_USDT_ASSET,
	SIGNET_CHANNEL_POLL_MS,
	SIGNET_CHANNEL_WAIT_MS,
	SIGNET_KEEPALIVE_CAP,
	SIGNET_KEEPALIVE_MS,
	SIGNET_INBOUND_RGB,
	SIGNET_INBOUND_SATS,
	confirmLightningAttached,
	discoverSignetLsp,
	keepLspInbound,
	lightningStore,
	payEscrowLightning,
	payableAssetIds,
	peerListedConnected,
	requestLspInbound,
	resetSignetLspForTests,
	signetLspParams,
	waitSignetChannel,
	BLOCKED_LSP_PAYER
} from '$lib/stores/wallet/signet-lsp';

function lspBook(ids: string[]) {
	return {
		ok: true,
		json: async () => ({
			supported_assets: ids.map((asset_id) => ({ asset_id, schema: 'Ifa', ticker: 'LNUSDT' }))
		})
	};
}

describe('signetLspParams', () => {
	it('uses the Signet LSP defaults for a new wallet', () => {
		expect(signetLspParams(null)).toEqual({
			transportEndpoint: 'https://rgb-proxy.utexo.com/json-rpc',
			indexerUrl: 'https://esplora-api.utexo.com',
			proxyUrl: 'wss://ln-gateway-signet.utexo.com',
			lspBaseUrl: SIGNET_LSP_URL,
			enableVirtualChannels: true
		});
		expect(signetLspParams(null)).not.toHaveProperty('lspBearerToken');
		expect(signetLspParams('4bfb7ab5').enableVirtualChannels).toBe(true);
	});

	it('keeps the frozen fingerprint off the LSP', () => {
		const fields = signetLspParams(FROZEN_RGB_FINGERPRINT);
		expect(fields.enableVirtualChannels).toBe(false);
		expect(fields).not.toHaveProperty('lspBaseUrl');
		expect(fields.transportEndpoint).toBe('https://rgb-proxy.utexo.com/json-rpc');
	});
});

describe('discoverSignetLsp', () => {
	it('does not call createLsp for the frozen fingerprint', async () => {
		const createLsp = vi.fn();
		const connect = vi.fn();
		await discoverSignetLsp({
			_manager: { rlnBinding: { walletData: { master_fingerprint: FROZEN_RGB_FINGERPRINT } } },
			createLsp,
			getLspConfig: () => ({ baseUrl: SIGNET_LSP_URL, bearerToken: null })
		});
		expect(createLsp).not.toHaveBeenCalled();
		expect(connect).not.toHaveBeenCalled();
	});

	it('calls createLsp with no peer and does not connect', async () => {
		const connect = vi.fn();
		const createLsp = vi.fn().mockResolvedValue({
			peer: {
				peerPubkey: '02aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
				peerHost: 'lsp-signet.utexo.com',
				peerPort: 9735
			},
			connect
		});
		await discoverSignetLsp({
			_manager: { rlnBinding: { walletData: { master_fingerprint: 'bccd4623' } } },
			getLspConfig: () => ({ baseUrl: SIGNET_LSP_URL, bearerToken: null }),
			createLsp
		});
		expect(createLsp).toHaveBeenCalledOnce();
		expect(createLsp).toHaveBeenCalledWith();
		expect(connect).not.toHaveBeenCalled();
	});

	it('does not connect when get_info returns the bot node', async () => {
		const connect = vi.fn();
		const createLsp = vi.fn().mockResolvedValue({
			peer: {
				peerPubkey: BOT_LSP_PUBKEY,
				peerHost: '49.12.99.77',
				peerPort: 9737
			},
			connect
		});
		await discoverSignetLsp({
			_manager: { rlnBinding: { walletData: { master_fingerprint: 'bccd4623' } } },
			getLspConfig: () => ({ baseUrl: SIGNET_LSP_URL, bearerToken: null }),
			createLsp
		});
		expect(createLsp).toHaveBeenCalledWith();
		expect(connect).not.toHaveBeenCalled();
	});
});

describe('payableAssetIds', () => {
	it('keeps only asset ids from get_info and drops the faucet IFA', () => {
		expect(
			payableAssetIds({
				supported_assets: [
					{ asset_id: FAUCET_IFA_ASSET, ticker: 'USDT' },
					{ asset_id: SIGNET_USDT_ASSET, ticker: 'LNUSDT', schema: 'Ifa', precision: 6 }
				]
			})
		).toEqual([SIGNET_USDT_ASSET]);
		expect(payableAssetIds({ supported_assets: [] })).toEqual([]);
		expect(SIGNET_USDT_ASSET).not.toBe(FAUCET_IFA_ASSET);
	});
});

describe('payEscrowLightning', () => {
	const peer = {
		peerPubkey: '02aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
		peerHost: 'lsp-signet.utexo.com',
		peerPort: 9735
	};
	const invoice = 'rgb:~/~/aa/sb:utxob:escrow-lock';

	beforeEach(() => {
		resetSignetLspForTests();
		confirmLightningAttached();
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(lspBook([SIGNET_USDT_ASSET])));
	});

	afterEach(() => {
		resetSignetLspForTests();
		vi.unstubAllGlobals();
	});

	it('stays not ready when channels are empty', async () => {
		const sendAsset = vi.fn();
		const connect = vi.fn().mockResolvedValue(undefined);
		const waitForChannel = vi.fn().mockRejectedValue(new Error('no channel'));
		const receiveAsset = vi.fn().mockResolvedValue({
			lnInvoice: 'lnbc1inbound',
			rgbInvoice: 'rgb:inbound',
			mappingId: 'map-1'
		});
		const awaitReceiveSettlement = vi.fn().mockResolvedValue('timed_out');
		await discoverSignetLsp({
			_manager: { rlnBinding: { walletData: { master_fingerprint: 'bccd4623' } } },
			getLspConfig: () => ({ baseUrl: SIGNET_LSP_URL, bearerToken: null }),
			createLsp: vi.fn().mockResolvedValue({
				peer,
				sendAsset,
				connect,
				waitForChannel,
				receiveAsset,
				awaitReceiveSettlement
			})
		});
		await vi.waitFor(() => expect(get(lightningStore).channel).toBe('missing'));
		expect(get(lightningStore).ready).toBe(false);
		expect(get(lightningStore).failure).toBe('channel');
		expect(receiveAsset).not.toHaveBeenCalled();
		expect(awaitReceiveSettlement).not.toHaveBeenCalled();
		await expect(payEscrowLightning(invoice, 'rgb:usdt-signet', 11_000_000)).rejects.toThrow(
			'LSP channel is not open'
		);
		expect(connect).toHaveBeenCalledOnce();
		expect(waitForChannel).toHaveBeenCalledWith(
			SIGNET_USDT_ASSET,
			expect.objectContaining({
				timeoutMs: SIGNET_CHANNEL_WAIT_MS,
				pollIntervalMs: SIGNET_CHANNEL_POLL_MS
			})
		);
		expect(sendAsset).not.toHaveBeenCalled();
		const inbound = await requestLspInbound();
		expect(inbound).toBe('lnbc1inbound');
		expect(receiveAsset).toHaveBeenCalledWith({
			assetId: SIGNET_USDT_ASSET,
			amountSats: SIGNET_INBOUND_SATS,
			amountRgb: SIGNET_INBOUND_RGB
		});
		expect(FAUCET_IFA_ASSET).not.toBe(receiveAsset.mock.calls[0]?.[0]?.assetId);
		await vi.waitFor(() => expect(awaitReceiveSettlement).toHaveBeenCalled());
		expect(awaitReceiveSettlement).toHaveBeenCalledWith('lnbc1inbound', {
			timeoutMs: SIGNET_CHANNEL_WAIT_MS,
			pollIntervalMs: SIGNET_CHANNEL_POLL_MS
		});
		expect(SIGNET_CHANNEL_POLL_MS).toBe(15_000);
	});

	it('does not call receiveAsset when get_info only lists the faucet IFA', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(lspBook([FAUCET_IFA_ASSET])));
		const receiveAsset = vi.fn();
		const sendAsset = vi.fn();
		await discoverSignetLsp({
			_manager: { rlnBinding: { walletData: { master_fingerprint: 'bccd4623' } } },
			getLspConfig: () => ({ baseUrl: SIGNET_LSP_URL, bearerToken: null }),
			createLsp: vi.fn().mockResolvedValue({ peer, sendAsset, receiveAsset, connect: vi.fn() })
		});
		expect(receiveAsset).not.toHaveBeenCalled();
		expect(get(lightningStore).ready).toBe(false);
		expect(get(lightningStore).lnInvoice).toBe('');
		expect(sendAsset).not.toHaveBeenCalled();
		keepLspInbound('lnbc1kept', 'rgb:vDU5IB7L-kept');
		expect(receiveAsset).not.toHaveBeenCalled();
		expect(get(lightningStore).lnInvoice).toBe('lnbc1kept');
		expect(get(lightningStore).rgbInvoice).toBe('rgb:vDU5IB7L-kept');
		expect(get(lightningStore).ready).toBe(false);
	});

	it('calls connectPeer once per page', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		try {
			const sendAsset = vi.fn();
			const connect = vi.fn().mockResolvedValue(undefined);
			const waitForChannel = vi.fn().mockResolvedValue({ ready: true });
			await discoverSignetLsp({
				_manager: { rlnBinding: { walletData: { master_fingerprint: 'bccd4623' } } },
				getLspConfig: () => ({ baseUrl: SIGNET_LSP_URL, bearerToken: null }),
				createLsp: vi.fn().mockResolvedValue({ peer, sendAsset, connect, waitForChannel })
			});
			expect(connect).toHaveBeenCalledOnce();
			await vi.advanceTimersByTimeAsync(SIGNET_KEEPALIVE_MS);
			expect(connect).toHaveBeenCalledOnce();
			expect(SIGNET_KEEPALIVE_MS).toBe(15_000);
		} finally {
			vi.useRealTimers();
		}
	});

	it('does not open another socket while listPeers still shows the LSP', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		try {
			const sendAsset = vi.fn();
			const connect = vi.fn().mockResolvedValue(undefined);
			const listPeers = vi.fn().mockResolvedValue([{ pubkey: peer.peerPubkey, isConnected: true }]);
			const waitForChannel = vi.fn().mockResolvedValue({ ready: true });
			await discoverSignetLsp({
				_manager: { rlnBinding: { walletData: { master_fingerprint: 'bccd4623' } } },
				getLspConfig: () => ({ baseUrl: SIGNET_LSP_URL, bearerToken: null }),
				createLsp: vi.fn().mockResolvedValue({
					peer,
					sendAsset,
					connect,
					waitForChannel,
					wallet: { listPeers }
				})
			});
			expect(connect).toHaveBeenCalledOnce();
			await vi.advanceTimersByTimeAsync(SIGNET_KEEPALIVE_MS);
			await vi.waitFor(() => expect(listPeers).toHaveBeenCalled());
			expect(connect).toHaveBeenCalledOnce();
			expect(
				peerListedConnected([{ pubkey: peer.peerPubkey, isConnected: false }], peer.peerPubkey)
			).toBe(false);
		} finally {
			vi.useRealTimers();
		}
	});

	it('does not open a second socket after the handshake fails', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		try {
			const sendAsset = vi.fn();
			const connect = vi
				.fn()
				.mockRejectedValue(new Error('peer handshake did not complete within timeout'));
			await discoverSignetLsp({
				_manager: { rlnBinding: { walletData: { master_fingerprint: 'bccd4623' } } },
				getLspConfig: () => ({ baseUrl: SIGNET_LSP_URL, bearerToken: null }),
				createLsp: vi.fn().mockResolvedValue({ peer, sendAsset, connect })
			});
			expect(get(lightningStore).failure).toBe('connect');
			await vi.advanceTimersByTimeAsync(SIGNET_KEEPALIVE_MS * SIGNET_KEEPALIVE_CAP);
			expect(connect).toHaveBeenCalledOnce();
		} finally {
			vi.useRealTimers();
		}
	});

	it('pays only after waitForChannel returns', async () => {
		const sendAsset = vi
			.fn()
			.mockResolvedValue({ lnInvoice: 'lnbc1', sendResult: { txid: 'pay-1' } });
		const connect = vi.fn().mockResolvedValue(undefined);
		const waitForChannel = vi.fn().mockResolvedValue({ ready: true });
		await discoverSignetLsp({
			_manager: { rlnBinding: { walletData: { master_fingerprint: 'bccd4623' } } },
			getLspConfig: () => ({ baseUrl: SIGNET_LSP_URL, bearerToken: null }),
			createLsp: vi.fn().mockResolvedValue({ peer, sendAsset, connect, waitForChannel })
		});
		await waitSignetChannel();
		await payEscrowLightning(invoice, 'rgb:usdt-signet', 11_000_000);
		expect(waitForChannel).toHaveBeenCalledWith(
			SIGNET_USDT_ASSET,
			expect.objectContaining({
				timeoutMs: SIGNET_CHANNEL_WAIT_MS,
				pollIntervalMs: SIGNET_CHANNEL_POLL_MS
			})
		);
		expect(sendAsset).toHaveBeenCalledWith({
			rgbInvoice: invoice,
			ln: {
				amtMsat: 3_000_000,
				expirySec: 3600,
				assetId: 'rgb:usdt-signet',
				assetAmount: 11_000_000
			}
		});
	});

	it('records a connect failure instead of staying on setting up', async () => {
		const sendAsset = vi.fn();
		const connect = vi
			.fn()
			.mockRejectedValue(new TypeError('this.requireNode(...).connectPeer is not a function'));
		await discoverSignetLsp({
			_manager: { rlnBinding: { walletData: { master_fingerprint: 'bccd4623' } } },
			getLspConfig: () => ({ baseUrl: SIGNET_LSP_URL, bearerToken: null }),
			createLsp: vi.fn().mockResolvedValue({ peer, sendAsset, connect })
		});
		expect(connect).toHaveBeenCalledOnce();
		expect(get(lightningStore).failure).toBe('connect');
		expect(get(lightningStore).ready).toBe(false);
		expect(get(lightningStore).channel).toBe('idle');
		expect(sendAsset).not.toHaveBeenCalled();
	});

	it('does not connect or pay the bot node', async () => {
		const sendAsset = vi.fn();
		const connect = vi.fn();
		await discoverSignetLsp({
			_manager: { rlnBinding: { walletData: { master_fingerprint: 'bccd4623' } } },
			getLspConfig: () => ({ baseUrl: SIGNET_LSP_URL, bearerToken: null }),
			createLsp: vi.fn().mockResolvedValue({
				peer: { peerPubkey: BOT_LSP_PUBKEY, peerHost: '49.12.99.77', peerPort: 9737 },
				sendAsset,
				connect
			})
		});
		await expect(payEscrowLightning(invoice, 'rgb:usdt-signet', 1)).rejects.toThrow(
			'Lightning wallet is not ready'
		);
		expect(connect).not.toHaveBeenCalled();
		expect(sendAsset).not.toHaveBeenCalled();
	});

	it('does not connect or pay the old localhost receiver', async () => {
		const sendAsset = vi.fn();
		const connect = vi.fn();
		await discoverSignetLsp({
			_manager: { rlnBinding: { walletData: { master_fingerprint: BLOCKED_LSP_PAYER } } },
			getLspConfig: () => ({ baseUrl: SIGNET_LSP_URL, bearerToken: null }),
			createLsp: vi.fn().mockResolvedValue({ peer, sendAsset, connect })
		});
		await expect(payEscrowLightning(invoice, 'rgb:usdt-signet', 1)).rejects.toThrow(
			'Lightning wallet is not ready'
		);
		expect(connect).not.toHaveBeenCalled();
		expect(sendAsset).not.toHaveBeenCalled();
	});
});
