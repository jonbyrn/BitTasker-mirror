import { describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import {
	armLightningSetupTimeout,
	BOT_LSP_PUBKEY,
	clearLightningWallet,
	lightningStore
} from '$lib/stores/wallet/signet-lsp';
import { ESCROW_LNUSDT } from '$lib/services/rgb/escrow-rail';
import {
	LIGHTNING_ONCHAIN_RESERVE_SATS,
	MIN_MANUAL_CHANNEL_SATS,
	lightningUxStatus,
	mainnetLightningConfig,
	planManualChannel,
	summarizeChannelBalances
} from '$lib/stores/wallet/lightning-status';

describe('lightningUxStatus', () => {
	it('asks for a fee reserve when the wallet has almost no bitcoin', () => {
		expect(lightningUxStatus({ ready: false, channel: 'waiting', onchainSats: 1_000 })).toEqual({
			status: 'needs_funding',
			satsNeeded: LIGHTNING_ONCHAIN_RESERVE_SATS - 1_000
		});
	});

	it('does not ask for more sats when the wallet already holds on-chain bitcoin', () => {
		expect(lightningUxStatus({ ready: false, channel: 'waiting', onchainSats: 199_691 })).toEqual({
			status: 'setting_up',
			satsNeeded: 0
		});
	});

	it('says setting up once the fee reserve is covered', () => {
		expect(
			lightningUxStatus({
				ready: false,
				channel: 'waiting',
				onchainSats: LIGHTNING_ONCHAIN_RESERVE_SATS
			})
		).toEqual({ status: 'setting_up', satsNeeded: 0 });
	});

	it('says ready when the channel is open', () => {
		expect(lightningUxStatus({ ready: true, channel: 'open', onchainSats: 0 })).toEqual({
			status: 'ready',
			satsNeeded: 0
		});
	});

	it('leaves setting up and shows Lightning unavailable after the setup wait', async () => {
		vi.useFakeTimers();
		clearLightningWallet();
		armLightningSetupTimeout(1_000);
		await vi.advanceTimersByTimeAsync(1_000);
		expect(get(lightningStore).failure).toBe('connect');
		expect(
			lightningUxStatus({
				ready: false,
				channel: 'waiting',
				onchainSats: 199_691,
				failure: get(lightningStore).failure
			}).status
		).toBe('failed');
		clearLightningWallet();
		vi.useRealTimers();
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
