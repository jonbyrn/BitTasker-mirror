/**
 * Write a new assistant nsec to a file and print only the npub.
 * The secret never goes to stdout or stderr.
 */
import { writeFileSync } from 'node:fs';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { nip19 } from 'nostr-tools';

const file = process.argv[2];
if (!file || file === '-' || file.startsWith('/dev/fd/') || file.startsWith('/dev/stdout')) {
	process.stderr.write('Refusing to write the assistant secret to stdout.\n');
	process.exit(1);
}

const secret = generateSecretKey();
const nsec = nip19.nsecEncode(secret);
const npub = nip19.npubEncode(getPublicKey(secret));
if (!nsec.startsWith('nsec1') || !npub.startsWith('npub1') || /[\r\n]/.test(nsec + npub)) {
	process.exit(1);
}

writeFileSync(file, nsec, { mode: 0o600 });
process.stdout.write(`${npub}\n`);
