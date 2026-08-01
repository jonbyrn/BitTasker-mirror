import { SvelteMap } from 'svelte/reactivity';
import { get } from 'svelte/store';
import * as Sentry from '@sentry/sveltekit';
import { defiPositions } from '$lib/stores/defi-positions.store.svelte';
import { browserNetworkStatus } from '$lib/utils/network-status';
import { FeatureFlagService, FEATURE_FLAGS } from '$lib/services/kill-switch';
import { createDebug } from '$lib/utils/debug';

const d = createDebug('liquidationMonitor');

// Alert thresholds (health factor values)
const HF_DANGER = 1.2; // Red alert — immediate action needed
const HF_WARNING = 1.5; // Orange alert — position at risk
const HF_CAUTION = 2.0; // Yellow alert — monitor closely

export type AlertSeverity = 'danger' | 'warning' | 'caution';

export interface LiquidationAlert {
	walletId: string;
	address: string;
	healthFactor: number;
	severity: AlertSeverity;
	liquidationPriceBtc?: number;
	currentBtcPrice?: number;
	distancePercent?: number;
	message: string;
	timestamp: Date;
	acknowledged: boolean;
}

function deriveSeverity(hf: number): AlertSeverity | null {
	if (hf <= HF_DANGER) return 'danger';
	if (hf <= HF_WARNING) return 'warning';
	if (hf <= HF_CAUTION) return 'caution';
	return null;
}

function buildAlertMessage(severity: AlertSeverity, hf: number): string {
	switch (severity) {
		case 'danger':
			return `Critical: Health factor is ${hf.toFixed(2)}. Immediate action required to avoid liquidation.`;
		case 'warning':
			return `Warning: Health factor is ${hf.toFixed(2)}. Consider adding collateral or repaying debt.`;
		case 'caution':
			return `Notice: Health factor is ${hf.toFixed(2)}. Monitor your position closely.`;
	}
}

class LiquidationMonitorStore {
	alerts = $state<Map<string, LiquidationAlert>>(new SvelteMap());
	isMonitoring = $state(false);

	private pollInterval: ReturnType<typeof setInterval> | null = null;
	private readonly POLL_INTERVAL_MS = 60_000;

	start(): void {
		if (this.isMonitoring) return;
		this.isMonitoring = true;
		d.log('Liquidation monitor started');

		this.checkAllPositions();

		this.pollInterval = setInterval(() => {
			this.checkAllPositions();
		}, this.POLL_INTERVAL_MS);
	}

	stop(): void {
		if (this.pollInterval) {
			clearInterval(this.pollInterval);
			this.pollInterval = null;
		}
		this.isMonitoring = false;
		d.log('Liquidation monitor stopped');
	}

	acknowledge(walletId: string): void {
		const existing = this.alerts.get(walletId);
		if (existing) {
			const updated = new SvelteMap(this.alerts);
			updated.set(walletId, { ...existing, acknowledged: true });
			this.alerts = updated;
		}
	}

	dismiss(walletId: string): void {
		const updated = new SvelteMap(this.alerts);
		updated.delete(walletId);
		this.alerts = updated;
	}

	get activeAlerts(): LiquidationAlert[] {
		const result: LiquidationAlert[] = [];
		for (const alert of this.alerts.values()) {
			if (!alert.acknowledged) result.push(alert);
		}
		return result.sort((a, b) => {
			const order = { danger: 0, warning: 1, caution: 2 };
			return order[a.severity] - order[b.severity];
		});
	}

	private async checkAllPositions(): Promise<void> {
		if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
		if (!FeatureFlagService.isEnabled(FEATURE_FLAGS.LOAN_FLOW)) return;

		const net = get(browserNetworkStatus);
		if (!net.online) return;

		try {
			const positions = defiPositions.aavePositions;
			const updated = new SvelteMap<string, LiquidationAlert>();

			for (const [walletId, pos] of positions) {
				if (pos.totalDebtUsd <= 0) continue;

				const severity = deriveSeverity(pos.healthFactor);
				if (!severity) continue;

				const existing = this.alerts.get(walletId);

				if (
					!existing ||
					existing.severity !== severity ||
					existing.healthFactor !== pos.healthFactor
				) {
					const alert: LiquidationAlert = {
						walletId,
						address: pos.address,
						healthFactor: pos.healthFactor,
						severity,
						liquidationPriceBtc: pos.liquidationPriceBtc,
						currentBtcPrice: pos.currentBtcPrice,
						distancePercent:
							pos.liquidationPriceBtc && pos.currentBtcPrice
								? ((pos.currentBtcPrice - pos.liquidationPriceBtc) /
										pos.currentBtcPrice) *
									100
								: undefined,
						message: buildAlertMessage(severity, pos.healthFactor),
						timestamp: new Date(),
						acknowledged: existing?.acknowledged ?? false
					};
					updated.set(walletId, alert);

					Sentry.addBreadcrumb({
						category: 'defi.liquidation',
						message: `alert-${severity}`,
						data: { walletId, hf: pos.healthFactor.toFixed(2) }
					});
				} else {
					updated.set(walletId, existing);
				}
			}

			this.alerts = updated;
		} catch (err) {
			d.warn('Liquidation check failed:', err);
			Sentry.captureException(err, { tags: { feature: 'defi.liquidation' } });
		}
	}
}

export const liquidationMonitor = new LiquidationMonitorStore();
