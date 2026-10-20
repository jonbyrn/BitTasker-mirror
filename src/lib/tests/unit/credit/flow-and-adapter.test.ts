import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { legAmount } from '$lib/escrow/payoutSplit';
import {
	deskAccept,
	deskCancelJob,
	deskComplete,
	deskConfirmEscrow,
	deskConfirmFunding,
	deskFund,
	deskOffer,
	deskRequest,
	createMockDesk,
	heldCents
} from '$lib/credit/flow';
import { creditEventVerified, readVerifiedCreditEvent } from '$lib/credit/events';
import {
	PARTIAL_SEND_DETAIL,
	assessFullAllocation,
	settleNeedsPartialSend
} from '$lib/rgb/adapter';
import { createUtexoCreditAdapter, signetConfirmations } from '$lib/rgb/utexo-adapter';
import { creditSurface } from '$lib/credit/network';
import { simulatedBtcOracle } from '$lib/credit/oracle';
import { planCollateralLoan } from '$lib/credit/phase2/collateralLoan';

describe('mock advance flow', () => {
	it('repays the lender first and the amounts sum to the escrow', async () => {
		const desk = createMockDesk(1_800_000_000);
		expect(desk.escrow.confirmations).toBe(0);
		expect(() => deskRequest(desk, 1_800_000_001)).toThrow(/confirmation/);
		deskConfirmEscrow(desk, 1_800_000_002);
		deskRequest(desk, 1_800_000_003);
		deskOffer(desk, 1_800_000_004);
		deskAccept(desk, 1_800_000_005);
		await deskFund(desk, 1_800_000_006);
		expect(desk.advance?.status).toBe('accepted');
		expect(desk.advance?.fundingConfirmations).toBe(0);
		await deskConfirmFunding(desk, 1_800_000_007);
		expect(desk.advance?.status).toBe('funded');
		await deskComplete(desk, 1_800_000_008);
		expect(desk.advance?.status).toBe('repaid');
		expect(desk.split).toBeTruthy();
		const lender = legAmount(desk.split!, 'lender');
		const worker = legAmount(desk.split!, 'worker');
		expect(lender).toBe(desk.advance!.advanceAmountCents + desk.advance!.feeAmountCents);
		expect(lender + worker).toBe(desk.escrow.amountCents);
		expect(await heldCents(desk, desk.parties.lender.pubkey)).toBe(lender);
		expect(await heldCents(desk, desk.parties.worker.pubkey)).toBe(
			desk.advance!.advanceAmountCents + worker
		);
		expect(desk.events.every((event) => creditEventVerified(event))).toBe(true);
		expect(readVerifiedCreditEvent({ ...desk.events[0], sig: '00'.repeat(64) })).toBeNull();
	});

	it('defaults the lender and refunds the hirer the full escrow', async () => {
		const desk = createMockDesk(1_800_000_100);
		deskConfirmEscrow(desk, 1_800_000_101);
		deskRequest(desk, 1_800_000_102);
		deskOffer(desk, 1_800_000_103);
		deskAccept(desk, 1_800_000_104);
		await deskFund(desk, 1_800_000_105);
		await deskConfirmFunding(desk, 1_800_000_106);
		const advance = desk.advance!.advanceAmountCents;
		await deskCancelJob(desk, 1_800_000_107);
		expect(desk.advance?.status).toBe('defaulted');
		expect(legAmount(desk.split!, 'lender')).toBe(0);
		expect(legAmount(desk.split!, 'hirer')).toBe(desk.escrow.amountCents);
		expect(desk.lenderLossCents).toBe(advance);
		expect(await heldCents(desk, desk.parties.hirer.pubkey)).toBe(desk.escrow.amountCents);
	});
});

describe('rgb guards', () => {
	it('refuses a partial allocation and blocks a live split', async () => {
		expect(assessFullAllocation([{ id: 'coin', units: 100 }], 'coin', 40).ok).toBe(false);
		expect(assessFullAllocation([{ id: 'coin', units: 100 }], 'coin', 100).ok).toBe(true);
		expect(
			settleNeedsPartialSend(100, [
				{ owner: 'a', units: 40 },
				{ owner: 'b', units: 60 }
			])
		).toBe(true);
		const adapter = createUtexoCreditAdapter({
			network: 'signet',
			assetId: 'usdt',
			wallet: {
				async listUnspents() {
					return [
						{
							rgbAllocations: [{ assignment: { amount: 100 } }],
							utxo: { outpoint: { txid: 'ab'.repeat(32), vout: 0 } }
						}
					];
				}
			}
		});
		await expect(
			adapter.buildFullAllocationTransfer({
				assetId: 'usdt',
				allocationId: `${'ab'.repeat(32)}:0`,
				units: 40,
				invoice: 'rgb:test'
			})
		).rejects.toThrow(PARTIAL_SEND_DETAIL);
		const settled = await adapter.settle({
			assetId: 'usdt',
			escrowUnits: 100,
			legs: [
				{ owner: 'lender', units: 40 },
				{ owner: 'worker', units: 60 }
			]
		});
		expect(settled.ok).toBe(false);
		if (!settled.ok) expect(settled.reason).toBe('partial-send-blocked');
	});

	it('treats an unconfirmed transaction as unfunded', async () => {
		const fetchImpl = (async () =>
			new Response(JSON.stringify({ status: { confirmed: false } }), {
				status: 200
			})) as typeof fetch;
		expect(await signetConfirmations('aa'.repeat(32), fetchImpl)).toBe(0);
		const confirmed = (async () =>
			new Response(JSON.stringify({ status: { confirmed: true } }), {
				status: 200
			})) as typeof fetch;
		expect(await signetConfirmations('aa'.repeat(32), confirmed)).toBe(1);
		expect(await signetConfirmations('not-a-txid', fetchImpl)).toBe(0);
	});
});

describe('extension points', () => {
	it('keeps the price oracle and Taproot loans out of the advance path', () => {
		const advance = readFileSync(join('src/lib/credit/advance.ts'), 'utf8');
		const flow = readFileSync(join('src/lib/credit/flow.ts'), 'utf8');
		expect(advance.includes('oracle')).toBe(false);
		expect(flow.includes('oracle')).toBe(false);
		expect(simulatedBtcOracle(42_000).quote(10).source).toBe('simulated');
		expect(
			planCollateralLoan({ amountCents: 10_000, aprBps: 1200, termDays: 30, ltvBps: 5000 }).status
		).toBe('not-implemented');
		expect(() =>
			planCollateralLoan({ amountCents: 10_000, aprBps: 100, termDays: 30, ltvBps: 5001 })
		).toThrow(/50%/);
	});

	it('opens the test ledger only on dev or the sandbox host', () => {
		expect(
			creditSurface({ enabled: false, dev: false, host: 'bittasker.com', search: '?creditMock=1' })
		).toBe('off');
		expect(
			creditSurface({ enabled: true, dev: false, host: 'bittasker.com', search: '?creditMock=1' })
		).toBe('live');
		expect(
			creditSurface({
				enabled: true,
				dev: false,
				host: 'rgb.bittasker.com',
				search: '?creditMock=1'
			})
		).toBe('mock');
		expect(
			creditSurface({ enabled: false, dev: true, host: 'localhost', search: '?creditMock=1' })
		).toBe('mock');
		expect(
			creditSurface({ enabled: true, dev: false, host: 'rgb.bittasker.com', search: '' })
		).toBe('live');
	});
});
