/**
 * Circuit Breaker & Health Check Service
 *
 * Pre-flight health checks and per-service circuit breakers for the
 * RBTC-collateralized USDT0 loan flow. Probes every critical dependency
 * before the flow starts and tracks per-service state (open/closed/half-open).
 *
 * @see RBTC-Collateralized USDT0 on Arbitrum Plan §10
 */

import { tryCatch } from '$lib/utils/tryCatch';
import { createDebug } from '$lib/utils/debug';
import { loanMonitoringService } from '$lib/services/loan-monitoring.service';

const debug = createDebug('circuit-breaker');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HealthStatus {
	service: string;
	healthy: boolean;
	latencyMs: number;
	error?: string;
}

type CircuitState = 'closed' | 'open' | 'half-open';

interface CircuitEntry {
	state: CircuitState;
	failureCount: number;
	lastFailureTime: number;
	lastSuccessTime: number;
	openSince: number;
	/** How long the circuit stays open before transitioning to half-open (ms). */
	resetTimeoutMs: number;
	/** Number of consecutive failures to trigger open state. */
	failureThreshold: number;
	/** Number of consecutive successes to close from half-open. */
	successThreshold: number;
	halfOpenSuccesses: number;
}

// ---------------------------------------------------------------------------
// Circuit Breaker Rules (from plan §10.2)
// ---------------------------------------------------------------------------

const CIRCUIT_RULES: Record<
	string,
	{ failureThreshold: number; resetTimeoutMs: number; successThreshold: number }
> = {
	'rsk-rpc': { failureThreshold: 3, resetTimeoutMs: 60000, successThreshold: 1 },
	'arb-rpc': { failureThreshold: 3, resetTimeoutMs: 60000, successThreshold: 1 },
	openocean: { failureThreshold: 5, resetTimeoutMs: 120000, successThreshold: 2 },
	lifi: { failureThreshold: 5, resetTimeoutMs: 120000, successThreshold: 2 },
	symbiosis: { failureThreshold: 5, resetTimeoutMs: 120000, successThreshold: 2 },
	layerzero: { failureThreshold: 3, resetTimeoutMs: 300000, successThreshold: 1 },
	'arbitrum-rpc': { failureThreshold: 3, resetTimeoutMs: 60000, successThreshold: 1 }
};

// ---------------------------------------------------------------------------
// Circuit Breaker class
// ---------------------------------------------------------------------------

export class CircuitBreaker {
	private circuits: Map<string, CircuitEntry> = new Map();

	private getOrCreateCircuit(service: string): CircuitEntry {
		let circuit = this.circuits.get(service);
		if (!circuit) {
			const rules = CIRCUIT_RULES[service] ?? {
				failureThreshold: 3,
				resetTimeoutMs: 60000,
				successThreshold: 1
			};
			circuit = {
				state: 'closed',
				failureCount: 0,
				lastFailureTime: 0,
				lastSuccessTime: 0,
				openSince: 0,
				resetTimeoutMs: rules.resetTimeoutMs,
				failureThreshold: rules.failureThreshold,
				successThreshold: rules.successThreshold,
				halfOpenSuccesses: 0
			};
			this.circuits.set(service, circuit);
		}
		return circuit;
	}

	/** Returns true if the service is currently open (requests blocked). */
	isOpen(service: string): boolean {
		const circuit = this.getOrCreateCircuit(service);

		if (circuit.state === 'closed') return false;

		if (circuit.state === 'open') {
			// Check if enough time has passed to transition to half-open
			if (Date.now() - circuit.openSince >= circuit.resetTimeoutMs) {
				circuit.state = 'half-open';
				circuit.halfOpenSuccesses = 0;
				debug.log('Circuit half-open: %s', service);
				return false;
			}
			return true;
		}

		// half-open — allow requests through
		return false;
	}

	/** Record a successful operation for this service. */
	recordSuccess(service: string): void {
		const circuit = this.getOrCreateCircuit(service);
		const now = Date.now();

		if (circuit.state === 'half-open') {
			circuit.halfOpenSuccesses++;
			if (circuit.halfOpenSuccesses >= circuit.successThreshold) {
				circuit.state = 'closed';
				circuit.failureCount = 0;
				debug.log('Circuit closed: %s', service);
			}
		} else if (circuit.state === 'closed') {
			// Reset failure count on success in closed state
			circuit.failureCount = 0;
		}
		circuit.lastSuccessTime = now;
	}

