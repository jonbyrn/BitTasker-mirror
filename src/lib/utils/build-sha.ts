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
