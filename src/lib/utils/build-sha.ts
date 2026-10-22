const SHA = /^[0-9a-f]{7,40}$/i;

/**
 * Commit id for the public build-sha meta tag.
 * Preview pipelines keep CI_COMMIT_SHA on the protected ref, so the built
 * commit is PREVIEW_SHA, then the checkout (`git rev-parse HEAD`).
 */
export function resolveGitSha(env: Record<string, string | undefined>, head = ''): string {
	const ordered = [
		env.VITE_GIT_SHA,
		env.PREVIEW_SHA,
		head,
		env.CI_COMMIT_SHA,
		env.WORKERS_CI_COMMIT_SHA,
		env.CF_PAGES_COMMIT_SHA
	];
	for (const value of ordered) {
		const sha = value?.trim() ?? '';
		if (SHA.test(sha)) return sha;
	}
	return 'unknown';
}

/** Short id shown on the wallet page. Sandbox sets VITE_BUILD_SHA from CI_COMMIT_SHORT_SHA. */
export function shortBuildLabel(env: { VITE_BUILD_SHA?: string; VITE_GIT_SHA?: string }): string {
	const build = env.VITE_BUILD_SHA?.trim() ?? '';
	if (/^[0-9a-f]{4,40}$/i.test(build)) return build.slice(0, 7);
	const git = env.VITE_GIT_SHA?.trim() ?? '';
	if (/^[0-9a-f]{4,40}$/i.test(git)) return git.slice(0, 7);
	return 'local';
}