	/** Record a failure for this service. */
	recordFailure(service: string): void {
		const circuit = this.getOrCreateCircuit(service);
		const now = Date.now();

		circuit.failureCount++;
		circuit.lastFailureTime = now;

		if (
			(circuit.state === 'closed' && circuit.failureCount >= circuit.failureThreshold) ||
			circuit.state === 'half-open'
		) {
			circuit.state = 'open';
			circuit.openSince = now;
			circuit.halfOpenSuccesses = 0;
			debug.warn('Circuit opened: %s (failures: %d)', service, circuit.failureCount);
			loanMonitoringService.healthCheck(service, false, undefined, 'Circuit breaker opened');
		}
	}

	/** Reset all circuits. */
	resetAll(): void {
		this.circuits.clear();
	}

	/** Get the current state of a service's circuit. */
	getState(service: string): CircuitState {
		const circuit = this.circuits.get(service);
		if (!circuit) return 'closed';

		// Auto-transition from open to half-open if timeout elapsed
		if (circuit.state === 'open' && Date.now() - circuit.openSince >= circuit.resetTimeoutMs) {
			circuit.state = 'half-open';
			circuit.halfOpenSuccesses = 0;
		}
		return circuit.state;
	}
}

// Singleton instance
export const defaultCircuitBreaker = new CircuitBreaker();

// ---------------------------------------------------------------------------
// Pre-flight health checks (from plan §10.1)
// ---------------------------------------------------------------------------

/**
 * Probe an RPC endpoint for health.
 * Checks chain ID matches expected value.
 */
export async function probeRPC(url: string, chainId: number): Promise<HealthStatus> {
	const start = Date.now();

	const { data: _data, error } = await tryCatch(
		(async () => {
			const response = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					jsonrpc: '2.0',
					method: 'eth_chainId',
					params: [],
					id: 1
				}),
				signal: AbortSignal.timeout(10000)
			});
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const json = (await response.json()) as { result?: string };
			const actualChainId = parseInt(json.result ?? '0', 16);
			if (actualChainId !== chainId) {
				throw new Error(`Chain ID mismatch: expected ${chainId}, got ${actualChainId}`);
			}
		})()
	);

	const latencyMs = Date.now() - start;

	return {
		service: url,
		healthy: error === null,
		latencyMs,
		error: error?.message
	};
}

/**
 * Probe the MoC global coverage ratio to verify minting is allowed.
 * coverageRatio must be > 4 for unrestricted minting.
 */
export async function probeMoCCoverageRatio(): Promise<HealthStatus> {
	const start = Date.now();

	// This is a lightweight probe — when MoCMintingService is available in wallet-core,
	// this will call getGlobalCoverageRatio(). For now, we verify the RPC is reachable.
	const rsrRpcUrl = 'https://public-node.rsk.co';
	const { data: rpcStatus, error } = await tryCatch(probeRPC(rsrRpcUrl, 30));

	// If RPC is up, MoC is likely reachable. Full coverage check is done
	// by MoCMintingService when available.
	const healthy = error === null && (rpcStatus?.healthy ?? false);

	return {
		service: 'MoC (Money on Chain)',
		healthy,
		latencyMs: Date.now() - start,
		error: healthy ? undefined : 'RSK RPC unreachable — MoC not available'
	};
}

/**
 * Probe OpenOcean API availability.
 */
export async function probeOpenOceanAPI(): Promise<HealthStatus> {
	const start = Date.now();

	const openoceanUrl = 'https://open-api.openocean.finance/v4/rootstock/quote';
	const testParams =
		`?inTokenAddress=0xe700691dA7b9851F2F35f8b8182c69c53CcaD9Db` +
		`&outTokenAddress=0x779Ded0c9e1022225f8E0630b35a9b54bE713736&amount=1000000000000000000`;

	const { data: _data, error } = await tryCatch(
		fetch(openoceanUrl + testParams, {
			signal: AbortSignal.timeout(10000)
		})
	);

	const healthy = error === null && _data !== undefined && _data.ok;

	return {
		service: 'OpenOcean API',
		healthy,
		latencyMs: Date.now() - start,
		error: healthy ? undefined : (error?.message ?? 'OpenOcean API unavailable')
	};
}

/**
 * Probe LI.FI API availability.
 */
