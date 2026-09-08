import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
	sendConsignmentToPeer,
	parseConsignmentMessage
} from '$lib/services/rgb/consignment-exchange';
import { RgbConsignmentSubscription } from '$lib/services/rgb/consignment-subscription';
import { ContractRune } from '$lib/runes/contract.svelte';
import { state } from '$lib/stores/wallet/wallet-state';
import type { RgbSeal } from '$lib/services/rgb/types';

vi.mock('$lib/nostr/ndk', () => ({
	ndk: {
		subscribe: vi.fn()
	}
}));

vi.mock('$lib/utils/nostr', () => ({
	publishNostrEvent: vi.fn().mockResolvedValue({ event: { id: 'dm-event-1' } }),
	getSignedEvent: vi.fn().mockResolvedValue({ id: 'attestation-1' }),
	publishToMultipleRelays: vi.fn().mockResolvedValue([{ success: true }])
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNpub: vi.fn().mockResolvedValue('npub1hwamhwamhwamhwamhwamhwamhwamhwamhwamhwamhwamhwamhwasxw04hu')
}));

vi.mock('$app/environment', () => ({
	browser: true
}));

const { publishNostrEvent } = await import('$lib/utils/nostr');
const { ndk } = await import('$lib/nostr/ndk');

const sampleSeal: RgbSeal = {
	id: 'seal-xyz' as RgbSeal['id'],
	contractId: 'contract-1' as RgbSeal['contractId'],
	state: 'SETTLED',
	assetId: 'usdt_rgb',
	amount: 100_000_000,
	createdAt: 1,
	updatedAt: 2
};

const mocks = vi.hoisted(() => ({
	witness: vi.fn(),
	validate: vi.fn()
}));

vi.mock('$lib/services/rgb/command-queue', () => ({
	getBrowserRgbCommandQueue: vi.fn().mockImplementation(async () => ({
		commit: vi.fn().mockResolvedValue({ ok: true, value: mocks.sealValue }),
		witness: mocks.witness,
		spend: vi.fn().mockResolvedValue({ ok: true, value: mocks.sealValue }),
		validateConsignment: mocks.validate
	}))
}));

describe('RGB consignment exchange over Nostr DM', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		ContractRune.clearRegistry();
		(mocks as { sealValue?: RgbSeal }).sealValue = sampleSeal;
		mocks.witness.mockResolvedValue({ ok: true, value: sampleSeal });
		mocks.validate.mockResolvedValue({ ok: true, value: { valid: true } });
		state.utexoWallet = {} as never;
	});

	it('sender publishes an encrypted kind-4 DM addressed to the recipient', async () => {
		await sendConsignmentToPeer('recipient-pubkey', {
			contractId: 'contract-1',
			assetId: 'usdt_rgb',
			invoice: 'rgb1invoice',
			transferId: 'seal-xyz'
		});

		expect(publishNostrEvent).toHaveBeenCalledTimes(1);
		const [kind, content, recipient, tags] = vi.mocked(publishNostrEvent).mock.calls[0];
		expect(kind).toBe(4);
		expect(recipient).toBe('recipient-pubkey');
		expect(tags).toEqual([
			['m', 'rgb-consignment'],
			['r', 'contract-1']
		]);
		expect(parseConsignmentMessage(content)).toMatchObject({
			type: 'rgb-consignment',
			contractId: 'contract-1',
			assetId: 'usdt_rgb',
			invoice: 'rgb1invoice',
			transferId: 'seal-xyz'
		});
	});

	it('recipient decrypts the DM and applies the confirmed transfer to their ContractRune', async () => {
		const rune = new ContractRune({
			contractId: 'contract-1',
			totalAmountUsd: 100,
			split: {
				primaryAsset: 'btc_onchain',
				primaryPercentage: 100,
				secondaryAsset: 'btc_lightning',
				secondaryPercentage: 0
			},
			partyPubkeys: ['sender-pubkey', 'recipient-pubkey']
		});

		const dmContent = JSON.stringify({
			type: 'rgb-consignment',
			contractId: 'contract-1',
			assetId: 'usdt_rgb',
			invoice: 'rgb1invoice',
			transferId: 'seal-xyz',
			createdAt: Date.now()
		});

		let capturedHandler: ((event: never) => void) | undefined;
		vi.mocked(ndk.subscribe).mockImplementation((_filter: unknown, opts: unknown) => {
			capturedHandler = (opts as { onEvent: (event: never) => void }).onEvent;
			return { stop: vi.fn() } as never;
		});

		const onApplied = vi.fn();
		const subscription = new RgbConsignmentSubscription();
		await subscription.start({ onApplied });

		const decryptedEvent = {
			id: 'dm-1',
			pubkey: 'sender-pubkey',
			content: dmContent,
			decrypt: vi.fn().mockImplementation(async function (this: { content: string }) {
				this.content = dmContent;
			})
		};

		capturedHandler?.(decryptedEvent as never);
		await vi.waitFor(() => expect(onApplied).toHaveBeenCalledWith('contract-1'));

		expect(rune.seals).toContainEqual(sampleSeal);
		expect(rune.status).toBe('funded');

		subscription.stop();
	});

	it('keeps escrow awaiting payment until the RGB transfer is witnessed', async () => {
		const rune = new ContractRune({
			contractId: 'contract-funding-state',
			contractTitle: 'Fund a task',
			totalAmountUsd: 100,
			split: {
				primaryAsset: 'btc_onchain',
				primaryPercentage: 100,
				secondaryAsset: 'btc_lightning',
				secondaryPercentage: 0
			},
			partyPubkeys: ['tasker-pubkey', 'taskee-pubkey']
		});

		const prepared = await rune.prepareFunding();
		expect(prepared.status).toBe('funding');
		expect(prepared.fundingState).toBe('awaiting_payment');
		expect(rune.snapshot.status).not.toBe('funded');

		const confirmed = await rune.confirmFunding();
		expect(confirmed.status).toBe('funded');
		expect(confirmed.fundingState).toBe('funded');
		expect(mocks.witness).toHaveBeenCalledWith({
			recipientId: sampleSeal.id,
			contractId: 'contract-funding-state',
			assetId: 'usdt_rgb'
		});
	});

	it('ignores DMs for unknown contracts and malformed consignment payloads', async () => {
		let capturedHandler: ((event: never) => void) | undefined;
		vi.mocked(ndk.subscribe).mockImplementation((_filter: unknown, opts: unknown) => {
			capturedHandler = (opts as { onEvent: (event: never) => void }).onEvent;
			return { stop: vi.fn() } as never;
		});

		const onApplied = vi.fn();
		const onError = vi.fn();
		const subscription = new RgbConsignmentSubscription();
		await subscription.start({ onApplied, onError });

		const unknownContract = {
			id: 'dm-2',
			pubkey: 'sender-pubkey',
			content: JSON.stringify({
				type: 'rgb-consignment',
				contractId: 'unknown-contract',
				assetId: 'usdt_rgb',
				invoice: 'rgb1x',
				createdAt: Date.now()
			}),
			decrypt: vi.fn().mockResolvedValue(undefined)
		};
		const malformed = {
			id: 'dm-3',
			pubkey: 'sender-pubkey',
			content: 'not-json',
			decrypt: vi.fn().mockResolvedValue(undefined)
		};

		capturedHandler?.(unknownContract as never);
		capturedHandler?.(malformed as never);
		await new Promise((resolve) => setTimeout(resolve, 20));

		expect(onApplied).not.toHaveBeenCalled();
		expect(onError).not.toHaveBeenCalled();

		subscription.stop();
	});
});
