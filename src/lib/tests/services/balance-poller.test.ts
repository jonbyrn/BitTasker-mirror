import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BalancePollingManager } from '$lib/services/external-wallet/balance-poller';

// ---------------------------------------------------------------------------
// Mock @capacitor/app so that loadAppModule() resolves to a controllable stub
// ---------------------------------------------------------------------------
const mockRemove = vi.fn();
const mockAddListener = vi.fn().mockResolvedValue({ remove: mockRemove });

vi.mock('@capacitor/app', () => ({
	App: {
		addListener: mockAddListener
	}
}));

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
function createCallback() {
	return vi.fn().mockResolvedValue(undefined);
}

describe('BalancePollingManager', () => {
	let manager: BalancePollingManager;

	beforeEach(() => {
		vi.useFakeTimers();
		manager = new BalancePollingManager();
		mockAddListener.mockClear();
		mockRemove.mockClear();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// ------------------------------------------------------------------
	// init / Capacitor lifecycle listeners
	// ------------------------------------------------------------------
	describe('init', () => {
		it('registers pause and resume listeners with Capacitor App', async () => {
			await manager.init();
			expect(mockAddListener).toHaveBeenCalledTimes(2);
			expect(mockAddListener).toHaveBeenCalledWith('pause', expect.any(Function));
			expect(mockAddListener).toHaveBeenCalledWith('resume', expect.any(Function));
		});

		it('is idempotent when called multiple times', async () => {
			await manager.init();
			await manager.init();
			await manager.init();
			// addListener should only be called once (first init)
			expect(mockAddListener).toHaveBeenCalledTimes(2);
		});
	});

	// ------------------------------------------------------------------
	// start / stop lifecycle
	// ------------------------------------------------------------------
	describe('start and stop', () => {
		it('calls the callback at the specified interval', async () => {
			await manager.init();
			const cb = createCallback();
			manager.start('src1', cb, 1000);

			// Advance by one interval
			vi.advanceTimersByTime(1000);
			expect(cb).toHaveBeenCalledTimes(1);

			// Advance by another interval
			vi.advanceTimersByTime(1000);
			expect(cb).toHaveBeenCalledTimes(2);
		});

		it('stop runs the callback one final time and removes the timer', async () => {
			await manager.init();
			const cb = createCallback();
			manager.start('src1', cb, 1000);

			vi.advanceTimersByTime(1000);
			expect(cb).toHaveBeenCalledTimes(1);

			manager.stop('src1');
			// final callback invocation
			expect(cb).toHaveBeenCalledTimes(2);

			// Advance further — the callback should NOT be called again
			const priorCalls = cb.mock.calls.length;
			vi.advanceTimersByTime(5000);
			expect(cb).toHaveBeenCalledTimes(priorCalls);
		});

		it('stop is idempotent when called twice on the same source', async () => {
			await manager.init();
			const cb = createCallback();
			manager.start('src1', cb, 1000);

			vi.advanceTimersByTime(1000);
			expect(cb).toHaveBeenCalledTimes(1);

			manager.stop('src1');
			manager.stop('src1'); // second stop should be a no-op

			// final callback ran only once
			expect(cb).toHaveBeenCalledTimes(2);
		});
	});

	// ------------------------------------------------------------------
	// stopAll
	// ------------------------------------------------------------------
	describe('stopAll', () => {
		it('stops all active polling sources', async () => {
			await manager.init();
			const cb1 = createCallback();
			const cb2 = createCallback();

			manager.start('src1', cb1, 1000);
			manager.start('src2', cb2, 1000);

			vi.advanceTimersByTime(1000);
			expect(cb1).toHaveBeenCalledTimes(1);
			expect(cb2).toHaveBeenCalledTimes(1);

			manager.stopAll();

			// Both callbacks invoked one final time
			expect(cb1).toHaveBeenCalledTimes(2);
			expect(cb2).toHaveBeenCalledTimes(2);

			// No more firings
			vi.advanceTimersByTime(5000);
			expect(cb1).toHaveBeenCalledTimes(2);
			expect(cb2).toHaveBeenCalledTimes(2);
		});

		it('is safe when no sources are running', () => {
			// Should not throw
			expect(() => manager.stopAll()).not.toThrow();
		});
	});

	// ------------------------------------------------------------------
	// destroy
	// ------------------------------------------------------------------
	describe('destroy', () => {
		it('removes Capacitor pause and resume listeners', async () => {
			await manager.init();
			manager.destroy();
			expect(mockRemove).toHaveBeenCalledTimes(2);
		});

		it('stops all polling before removing listeners', async () => {
			await manager.init();
			const cb = createCallback();
			manager.start('src1', cb, 1000);

			vi.advanceTimersByTime(1000);
			expect(cb).toHaveBeenCalledTimes(1);

			manager.destroy();

			// Final callback ran
			expect(cb).toHaveBeenCalledTimes(2);
			// Listeners removed
			expect(mockRemove).toHaveBeenCalledTimes(2);

			// No more firings
			vi.advanceTimersByTime(5000);
			expect(cb).toHaveBeenCalledTimes(2);
		});

		it('is safe when called without init', () => {
			expect(() => manager.destroy()).not.toThrow();
		});

		it('is idempotent', async () => {
			await manager.init();
			manager.destroy();
			manager.destroy();
			// remove should only be called once per listener
			expect(mockRemove).toHaveBeenCalledTimes(2);
		});
	});

	// ------------------------------------------------------------------
	// Concurrent / rapid start-stop
	// ------------------------------------------------------------------
	describe('rapid start/stop', () => {
		it('does not crash on rapid start/stop of the same source', async () => {
			await manager.init();
			const cb = createCallback();

			for (let i = 0; i < 10; i++) {
				manager.start('src1', cb, 1000);
				manager.stop('src1');
			}

			// Should not throw; callback invoked once per stop
			expect(cb).toHaveBeenCalledTimes(10);
		});

		it('handles two sources started and stopped in quick succession', async () => {
			await manager.init();
			const cb1 = createCallback();
			const cb2 = createCallback();

			manager.start('A', cb1, 500);
			manager.start('B', cb2, 500);
			manager.stop('A');
			manager.stop('B');
			manager.start('A', cb1, 1000);

			// Advance — only 'A' should fire
			vi.advanceTimersByTime(1000);
			expect(cb1).toHaveBeenCalledTimes(2); // 1 final-stop + 1 timer fire
			expect(cb2).toHaveBeenCalledTimes(1); // only the final-stop
		});
	});

	// ------------------------------------------------------------------
	// Pause / resume (Capacitor lifecycle integration)
	// ------------------------------------------------------------------
	describe('pause / resume', () => {
		it('pauses polling when Capacitor pause fires', async () => {
			await manager.init();

			// Grab the pause handler that was registered
			const pauseHandler = mockAddListener.mock.calls.find(
				([event]) => event === 'pause'
			)?.[1] as () => void;
			expect(pauseHandler).toBeDefined();

			const cb = createCallback();
			manager.start('src1', cb, 1000);

			// Let one interval fire
			vi.advanceTimersByTime(1000);
			expect(cb).toHaveBeenCalledTimes(1);

			// Fire pause
			pauseHandler();
			vi.advanceTimersByTime(2000);

			// Callback should NOT have been called again (timers cleared)
			expect(cb).toHaveBeenCalledTimes(1);
		});

		it('resumes polling when Capacitor resume fires', async () => {
			await manager.init();

			const pauseHandler = mockAddListener.mock.calls.find(
				([event]) => event === 'pause'
			)?.[1] as () => void;
			const resumeHandler = mockAddListener.mock.calls.find(
				([event]) => event === 'resume'
			)?.[1] as () => void;
			expect(pauseHandler).toBeDefined();
			expect(resumeHandler).toBeDefined();

			const cb = createCallback();
			manager.start('src1', cb, 1000);

			vi.advanceTimersByTime(1000);
			expect(cb).toHaveBeenCalledTimes(1);

			// Pause
			pauseHandler();
			vi.advanceTimersByTime(2000);
			expect(cb).toHaveBeenCalledTimes(1); // no new calls

			// Resume — restarts the timer with the default 30s interval
			resumeHandler();
			vi.advanceTimersByTime(30_000);
			expect(cb).toHaveBeenCalledTimes(2);
		});
	});
});
