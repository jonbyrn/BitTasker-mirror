/** Short commit shown in Settings. Anything that is not a git sha stays "local". */
export function buildLabel(sha: string | undefined | null): string {
	const value = (sha ?? '').trim().toLowerCase();
	if (!/^[0-9a-f]{7,40}$/.test(value)) return 'local';
	return value;
}
