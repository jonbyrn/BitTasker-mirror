import { describe, expect, it } from 'vitest';
import { BOT_LSP_PUBKEY } from '$lib/stores/wallet/signet-lsp';
import { ESCROW_LNUSDT } from '$lib/services/rgb/escrow-rail';
import {
	HOSTED_LSP_CHANNEL_SATS,
	MIN_MANUAL_CHANNEL_SATS,
	lightningUxStatus,
	mainnetLightningConfig,
	planManualChannel,
	summarizeChannelBalances
} from '$lib/stores/wallet/lightning-status';

describe('lightningUxStatus', () => {
	it('asks for the hosted channel amount when on-chain bitcoin is short', () => {
		expect(lightningUxStatus({ ready: false, channel: 'waiting', onchainSats: 50_000 })).toEqual({
			status: 'needs_funding',
			satsNeeded: HOSTED_LSP_CHANNEL_SATS - 50_000
		});
	});

	it('says setting up once the wallet can cover the hosted channel', () => {
		expect(
			lightningUxStatus({ ready: false, channel: 'waiting', onchainSats: HOSTED_LSP_CHANNEL_SATS })
		).toEqual({ status: 'setting_up', satsNeeded: 0 });
	});

	it('says ready when the channel is open', () => {
		expect(lightningUxStatus({ ready: true, channel: 'open', onchainSats: 0 })).toEqual({
			status: 'ready',
			satsNeeded: 0
		});
	});

	it('stops saying setting up when attach or the channel fails', () => {
		expect(
			lightningUxStatus({
				ready: false,
				channel: 'idle',
				onchainSats: 299_245,
				failure: 'connect'
			})
		).toEqual({ status: 'failed', satsNeeded: 0 });
		expect(lightningUxStatus({ ready: false, channel: 'missing', onchainSats: 299_245 })).toEqual({
			status: 'failed',
			satsNeeded: 0
		});
	});
});

describe('summarizeChannelBalances', () => {
	it('keeps Lightning bitcoin and USDT apart from each other', () => {
		expect(
			summarizeChannelBalances(
				[
					{ outboundBalanceMsat: 1_500_000 },
					{ assetId: ESCROW_LNUSDT, assetLocalAmount: 100_000_000, outboundBalanceMsat: 9_000 }
				],
				ESCROW_LNUSDT
			)
		).toEqual({ btcSats: 1_500, usdtUnits: 100_000_000 });
	});
});

describe('mainnetLightningConfig', () => {
	it('stays disabled until UTEXO endpoints are configured', () => {
		expect(
			mainnetLightningConfig({ enabled: undefined, lspBaseUrl: '', gatewayUrl: '' })
		).toBeNull();
		expect(
			mainnetLightningConfig({
				enabled: 'true',
				lspBaseUrl: 'https://lsp.example',
				gatewayUrl: ''
			})
		).toBeNull();
		expect(
			mainnetLightningConfig({
				enabled: 'true',
				lspBaseUrl: 'https://lsp.example',
				gatewayUrl: 'wss://gateway.example'
			})
		).toEqual({ lspBaseUrl: 'https://lsp.example', proxyUrl: 'wss://gateway.example' });
	});
});

describe('planManualChannel', () => {
	it('allows the bot pubkey only when the user typed it', () => {
		const planned = planManualChannel({
			peer: `${BOT_LSP_PUBKEY}@49.12.99.77:9737`,
			capacitySat: MIN_MANUAL_CHANNEL_SATS
		});
		expect(planned.ok).toBe(true);
		if (!planned.ok) return;
		expect(planned.plan.explicitBot).toBe(true);
		expect(planned.plan.peerUri).toBe(`${BOT_LSP_PUBKEY}@49.12.99.77:9737`);
	});

	it('rejects a short capacity and an asset amount without an id', () => {
		expect(planManualChannel({ peer: '02aa', capacitySat: 1000 }).ok).toBe(false);
		const pubkey = '02' + 'ab'.repeat(32);
		expect(
			planManualChannel({ peer: pubkey, capacitySat: MIN_MANUAL_CHANNEL_SATS, assetAmount: 5 }).ok
		).toBe(false);
		const withAsset = planManualChannel({
			peer: pubkey,
			capacitySat: MIN_MANUAL_CHANNEL_SATS,
			assetId: ESCROW_LNUSDT,
			assetAmount: 1000
		});
		expect(withAsset.ok).toBe(true);
	});
});
