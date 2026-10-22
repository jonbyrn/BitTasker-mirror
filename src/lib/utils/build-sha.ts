const FULL_SHA = /^[0-9a-f]{40}$/i;
const SHA = /^[0-9a-f]{7,40}$/i;

/**
 * Full commit id for the public build-sha meta tag.
 * Prefers an explicit full SHA, then `git rev-parse HEAD`, then a shorter id.
 */
export function resolveGitSha(
	env: Record<string, string | undefined>,
	head = ''
): string {
	const named = [
		env.VITE_GIT_SHA,
		env.CI_COMMIT_SHA,
		env.WORKERS_CI_COMMIT_SHA,
		env.CF_PAGES_COMMIT_SHA
	];
	for (const value of named) {
		const sha = value?.trim() ?? '';
		if (FULL_SHA.test(sha)) return sha;
	}
	const fromGit = head.trim();
	if (FULL_SHA.test(fromGit)) return fromGit;
	for (const value of [...named, fromGit]) {
		const sha = value?.trim() ?? '';
		if (SHA.test(sha)) return sha;
	}
	return 'unknown';
}
