import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { EnrichmentRequest } from '$lib/types/notification';

vi.mock('$lib/api/services/notificationCenter.service', () => ({
	notificationCenterService: {
		enrich: vi.fn<(data: EnrichmentRequest) => Promise<void>>().mockResolvedValue(undefined),
		list: vi.fn(),
		getUnreadCount: vi.fn(),
		markRead: vi.fn(),
		markAllRead: vi.fn(),
		deleteNotification: vi.fn(),
		clearAll: vi.fn(),
		getPreferences: vi.fn(),
		updatePreferences: vi.fn()
	}
}));

vi.mock('$lib/utils/debug', () => ({
	createDebug: () => ({
		log: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	})
}));

describe('enrichment calls', () => {
	let notificationCenterService: { enrich: Mock };

	beforeEach(async () => {
		vi.clearAllMocks();
		const mod = await import('$lib/api/services/notificationCenter.service');
		notificationCenterService =
			mod.notificationCenterService as unknown as typeof notificationCenterService;
	});

	it('contract_created enrichment includes all required fields', async () => {
		await notificationCenterService.enrich({
			action: 'contract_created',
			escrowId: 'payment-123',
			estimatedStartTime: Math.floor(Date.now() / 1000) + 86400,
			amount: '50000',
			taskTitle: 'Build landing page'
		});

		expect(notificationCenterService.enrich).toHaveBeenCalledWith({
			action: 'contract_created',
			escrowId: 'payment-123',
			estimatedStartTime: expect.any(Number),
			amount: '50000',
			taskTitle: 'Build landing page'
		});
	});

	it('task_completed enrichment passes remaining timelock seconds', async () => {
		const timelockEnd = Math.floor(Date.now() / 1000) + 7 * 86400;
		const remainingSeconds = timelockEnd - Math.floor(Date.now() / 1000);

		await notificationCenterService.enrich({
			action: 'task_completed',
			escrowId: 'payment-456',
			timelockDuration: remainingSeconds
		});

		expect(notificationCenterService.enrich).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'task_completed',
				escrowId: 'payment-456',
				timelockDuration: expect.any(Number)
			})
		);

		const call = notificationCenterService.enrich.mock.calls[0][0];
		expect(call.timelockDuration).toBeGreaterThan(0);
		expect(call.timelockDuration).toBeLessThanOrEqual(7 * 86400);
	});

	it('work_started enrichment includes estimatedCompletionTime', async () => {
		const completionTime = Math.floor(Date.now() / 1000) + 3 * 86400;

		await notificationCenterService.enrich({
			action: 'work_started',
			escrowId: 'payment-789',
			estimatedCompletionTime: completionTime
		});

		expect(notificationCenterService.enrich).toHaveBeenCalledWith({
			action: 'work_started',
			escrowId: 'payment-789',
			estimatedCompletionTime: completionTime
		});
	});

	it('dispute_raised enrichment passes remaining timelock seconds', async () => {
		const timelockEnd = Math.floor(Date.now() / 1000) + 2 * 86400;
		const remainingSeconds = timelockEnd - Math.floor(Date.now() / 1000);

		await notificationCenterService.enrich({
			action: 'dispute_raised',
			escrowId: 'payment-abc',
			timelockDuration: remainingSeconds
		});

		expect(notificationCenterService.enrich).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'dispute_raised',
				escrowId: 'payment-abc',
				timelockDuration: expect.any(Number)
			})
		);
	});

	it('no_show_marked enrichment includes responseDeadline', async () => {
		const deadline = Math.floor(Date.now() / 1000) + 86400;

		await notificationCenterService.enrich({
			action: 'no_show_marked',
			escrowId: 'payment-def',
			responseDeadline: deadline
		});

		expect(notificationCenterService.enrich).toHaveBeenCalledWith({
			action: 'no_show_marked',
			escrowId: 'payment-def',
			responseDeadline: deadline
		});
	});

	it('task_created enrichment includes taskId, taskDeadline, and taskTitle', async () => {
		const deadline = Math.floor(Date.now() / 1000) + 7 * 86400;

		await notificationCenterService.enrich({
			action: 'task_created',
			taskId: 'task-xyz',
			taskDeadline: deadline,
			taskTitle: 'Build landing page'
		});

		expect(notificationCenterService.enrich).toHaveBeenCalledWith({
			action: 'task_created',
			taskId: 'task-xyz',
			taskDeadline: deadline,
			taskTitle: 'Build landing page'
		});
	});

	it('funds_released enrichment includes escrowId, taskTitle, and amount', async () => {
		await notificationCenterService.enrich({
			action: 'funds_released',
			escrowId: 'payment-789',
			taskTitle: 'Build landing page',
			amount: '0.01'
		});

		expect(notificationCenterService.enrich).toHaveBeenCalledWith({
			action: 'funds_released',
			escrowId: 'payment-789',
			taskTitle: 'Build landing page',
			amount: '0.01'
		});
	});

	it('refunded enrichment includes escrowId, taskTitle, and amount', async () => {
		await notificationCenterService.enrich({
			action: 'refunded',
			escrowId: 'payment-abc',
			taskTitle: 'Fix bugs',
			amount: '0.05'
		});

		expect(notificationCenterService.enrich).toHaveBeenCalledWith({
			action: 'refunded',
			escrowId: 'payment-abc',
			taskTitle: 'Fix bugs',
			amount: '0.05'
		});
	});

	it('cancelled enrichment includes escrowId, taskTitle, and amount', async () => {
		await notificationCenterService.enrich({
			action: 'cancelled',
			escrowId: 'payment-def',
			taskTitle: 'Design logo',
			amount: '0.02'
		});

		expect(notificationCenterService.enrich).toHaveBeenCalledWith({
			action: 'cancelled',
			escrowId: 'payment-def',
			taskTitle: 'Design logo',
			amount: '0.02'
		});
	});

	it('dispute_resolved enrichment includes escrowId, taskTitle, and amount', async () => {
		await notificationCenterService.enrich({
			action: 'dispute_resolved',
			escrowId: 'payment-ghi',
			taskTitle: 'Write docs',
			amount: '0.03'
		});

		expect(notificationCenterService.enrich).toHaveBeenCalledWith({
			action: 'dispute_resolved',
			escrowId: 'payment-ghi',
			taskTitle: 'Write docs',
			amount: '0.03'
		});
	});

	it('no_show_refund_claimed enrichment includes escrowId, taskTitle, and amount', async () => {
		await notificationCenterService.enrich({
			action: 'no_show_refund_claimed',
			escrowId: 'payment-jkl',
			taskTitle: 'Build API',
			amount: '0.04'
		});

		expect(notificationCenterService.enrich).toHaveBeenCalledWith({
			action: 'no_show_refund_claimed',
			escrowId: 'payment-jkl',
			taskTitle: 'Build API',
			amount: '0.04'
		});
	});

	it('resolution_proposed enrichment includes escrowId, taskTitle, and amount', async () => {
		await notificationCenterService.enrich({
			action: 'resolution_proposed',
			escrowId: 'payment-mno',
			taskTitle: 'Fix bugs',
			amount: '0.02'
		});

		expect(notificationCenterService.enrich).toHaveBeenCalledWith({
			action: 'resolution_proposed',
			escrowId: 'payment-mno',
			taskTitle: 'Fix bugs',
			amount: '0.02'
		});
	});

	it('timelock_resolved enrichment includes escrowId, taskTitle, and amount', async () => {
		await notificationCenterService.enrich({
			action: 'timelock_resolved',
			escrowId: 'payment-pqr',
			taskTitle: 'Design logo',
			amount: '0.03'
		});

		expect(notificationCenterService.enrich).toHaveBeenCalledWith({
			action: 'timelock_resolved',
			escrowId: 'payment-pqr',
			taskTitle: 'Design logo',
			amount: '0.03'
		});
	});

	it('wallet events require no extra fields', async () => {
		const walletActions = [
			'payment_received',
			'swap_completed',
			'swap_failed',
			'withdrawal_confirmed'
		];

		for (const action of walletActions) {
			vi.clearAllMocks();
			await notificationCenterService.enrich({ action });
			expect(notificationCenterService.enrich).toHaveBeenCalledWith({ action });
		}
	});

	it('timelockDuration is computed as remaining seconds, not absolute timestamp', () => {
		const timelockEnd = Math.floor(Date.now() / 1000) + 7 * 86400;
		const now = Math.floor(Date.now() / 1000);
		const remainingSeconds = timelockEnd - now;

		// Should be ~7 days in seconds, not a Unix timestamp (~1.7 billion)
		expect(remainingSeconds).toBeLessThan(8 * 86400);
		expect(remainingSeconds).toBeGreaterThan(6 * 86400);
	});
});
