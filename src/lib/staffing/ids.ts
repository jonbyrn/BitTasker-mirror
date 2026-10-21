import { nip19 } from 'nostr-tools';

const TASK_CONTRACT = /^contract-[0-9a-f]{64}-[0-9a-f]{64}$/i;

export function pubkeyHex(value: string): string {
	const trimmed = value.trim();
	if (/^[0-9a-f]{64}$/i.test(trimmed)) return trimmed.toLowerCase();
	if (trimmed.startsWith('npub1')) {
		try {
			const decoded = nip19.decode(trimmed);
			if (decoded.type === 'npub' && typeof decoded.data === 'string') return decoded.data;
		} catch {
			return '';
		}
	}
	return '';
}

export function samePerson(left: string, right: string): boolean {
	const a = pubkeyHex(left);
	const b = pubkeyHex(right);
	return a !== '' && a === b;
}

/** Staff contracts must not look like a task contract, or release would complete a task. */
export function staffContractId(jobId: string, workerPubkey: string): string {
	const worker = pubkeyHex(workerPubkey).slice(0, 12) || 'worker';
	const job = jobId
		.trim()
		.replace(/[^a-zA-Z0-9-]/g, '')
		.slice(0, 36);
	const id = `staff-${job}-${worker}`;
	if (TASK_CONTRACT.test(id)) throw new Error('contract-id');
	return id;
}
