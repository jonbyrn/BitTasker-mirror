import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
	mockDefiPositions,
	mockNetworkStatus,
	mockKillSwitch,
	mockSentry
} = vi.hoisted(() => {
	return {
		mockDefiPositions: {
			aavePositions: new Map()
		},
		mockNetworkStatus: {
			current: { online: true },
			subscribe: vi.fn((fn: (v: { online: boolean }) => void) => {
				fn(mockNetworkStatus.current);
				return () => {};
			})
		},
		mockKillSwitch: {
			isEnabled: vi.fn(() => true)
		},
		mockSentry: {
			addBreadcrumb: vi.fn(),
			captureException: vi.fn()
		}
	};
});

vi.mock('$lib/stores/defi-positions.store.svelte', () => ({
	defiPositions: mockDefiPositions
}));
vi.mock('$lib/utils/network-status', () => ({
	browserNetworkStatus: mockNetworkStatus
}));
vi.mock('$lib/services/kill-switch', () => ({
	FeatureFlagService: mockKillSwitch,
	FEATURE_FLAGS: { LOAN_FLOW: 'LOAN_FLOW', CONNECTED_WALLETS: 'CONNECTED_WALLETS' }
}));
vi.mock('@sentry/sveltekit', () => mockSentry);
vi.mock('$lib/utils/debug', () => ({
	createDebug: () => ({ log: vi.fn(), warn: vi.fn() })
}));

import { liquidationMonitor } from '$lib/stores/liquidation-monitor.store.svelte';
import type { LiquidationAlert } from '$lib/stores/liquidation-monitor.store.svelte';

function makePosition(healthFactor: number, totalDebtUsd = 1000, overrides = {}) {
	return {
		address: '0xWallet',
		healthFactor,
		totalDebtUsd,
		totalCollateralUsd: 2000,
		suppliedUsdt0: 2000,
		liquidationPriceBtc: 40000,
		currentBtcPrice: 60000,
		...overrides
	};
}

