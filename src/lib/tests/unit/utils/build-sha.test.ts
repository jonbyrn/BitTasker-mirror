import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveGitSha, shortBuildLabel } from '$lib/utils/build-sha';

const FULL = '0123456789abcdef0123456789abcdef01234567';

describe('resolveGitSha', () => {
	it('prefers an explicit VITE_GIT_SHA', () => {
		expect(
			resolveGitSha(
				{
					VITE_GIT_SHA: FULL,
					PREVIEW_SHA: 'a'.repeat(40),
					CI_COMMIT_SHA: 'b'.repeat(40)
				},
				'c'.repeat(40)
			)
		).toBe(FULL);
	});

	it('uses PREVIEW_SHA ahead of the checkout and the CI ref', () => {
		const preview = 'a'.repeat(40);
		expect(
			resolveGitSha(
				{ PREVIEW_SHA: preview, CI_COMMIT_SHA: 'f0b5c631'.padEnd(40, '0') },
				'b'.repeat(40)
			)
		).toBe(preview);
	});

	it('uses the checkout ahead of CI commit variables', () => {
		const head = 'd'.repeat(40);
		expect(
			resolveGitSha(
				{
					CI_COMMIT_SHA: 'e'.repeat(40),
					WORKERS_CI_COMMIT_SHA: 'f'.repeat(40),
					CF_PAGES_COMMIT_SHA: '1'.repeat(40)
				},
				head
			)
		).toBe(head);
	});

	it('uses the CI commit only when the checkout is unavailable', () => {
		const ci = 'c'.repeat(40);
		expect(resolveGitSha({ CI_COMMIT_SHA: ci }, '')).toBe(ci);
	});

	it('falls back to a short checkout id', () => {
		expect(resolveGitSha({ VITE_BUILD_SHA: 'ignored' }, 'abc1234')).toBe('abc1234');
	});

	it('returns unknown when nothing identifies the commit', () => {
		expect(resolveGitSha({}, 'not-a-sha')).toBe('unknown');
	});
});

describe('shortBuildLabel', () => {
	it('prefers the sandbox short sha', () => {
		expect(shortBuildLabel({ VITE_BUILD_SHA: '5a7745ac', VITE_GIT_SHA: 'b'.repeat(40) })).toBe(
			'5a7745a'
		);
	});

	it('falls back to the git sha, then local', () => {
		expect(shortBuildLabel({ VITE_GIT_SHA: 'abc1234' })).toBe('abc1234');
		expect(shortBuildLabel({ VITE_BUILD_SHA: 'local' })).toBe('local');
		expect(shortBuildLabel({})).toBe('local');
	});
});

describe('build identifier', () => {
	it('declares a build-sha meta tag filled from the public git sha', () => {
		const html = readFileSync(resolve('src/app.html'), 'utf8');
		expect(html).toContain('<meta name="build-sha" content="%sveltekit.env.PUBLIC_GIT_SHA%" />');
	});

	it('locks the public header to 64px below 1280 and 73px from 1280', () => {
		const source = readFileSync(resolve('src/lib/components/topbar/PublicTopBar.svelte'), 'utf8');
		expect(source).toMatch(/height:\s*64px/);
		expect(source).toMatch(/min-height:\s*64px/);
		expect(source).toMatch(/@media \(min-width:\s*1280px\)[\s\S]*height:\s*73px/);
		expect(source).toMatch(/@media \(min-width:\s*1280px\)[\s\S]*min-height:\s*73px/);
	});
});
