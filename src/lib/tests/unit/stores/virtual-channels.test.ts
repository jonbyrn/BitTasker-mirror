import { describe, expect, it, vi } from 'vitest';
import {
	SIGNET_LSP_PUBKEY,
	armVirtualChannels,
	providerVirtualPeers,
	virtualChannelFields
} from '$lib/stores/wallet/virtual-channels';

const PROVIDER = '02a621de2b3d86d3e618ca847bab220304320f0af58ea3f5e295257db32502366a';

describe('virtualChannelFields', () => {
	it('enables virtual channels and keeps the provider key before start', () => {
		expect(virtualChannelFields(true, [PROVIDER])).toEqual({
			enableVirtualChannels: true,
			enableVirtualChannelsV0: true,
			virtualPeerPubkeys: [PROVIDER]
		});
	});

	it('uses the known signet provider when the lookup key is empty', () => {
		expect(virtualChannelFields(true, ['']).virtualPeerPubkeys).toEqual([SIGNET_LSP_PUBKEY]);
	});
});

describe('providerVirtualPeers', () => {
	it('reads the provider pubkey from get_info', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ pubkey: PROVIDER })
			})
		);
		await expect(providerVirtualPeers()).resolves.toEqual([PROVIDER]);
		vi.unstubAllGlobals();
	});

	it('falls back to the known signet provider when get_info fails', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
		await expect(providerVirtualPeers()).resolves.toEqual([SIGNET_LSP_PUBKEY]);
		vi.unstubAllGlobals();
	});
});

describe('armVirtualChannels', () => {
	it('sets the flag and the provider key before unlock', () => {
		const setEnableVirtualChannelsV0 = vi.fn();
		const setVirtualPeerPubkeys = vi.fn();
		const wallet = {
			_manager: {
				rlnBinding: {
					nodeHandle: { setEnableVirtualChannelsV0, setVirtualPeerPubkeys }
				}
			}
		};
		armVirtualChannels(wallet, [PROVIDER]);
		expect(setEnableVirtualChannelsV0).toHaveBeenCalledWith(true);
		expect(setVirtualPeerPubkeys).toHaveBeenCalledWith([PROVIDER]);
	});
});
