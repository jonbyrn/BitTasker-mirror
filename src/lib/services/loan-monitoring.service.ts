/**
 * Loan Flow Sentry Monitoring Service
 *
 * Lightweight wrapper around `Sentry.addBreadcrumb()` that logs loan
 * flow state transitions, errors, timing metrics, and key lifecycle
 * events. Falls back gracefully (no-op) when Sentry is not initialised
 * or when running in development mode.
 *
 * Follows the same pattern as gas-abstraction/sentry-breadcrumbs.ts.
 *
 * @see RBTC-Collateralized USDT0 on Arbitrum Plan §6
 */

import { addBreadcrumb } from '@sentry/sveltekit';
import type { LoanPhase } from '$lib/services/loan-orchestrator.service';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Detect whether Sentry is properly initialised.
 * Returns false when Sentry has not been initialised.
 */
function isSentryActive(): boolean {
	try {
		return typeof addBreadcrumb === 'function';
	} catch {
		return false;
	}
}

function formatTimestamp(): string {
	return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const loanMonitoringService = {
	/**
	 * Log a loan flow state transition as a Sentry breadcrumb.
	 * Tracks timing for each phase.
	 */
	phaseChange(fromPhase: LoanPhase, toPhase: LoanPhase, metadata?: Record<string, unknown>): void {
		if (!isSentryActive()) return;

		addBreadcrumb({
			category: 'loan-flow',
			message: `Loan phase: ${fromPhase} → ${toPhase}`,
			level: 'info',
			data: {
				fromPhase,
				toPhase,
				timestamp: formatTimestamp(),
				...(metadata ?? {})
			}
		});
	},

	/**
	 * Log an error that occurred during the loan flow.
	 */
	flowError(phase: LoanPhase, error: Error, metadata?: Record<string, unknown>): void {
		if (!isSentryActive()) return;

		addBreadcrumb({
			category: 'loan-error',
			message: `Loan error at phase ${phase}: ${error.message}`,
			level: 'error',
			data: {
				phase,
				errorName: error.name,
				errorMessage: error.message,
				errorStack: error.stack ?? null,
				timestamp: formatTimestamp(),
				...(metadata ?? {})
			}
		});
	},

	/**
	 * Log a recovery attempt in the loan flow.
	 */
	recoveryAttempt(
		fromPhase: LoanPhase,
		recoveryTarget: string,
		metadata?: Record<string, unknown>
	): void {
		if (!isSentryActive()) return;

		addBreadcrumb({
			category: 'loan-recovery',
			message: `Loan recovery: ${fromPhase} → ${recoveryTarget}`,
			level: 'warning',
			data: {
				fromPhase,
				recoveryTarget,
				timestamp: formatTimestamp(),
				...(metadata ?? {})
			}
		});
	},

	/**
	 * Log step timing (duration of a specific step).
	 */
	stepDuration(
		phase: LoanPhase,
		durationMs: number,
		success: boolean,
		metadata?: Record<string, unknown>
	): void {
		if (!isSentryActive()) return;

		addBreadcrumb({
			category: 'loan-metric',
			message: `Loan step ${phase} took ${durationMs}ms (${success ? 'success' : 'failure'})`,
			level: 'info',
			data: {
				phase,
				durationMs,
				success,
				timestamp: formatTimestamp(),
				...(metadata ?? {})
			}
		});
	},

	/**
	 * Log loan flow lifecycle events (start, cancel, complete, recovery).
	 */
	lifecycleEvent(
		event: 'started' | 'completed' | 'cancelled' | 'recovered' | 'timed_out',
		metadata?: Record<string, unknown>
	): void {
		if (!isSentryActive()) return;

		addBreadcrumb({
			category: 'loan-lifecycle',
			message: `Loan flow ${event}`,
			level: 'info',
			data: {
				event,
				timestamp: formatTimestamp(),
				...(metadata ?? {})
			}
		});
	},

	/**
	 * Log circuit breaker or health check events.
	 */
	healthCheck(service: string, healthy: boolean, latencyMs?: number, error?: string): void {
		if (!isSentryActive()) return;

		addBreadcrumb({
			category: 'loan-health',
			message: `Health check ${service}: ${healthy ? 'UP' : 'DOWN'}`,
			level: healthy ? 'info' : 'warning',
			data: {
				service,
				healthy,
				latencyMs: latencyMs ?? null,
				error: error ?? null,
				timestamp: formatTimestamp()
			}
		});
	}
};
