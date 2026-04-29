import { createDebug } from '$lib/utils/debug';
import type { ParallelEffectFailure, ParallelEffectsReport } from '$lib/utils/contract/v2/types';

const d = createDebug('contract:parallelEffects');

/**
 * Runs named async tasks in parallel and collects rejections without throwing.
 * Use for post-broadcast side effects (Nostr, push, DMs, …).
 * Logs start/done (or failure) per task and a short summary when debug is enabled.
 */
export async function runParallelNamed(
	tasks: ReadonlyArray<{ name: string; run: () => Promise<unknown> }>
): Promise<ParallelEffectsReport> {
	const batchStart = performance.now();
	d.log('runParallelNamed: batch start', { tasks: tasks.map((t) => t.name) });

	const runOne = async (name: string, run: () => Promise<unknown>) => {
		const t0 = performance.now();
		d.log(`runParallelNamed: → ${name} (started)`);
		try {
			await run();
			d.log(`runParallelNamed: ✓ ${name} (ok)`, { ms: Math.round(performance.now() - t0) });
		} catch (error) {
			d.warn(`runParallelNamed: ✗ ${name} (rejected)`, {
				ms: Math.round(performance.now() - t0),
				error
			});
			throw error;
		}
	};

	const settled = await Promise.allSettled(tasks.map((t) => runOne(t.name, t.run)));
	const failures: ParallelEffectFailure[] = [];
	let ok = 0;
	settled.forEach((result, i) => {
		if (result.status === 'rejected') {
			failures.push({ name: tasks[i].name, error: result.reason });
		} else {
			ok += 1;
		}
	});

	d.log('runParallelNamed: batch end', {
		ms: Math.round(performance.now() - batchStart),
		ok,
		failed: failures.length
	});

	return { failures };
}
