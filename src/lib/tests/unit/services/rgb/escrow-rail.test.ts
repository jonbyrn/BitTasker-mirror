import { describe, expect, it } from 'vitest';
import { BOT_LSP_PUBKEY, SIGNET_USDT_ASSET } from '$lib/stores/wallet/signet-lsp';
import {
	ESCROW_LNUSDT,
	assertInvoiceRail,
	bolt11Expired,
	escrowStageSats,
	satsChannelOpen,
	bolt11MatchesSats,
	invoiceMatchesRail,
	lightningNodeEmpty,
	lnUsdtOpen,
	refusedBotPayee
} from '$lib/services/rgb/escrow-rail';

describe('escrow rail', () => {
	it('uses the Signet LSP LNUSDT id and refuses the bot pubkey', () => {
		expect(ESCROW_LNUSDT).toBe(SIGNET_USDT_ASSET);
		expect(refusedBotPayee(BOT_LSP_PUBKEY)).toBe(true);
		expect(
			refusedBotPayee('02aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
		).toBe(false);
	});

	it('matches rgb invoices to USDT and bolt11 invoices to Lightning', () => {
		expect(invoiceMatchesRail('usdt_rgb', 'rgb:~/~/aa/sb:utxob:taskee')).toBe(true);
		expect(invoiceMatchesRail('usdt_rgb', 'lntbs30u1example')).toBe(false);
		expect(invoiceMatchesRail('btc_lightning', 'lntbs30u1example')).toBe(true);
		expect(invoiceMatchesRail('btc_lightning', 'lntb1example')).toBe(true);
		expect(invoiceMatchesRail('btc_lightning', 'lnbc1example')).toBe(true);
		expect(invoiceMatchesRail('btc_lightning', 'rgb:~/~/aa/sb:utxob:taskee')).toBe(false);
		expect(() => assertInvoiceRail('btc_lightning', 'rgb:invoice')).toThrow(
			'Sats escrow requires a Lightning invoice'
		);
		expect(() => assertInvoiceRail('usdt_rgb', 'lntbs30u1example')).toThrow(
			'USDT escrow requires an rgb: invoice'
		);
	});

	it('treats LNUSDT as open only when listChannels marks that asset usable', () => {
		expect(lnUsdtOpen([])).toBe(false);
		expect(lnUsdtOpen([{ isUsable: true, assetId: 'rgb:other' }])).toBe(false);
		expect(lnUsdtOpen([{ isUsable: false, assetId: ESCROW_LNUSDT }])).toBe(false);
		expect(lnUsdtOpen([{ ready: true, assetId: ESCROW_LNUSDT }])).toBe(false);
		expect(lnUsdtOpen([{ isUsable: true, assetId: ESCROW_LNUSDT }])).toBe(true);
	});

	it('blocks sats fund only when peers and channels are both empty', () => {
		expect(lightningNodeEmpty([], [])).toBe(true);
		expect(lightningNodeEmpty([{ pubkey: '02aa' }], [])).toBe(false);
		expect(lightningNodeEmpty([], [{ channelId: 'ch' }])).toBe(false);
	});

	it('requires the bolt11 amount to equal the locked sats and rejects expiry', () => {
		expect(bolt11MatchesSats(3_075_000, 3075)).toBe(true);
		expect(bolt11MatchesSats(3_075_500, 3075)).toBe(false);
		expect(bolt11MatchesSats(undefined, 3075)).toBe(false);
		expect(bolt11Expired(1_000, 60, 1_060)).toBe(true);
		expect(bolt11Expired(1_000, 60, 1_059)).toBe(false);
		expect(bolt11Expired(undefined, 60, 1_000)).toBe(false);
		expect(bolt11Expired(undefined, undefined, 1_000)).toBe(true);
	});

	it('accepts the fee lock, the balance, or the full locked total', () => {
		expect(escrowStageSats(1345)).toEqual([1345, 33, 1312, 1279]);
		expect(escrowStageSats(3075)).toEqual([3075, 75, 3000, 2925]);
		expect(escrowStageSats(0)).toEqual([]);
		expect(escrowStageSats(102_500)).toEqual([
			102_500, 2500, 100_000, 97_500, 3000, 99_500, 97_000
		]);
	});

	it('treats only a usable non-LNUSDT channel as a sats route', () => {
		expect(satsChannelOpen([])).toBe(false);
		expect(satsChannelOpen([{ isUsable: true, assetId: ESCROW_LNUSDT }])).toBe(false);
		expect(satsChannelOpen([{ isUsable: false }])).toBe(false);
		expect(satsChannelOpen([{ isUsable: true }])).toBe(true);
	});
});
