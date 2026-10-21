import { isStaffRole } from './roles';
import type { RebookDraft } from './types';

const KEY = 'bittasker-staff-rebook';

export function saveRebook(draft: RebookDraft): void {
	if (typeof sessionStorage === 'undefined') return;
	sessionStorage.setItem(KEY, JSON.stringify(draft));
}

export function takeRebook(): RebookDraft | null {
	if (typeof sessionStorage === 'undefined') return null;
	const raw = sessionStorage.getItem(KEY);
	sessionStorage.removeItem(KEY);
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as Partial<RebookDraft>;
		if (!parsed || !isStaffRole(String(parsed.role ?? ''))) return null;
		return {
			role: parsed.role,
			location: String(parsed.location ?? ''),
			hourlyRateUsd: Number(parsed.hourlyRateUsd) || 0,
			requirements: String(parsed.requirements ?? ''),
			invitedPubkey: String(parsed.invitedPubkey ?? ''),
			headcount: 1
		};
	} catch {
		return null;
	}
}