describe('liquidation-monitor.store', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		mockDefiPositions.aavePositions = new Map();
		mockNetworkStatus.current.online = true;
		mockNetworkStatus.subscribe.mockImplementation((fn: (v: { online: boolean }) => void) => {
			fn(mockNetworkStatus.current);
			return () => {};
		});
		mockKillSwitch.isEnabled.mockReturnValue(true);
		vi.clearAllMocks();
		liquidationMonitor.stop();
		(liquidationMonitor as any).alerts = new Map();
	});

	afterEach(() => {
		liquidationMonitor.stop();
		vi.useRealTimers();
	});

	describe('severity derivation', () => {
		it('HF = 1.0 → danger', () => {
			mockDefiPositions.aavePositions.set('w1', makePosition(1.0));
			liquidationMonitor.start();
			const alerts = Array.from((liquidationMonitor as any).alerts.values()) as LiquidationAlert[];
			expect(alerts).toHaveLength(1);
			expect(alerts[0].severity).toBe('danger');
		});

		it('HF = 1.19 → danger', () => {
			mockDefiPositions.aavePositions.set('w1', makePosition(1.19));
			liquidationMonitor.start();
			const alerts = Array.from((liquidationMonitor as any).alerts.values()) as LiquidationAlert[];
			expect(alerts).toHaveLength(1);
			expect(alerts[0].severity).toBe('danger');
		});

		it('HF = 1.2 → danger', () => {
			mockDefiPositions.aavePositions.set('w1', makePosition(1.2));
			liquidationMonitor.start();
			const alerts = Array.from((liquidationMonitor as any).alerts.values()) as LiquidationAlert[];
			expect(alerts).toHaveLength(1);
			expect(alerts[0].severity).toBe('danger');
		});

		it('HF = 1.3 → warning', () => {
			mockDefiPositions.aavePositions.set('w1', makePosition(1.3));
			liquidationMonitor.start();
			const alerts = Array.from((liquidationMonitor as any).alerts.values()) as LiquidationAlert[];
			expect(alerts).toHaveLength(1);
			expect(alerts[0].severity).toBe('warning');
		});

		it('HF = 1.5 → warning', () => {
			mockDefiPositions.aavePositions.set('w1', makePosition(1.5));
			liquidationMonitor.start();
			const alerts = Array.from((liquidationMonitor as any).alerts.values()) as LiquidationAlert[];
			expect(alerts).toHaveLength(1);
			expect(alerts[0].severity).toBe('warning');
		});

		it('HF = 1.6 → caution', () => {
			mockDefiPositions.aavePositions.set('w1', makePosition(1.6));
			liquidationMonitor.start();
			const alerts = Array.from((liquidationMonitor as any).alerts.values()) as LiquidationAlert[];
			expect(alerts).toHaveLength(1);
			expect(alerts[0].severity).toBe('caution');
		});

		it('HF = 2.0 → caution', () => {
			mockDefiPositions.aavePositions.set('w1', makePosition(2.0));
			liquidationMonitor.start();
			const alerts = Array.from((liquidationMonitor as any).alerts.values()) as LiquidationAlert[];
			expect(alerts).toHaveLength(1);
			expect(alerts[0].severity).toBe('caution');
		});

		it('HF = 2.1 → no alert (safe)', () => {
			mockDefiPositions.aavePositions.set('w1', makePosition(2.1));
			liquidationMonitor.start();
			const alerts = Array.from((liquidationMonitor as any).alerts.values()) as LiquidationAlert[];
			expect(alerts).toHaveLength(0);
		});

		it('HF = 999 → no alert (no debt)', () => {
			mockDefiPositions.aavePositions.set('w1', makePosition(999, 0));
			liquidationMonitor.start();
			const alerts = Array.from((liquidationMonitor as any).alerts.values()) as LiquidationAlert[];
			expect(alerts).toHaveLength(0);
		});
	});

	describe('alert lifecycle', () => {
		it('start() creates initial alerts', () => {
			mockDefiPositions.aavePositions.set('w1', makePosition(1.1));
			liquidationMonitor.start();
			expect(liquidationMonitor.isMonitoring).toBe(true);
			expect((liquidationMonitor as any).alerts.size).toBe(1);
		});

		it('stop() clears interval and sets isMonitoring false', () => {
			liquidationMonitor.start();
			expect(liquidationMonitor.isMonitoring).toBe(true);
			liquidationMonitor.stop();
			expect(liquidationMonitor.isMonitoring).toBe(false);
		});

		it('acknowledge() marks alert as acknowledged', () => {
			mockDefiPositions.aavePositions.set('w1', makePosition(1.1));
			liquidationMonitor.start();
			liquidationMonitor.acknowledge('w1');
			const alert = (liquidationMonitor as any).alerts.get('w1') as LiquidationAlert;
			expect(alert.acknowledged).toBe(true);
		});

		it('dismiss() removes alert entirely', () => {
			mockDefiPositions.aavePositions.set('w1', makePosition(1.1));
			liquidationMonitor.start();
			expect((liquidationMonitor as any).alerts.size).toBe(1);
			liquidationMonitor.dismiss('w1');
			expect((liquidationMonitor as any).alerts.size).toBe(0);
		});

		it('activeAlerts returns only non-acknowledged alerts sorted by severity', () => {
			mockDefiPositions.aavePositions.set('w-danger', makePosition(1.0));
			mockDefiPositions.aavePositions.set('w-caution', makePosition(1.8));
			mockDefiPositions.aavePositions.set('w-warning', makePosition(1.4));
			liquidationMonitor.start();

			const active = liquidationMonitor.activeAlerts;
			expect(active).toHaveLength(3);
			expect(active[0].severity).toBe('danger');
			expect(active[1].severity).toBe('warning');
			expect(active[2].severity).toBe('caution');

			liquidationMonitor.acknowledge('w-danger');
			const afterAck = liquidationMonitor.activeAlerts;
			expect(afterAck).toHaveLength(2);
			expect(afterAck[0].severity).toBe('warning');
			expect(afterAck[1].severity).toBe('caution');
		});

		it('full lifecycle: create → acknowledge → dismiss', () => {
			mockDefiPositions.aavePositions.set('w1', makePosition(1.1));
			liquidationMonitor.start();
			expect(liquidationMonitor.activeAlerts).toHaveLength(1);

			liquidationMonitor.acknowledge('w1');
			expect(liquidationMonitor.activeAlerts).toHaveLength(0);
			expect((liquidationMonitor as any).alerts.size).toBe(1);

			liquidationMonitor.dismiss('w1');
			expect((liquidationMonitor as any).alerts.size).toBe(0);
			expect(liquidationMonitor.activeAlerts).toHaveLength(0);
		});
	});

	describe('guards', () => {
		it('offline → no checks performed', () => {
			mockNetworkStatus.current.online = false;
			mockDefiPositions.aavePositions.set('w1', makePosition(1.0));
			liquidationMonitor.start();
			expect((liquidationMonitor as any).alerts.size).toBe(0);
		});

		it('feature flag disabled → no checks performed', () => {
			mockKillSwitch.isEnabled.mockReturnValue(false);
			mockDefiPositions.aavePositions.set('w1', makePosition(1.0));
			liquidationMonitor.start();
			expect((liquidationMonitor as any).alerts.size).toBe(0);
		});

		it('no debt → no alert created', () => {
			mockDefiPositions.aavePositions.set('w1', makePosition(1.0, 0));
			liquidationMonitor.start();
			expect((liquidationMonitor as any).alerts.size).toBe(0);
		});
	});

	describe('alert updates', () => {
		it('severity change → alert updates', () => {
			mockDefiPositions.aavePositions.set('w1', makePosition(1.1));
			liquidationMonitor.start();
			expect((liquidationMonitor as any).alerts.get('w1').severity).toBe('danger');

			mockDefiPositions.aavePositions.set('w1', makePosition(1.8));
			vi.advanceTimersByTime(60_000);
			expect((liquidationMonitor as any).alerts.get('w1').severity).toBe('caution');
		});

		it('HF change → alert updates', () => {
			mockDefiPositions.aavePositions.set('w1', makePosition(1.1));
			liquidationMonitor.start();
			expect((liquidationMonitor as any).alerts.get('w1').healthFactor).toBe(1.1);

			mockDefiPositions.aavePositions.set('w1', makePosition(1.3));
			vi.advanceTimersByTime(60_000);
			expect((liquidationMonitor as any).alerts.get('w1').healthFactor).toBe(1.3);
		});

		it('same severity + same HF → existing alert preserved (no spam)', () => {
			mockDefiPositions.aavePositions.set('w1', makePosition(1.1));
			liquidationMonitor.start();
			const firstTimestamp = (liquidationMonitor as any).alerts.get('w1').timestamp;

			vi.advanceTimersByTime(60_000);
			const secondTimestamp = (liquidationMonitor as any).alerts.get('w1').timestamp;
			expect(firstTimestamp).toBe(secondTimestamp);
		});
	});

	describe('what the user sees', () => {
		it('alert messages contain the health factor value', () => {
			mockDefiPositions.aavePositions.set('w1', makePosition(1.15));
			liquidationMonitor.start();
			const alert = (liquidationMonitor as any).alerts.get('w1') as LiquidationAlert;
			expect(alert.message).toContain('1.15');
		});

		it('danger message indicates critical / immediate action', () => {
			mockDefiPositions.aavePositions.set('w1', makePosition(1.0));
			liquidationMonitor.start();
			const alert = (liquidationMonitor as any).alerts.get('w1') as LiquidationAlert;
			expect(alert.message).toMatch(/critical/i);
			expect(alert.message).toMatch(/immediate/i);
		});

		it('warning message indicates consider adding collateral', () => {
			mockDefiPositions.aavePositions.set('w1', makePosition(1.4));
			liquidationMonitor.start();
			const alert = (liquidationMonitor as any).alerts.get('w1') as LiquidationAlert;
			expect(alert.message).toMatch(/warning/i);
			expect(alert.message).toMatch(/collateral|repaying/i);
		});

		it('caution message indicates monitor closely', () => {
			mockDefiPositions.aavePositions.set('w1', makePosition(1.8));
			liquidationMonitor.start();
			const alert = (liquidationMonitor as any).alerts.get('w1') as LiquidationAlert;
			expect(alert.message).toMatch(/notice/i);
			expect(alert.message).toMatch(/monitor/i);
		});

		it('severity ordering: danger before warning before caution', () => {
			mockDefiPositions.aavePositions.set('w-caution', makePosition(1.9));
			mockDefiPositions.aavePositions.set('w-danger', makePosition(1.0));
			mockDefiPositions.aavePositions.set('w-warning', makePosition(1.4));
			liquidationMonitor.start();

			const active = liquidationMonitor.activeAlerts;
			expect(active[0].walletId).toBe('w-danger');
			expect(active[1].walletId).toBe('w-warning');
			expect(active[2].walletId).toBe('w-caution');
		});
	});

	describe('polling', () => {
		it('polls every 60 seconds', () => {
			mockDefiPositions.aavePositions.set('w1', makePosition(1.1));
			liquidationMonitor.start();
			expect((liquidationMonitor as any).alerts.size).toBe(1);

			mockDefiPositions.aavePositions.set('w1', makePosition(1.4));
			vi.advanceTimersByTime(60_000);
			expect((liquidationMonitor as any).alerts.get('w1').severity).toBe('warning');

			mockDefiPositions.aavePositions.set('w1', makePosition(1.8));
			vi.advanceTimersByTime(60_000);
			expect((liquidationMonitor as any).alerts.get('w1').severity).toBe('caution');
		});

		it('stop() prevents further polling', () => {
			mockDefiPositions.aavePositions.set('w1', makePosition(1.1));
			liquidationMonitor.start();
			expect((liquidationMonitor as any).alerts.get('w1').severity).toBe('danger');
			liquidationMonitor.stop();

			mockDefiPositions.aavePositions.set('w1', makePosition(1.8));
			vi.advanceTimersByTime(120_000);
			expect((liquidationMonitor as any).alerts.get('w1').severity).toBe('danger');
		});

		it('start() is idempotent — double start does not create duplicate intervals', () => {
			mockDefiPositions.aavePositions.set('w1', makePosition(1.1));
			liquidationMonitor.start();
			liquidationMonitor.start();
			expect((liquidationMonitor as any).alerts.size).toBe(1);
		});
	});
});
