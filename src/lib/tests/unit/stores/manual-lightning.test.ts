import { describe, expect, it, vi } from 'vitest';
import { MIN_MANUAL_CHANNEL_SATS, planManualChannel } from '$lib/stores/wallet/lightning-status';
import { openManualChannel } from '$lib/stores/wallet/manual-lightning';
import { resetWasmLockForTests } from '$lib/stores/wallet/wasm-lock';

const PUBKEY = '02' + 'cd'.repeat(32);

describe('openManualChannel', () => {
	it('connects and opens once', async () => {
		resetWasmLockForTests();
		const planned = planManualChannel({
			peer: `${PUBKEY}@node.example:9735`,
			capacitySat: 50_000,
			assetId: 'rgb:asset',
			assetAmount: 10
		});
		if (!planned.ok) throw new Error(planned.error);
		const connectPeer = vi.fn().mockResolvedValue(undefined);
		const openChannel = vi.fn().mockResolvedValue({ temporaryChannelId: 'tmp-1' });
		await expect(openManualChannel({ connectPeer, openChannel }, planned.plan)).resolves.toEqual({
			temporaryChannelId: 'tmp-1'
		});
		expect(connectPeer).toHaveBeenCalledOnce();
		expect(connectPeer).toHaveBeenCalledWith(`${PUBKEY}@node.example:9735`);
		expect(openChannel).toHaveBeenCalledOnce();
		expect(openChannel).toHaveBeenCalledWith({
			peerPubkey: PUBKEY,
			capacitySat: 50_000,
			isPublic: false,
			assetId: 'rgb:asset',
			assetLocalAmount: 10
		});
		expect(MIN_MANUAL_CHANNEL_SATS).toBeLessThan(50_000);
	});

	it('does not retry when the open fails', async () => {
		resetWasmLockForTests();
		const planned = planManualChannel({ peer: PUBKEY, capacitySat: MIN_MANUAL_CHANNEL_SATS });
		if (!planned.ok) throw new Error(planned.error);
		const openChannel = vi.fn().mockRejectedValue(new Error('funding rejected'));
		await expect(openManualChannel({ openChannel }, planned.plan)).rejects.toThrow(
			'funding rejected'
		);
		expect(openChannel).toHaveBeenCalledOnce();
	});
});