export async function probeLifiAPI(): Promise<HealthStatus> {
	const start = Date.now();

	const { data: _data, error } = await tryCatch(
		fetch('https://li.quest/v1/chains', {
			signal: AbortSignal.timeout(10000)
		})
	);

	const healthy = error === null && _data !== undefined && _data.ok;

	return {
		service: 'LI.FI API',
		healthy,
		latencyMs: Date.now() - start,
		error: healthy ? undefined : (error?.message ?? 'LI.FI API unavailable')
	};
}

/**
 * Probe Symbiosis API availability.
 */
export async function probeSymbiosisAPI(): Promise<HealthStatus> {
	const start = Date.now();

	const { data: _data, error } = await tryCatch(
		fetch('https://api.symbiosis.finance/crosschain/v1/health', {
			signal: AbortSignal.timeout(10000)
		})
	);

	const healthy = error === null && _data !== undefined && _data.ok;

	return {
		service: 'Symbiosis API',
		healthy,
		latencyMs: Date.now() - start,
		error: healthy ? undefined : (error?.message ?? 'Symbiosis API unavailable')
	};
}

/**
 * Run all pre-flight health checks in parallel.
 *
 * Called before starting a loan flow to ensure all dependencies are healthy.
 * Returns a list of HealthStatus results — one per dependency.
 *
 * @returns Array of health status results for all critical dependencies
 */
export async function preFlightCheck(): Promise<HealthStatus[]> {
	debug.log('Running pre-flight health checks...');

	const results = await Promise.allSettled([
		probeRPC('https://public-node.rsk.co', 30).catch(
			(err: Error): HealthStatus => ({
				service: 'RSK RPC (primary)',
				healthy: false,
				latencyMs: 0,
				error: err.message
			})
		),
		probeRPC('https://mainnet.sovryn.app/rpc', 30).catch(
			(err: Error): HealthStatus => ({
				service: 'RSK RPC (fallback)',
				healthy: false,
				latencyMs: 0,
				error: err.message
			})
		),
		probeRPC('https://arb1.arbitrum.io/rpc', 42161).catch(
			(err: Error): HealthStatus => ({
				service: 'Arbitrum RPC',
				healthy: false,
				latencyMs: 0,
				error: err.message
			})
		),
		probeMoCCoverageRatio().catch(
			(err: Error): HealthStatus => ({
				service: 'MoC (Money on Chain)',
				healthy: false,
				latencyMs: 0,
				error: err.message
			})
		),
		probeOpenOceanAPI().catch(
			(err: Error): HealthStatus => ({
				service: 'OpenOcean API',
				healthy: false,
				latencyMs: 0,
				error: err.message
			})
		),
		probeLifiAPI().catch(
			(err: Error): HealthStatus => ({
				service: 'LI.FI API',
				healthy: false,
				latencyMs: 0,
				error: err.message
			})
		),
		probeSymbiosisAPI().catch(
			(err: Error): HealthStatus => ({
				service: 'Symbiosis API',
				healthy: false,
				latencyMs: 0,
				error: err.message
			})
		)
	]);

	const healthStatuses: HealthStatus[] = results.map((r) =>
		r.status === 'fulfilled'
			? r.value
			: {
					service: 'unknown',
					healthy: false,
					latencyMs: 0,
					error: 'Health check crashed'
				}
	);

	// Log results via breadcrumbs
	for (const status of healthStatuses) {
		debug.log(
			'Health check [%s]: %s (latency: %dms)',
			status.service,
			status.healthy ? 'UP' : 'DOWN',
			status.latencyMs
		);
		loanMonitoringService.healthCheck(
			status.service,
			status.healthy,
			status.latencyMs,
			status.error
		);
	}

	return healthStatuses;
}

/**
 * Check if all critical health checks passed.
 * Degraded mode (RSK fallback + 1 DEX down) is still considered acceptable.
 */
export function isHealthy(results: HealthStatus[]): boolean {
	// At minimum, one RSK RPC and one DEX aggregator must be healthy
	const rskHealthy = results.some((r) => r.service.startsWith('RSK RPC') && r.healthy);
	const dexHealthy = results.some(
		(r) => ['OpenOcean API', 'LI.FI API', 'Symbiosis API'].includes(r.service) && r.healthy
	);

	return rskHealthy && dexHealthy;
}
