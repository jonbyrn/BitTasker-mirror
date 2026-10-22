import { describe, expect, it } from 'vitest';
import {
	blockingReceiveCandidates,
	chooseReleases,
	consignmentProbeResult,
	type ReleaseCandidate
} from '$lib/stores/wallet/release-receive';

const NOW = 1_700_000_000;

function row(overrides: Partial<ReleaseCandidate> = {}): ReleaseCandidate {
	return {
		batch: 4,
		recipientId: 'sb:utxob:JQuSjyh9-rest',
		status: 'WaitingCounterparty',
		expiration: NOW + 3600,
		...overrides
	};
}

describe('chooseReleases', () => {
	it('releases an unexpired WaitingCounterparty receive when the proxy has no consignment', () => {
		const outcome = chooseReleases(
			[row()],
			new Map([['sb:utxob:JQuSjyh9-rest', 'absent']]),
			NOW
		);
		expect(outcome).toEqual({ released: [4], reason: 'released' });
	});

	it('releases an expired WaitingCounterparty receive with no consignment', () => {
		const outcome = chooseReleases(
			[row({ expiration: NOW - 10 })],
			new Map([['sb:utxob:JQuSjyh9-rest', 'absent']]),
			NOW
		);
		expect(outcome).toEqual({ released: [4], reason: 'released' });
	});

	it('keeps a receive whose proxy consignment exists', () => {
		const outcome = chooseReleases(
			[row({ expiration: NOW - 10 })],
			new Map([['sb:utxob:JQuSjyh9-rest', 'found']]),
			NOW
		);
		expect(outcome).toEqual({ released: [], reason: 'consignment' });
	});

	it('keeps a receive when the proxy probe is unknown', () => {
		const outcome = chooseReleases([row({ expiration: NOW - 10 })], new Map(), NOW);
		expect(outcome).toEqual({ released: [], reason: 'unknown' });
	});

	it('does not release a transfer that is waiting for confirmations', () => {
		const outcome = chooseReleases(
			[row({ status: 'WaitingConfirmations', expiration: NOW - 10 })],
			new Map([['sb:utxob:JQuSjyh9-rest', 'absent']]),
			NOW
		);
		expect(outcome.released).toEqual([]);
	});

	it('treats a blinding txid as not a payment, so the receive can still be released', () => {
		const candidates = blockingReceiveCandidates([
			{
				kind: 'ReceiveBlind',
				status: 'WaitingCounterparty',
				batchTransferIdx: 7,
				txid: 'e7768e06' + 'ab'.repeat(28),
				recipientId: 'sb:utxob:zaH1VFfS-rest',
				expiration: NOW + 60
			}
		]);
		expect(candidates).toEqual([
			{
				batch: 7,
				recipientId: 'sb:utxob:zaH1VFfS-rest',
				status: 'WaitingCounterparty',
				expiration: NOW + 60
			}
		]);
		const outcome = chooseReleases(
			candidates,
			new Map([['sb:utxob:zaH1VFfS-rest', 'absent']]),
			NOW
		);
		expect(outcome).toEqual({ released: [7], reason: 'released' });
	});
});

describe('consignmentProbeResult', () => {
	it('reads a missing file as absent and any other error as unknown', () => {
		expect(consignmentProbeResult({ error: { code: -400, message: 'missing' } })).toBe('absent');
		expect(consignmentProbeResult({ error: { code: -100, message: 'Cannot change ACK' } })).toBe(
			'unknown'
		);
		expect(
			consignmentProbeResult({ result: { consignment: 'rgb-consignment-bytes' } })
		).toBe('found');
		expect(consignmentProbeResult({ result: {} })).toBe('absent');
	});
});
