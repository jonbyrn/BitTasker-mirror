import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('task detail effects', () => {
	it('does not redraw map markers inside the effect that depends on them', () => {
		const source = readFileSync(
			resolve('src/lib/components/maps/TaskLocationMap.svelte'),
			'utf8'
		);
		const start = source.indexOf('const epoch = $geocodeEpoch');
		expect(start).toBeGreaterThan(0);
		const effect = source.slice(start, start + 280);
		expect(effect).toContain('untrack(');
		expect(effect).toContain('void updateMarkers()');
		expect(effect).not.toMatch(/return;\s*void updateMarkers\(\)/);
	});

	it('loads a task without writing the same state the effect reads', () => {
		const source = readFileSync(
			resolve('src/lib/components/task/TaskDetailsView.svelte'),
			'utf8'
		);
		expect(source).not.toContain('previousTaskId = $state');
		const start = source.indexOf('const taskAddress = `${taskId}:${author ?? \'\'}`');
		expect(start).toBeGreaterThan(0);
		const effect = source.slice(start, start + 320);
		expect(effect).toContain('loadedTaskAddress = taskAddress');
		expect(effect).toContain('untrack(');
		expect(effect).toContain('void loadTaskDetails(taskId)');
	});
});
