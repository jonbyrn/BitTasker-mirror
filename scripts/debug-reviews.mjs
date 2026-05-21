/**
 * Debug script: simulates getPendingReviewCount logic against a live relay.
 *
 * Runs the EXACT same 3-query algorithm implemented in helpers.ts so we can
 * verify the fix before running the full app.
 *
 * Usage: node scripts/debug-reviews.mjs
 */
import { nip19, SimplePool } from 'nostr-tools';

const RELAY_URL = 'wss://relay1-dev.bittasker.com';
const USER_NPUB = 'npub1famq36qw6jve8yrvng8vtrcjza8ssuep30p5q6klh3yx4h0gh56qa3xdda';
const NETWORK = 'mainnet';

const KIND_CONTRACT = 30006;
const KIND_CONTRACT_STATUS = 31006;
const KIND_ATTESTATION = 6431;

// Statuses that allow a review (mirrors isReviewableStatus in status-mapper.ts)
const REVIEWABLE_STATUS_NUMBERS = new Set([2, 7, 8]); // DisputeResolved=2, FundsReleased=7, FundsClaimed=8

function isReviewableStatus(rawS) {
	const n = parseInt(rawS, 10);
	return !isNaN(n) && REVIEWABLE_STATUS_NUMBERS.has(n);
}

function nostrPubkeysMatch(a, b) {
	if (!a || !b) return false;
	return a.toLowerCase() === b.toLowerCase();
}

const { data: userPubkeyHex } = nip19.decode(USER_NPUB);

console.log('=== getPendingReviewCount simulation ===');
console.log('user npub :', USER_NPUB);
console.log('user hex  :', userPubkeyHex);
console.log('relay     :', RELAY_URL);
console.log('network   :', NETWORK);
console.log('');

const pool = new SimplePool();

async function main() {
	try {
		// ── QUERY 1: Kind 30006 contracts where user is a participant (#p) ────────
		console.log('QUERY 1 — Kind 30006 contracts (#p = user, #n = network) ...');
		const contractEvents = await pool.querySync([RELAY_URL], {
			kinds: [KIND_CONTRACT],
			'#p': [userPubkeyHex],
			'#n': [NETWORK]
		});
		console.log(`  → ${contractEvents.length} contract(s) found`);
		console.log('');

		if (contractEvents.length === 0) {
			console.log('No contracts → pending count = 0');
			return;
		}

		const contractIds = contractEvents.map((c) => c.id);
		const contractIdSet = new Set(contractIds);

		console.log('  Contracts:');
		for (const c of contractEvents) {
			const dTag = c.tags.find((t) => t[0] === 'd');
			const sTag = c.tags.find((t) => t[0] === 's');
			console.log(`    ${c.id.slice(0, 12)}...  paymentId=${dTag?.[1] ?? 'N/A'}  s=${sTag?.[1] ?? 'N/A'}`);
		}
		console.log('');

		// ── QUERY 2: Kind 6431 attestations with #e matching contract IDs ─────────
		console.log('QUERY 2 — Kind 6431 attestations (#e = contractIds) ...');
		const attestationEvents = await pool.querySync([RELAY_URL], {
			kinds: [KIND_ATTESTATION],
			'#e': contractIds
		});
		console.log(`  → ${attestationEvents.length} attestation(s) returned by relay`);
		console.log('');

		const reviewedContractIds = new Set();

		// OLD buggy approach (for comparison only)
		const reviewedContractIds_BUGGY = new Set();

		for (const att of attestationEvents) {
			let attContent;
			try {
				attContent = JSON.parse(att.content);
			} catch {
				console.log(`  [skip] attestation ${att.id.slice(0, 8)}: malformed content`);
				continue;
			}

			const isFromCurrentUser = nostrPubkeysMatch(attContent.reviewerPubkey, userPubkeyHex);
			const eTags = att.tags.filter((t) => t[0] === 'e');

			console.log(`  Attestation ${att.id.slice(0, 12)}...`);
			console.log(`    reviewerPubkey : ${attContent.reviewerPubkey?.slice(0, 12)}...  isCurrentUser=${isFromCurrentUser}`);
			console.log(`    e tags (${eTags.length}):`);
			for (const tag of eTags) {
				const inContractSet = contractIdSet.has(tag[1]);
				console.log(`      ${tag[1].slice(0, 12)}...  inContractSet=${inContractSet}`);
			}

			if (!isFromCurrentUser) {
				console.log(`    → skip (not current user's attestation)`);
				console.log('');
				continue;
			}

			// BUGGY: reads only first e tag
			const firstETag = eTags[0]?.[1] ?? '';
			if (firstETag) reviewedContractIds_BUGGY.add(firstETag);
			const buggyMatch = contractIdSet.has(firstETag);
			console.log(`    BUGGY tagValue('e') = ${firstETag.slice(0, 12)}...  matchesContract=${buggyMatch}`);

			// FIXED: check ALL e tags, intersect with contractIdSet
			let fixedMatch = false;
			for (const tag of eTags) {
				if (contractIdSet.has(tag[1])) {
					reviewedContractIds.add(tag[1]);
					fixedMatch = true;
					console.log(`    FIXED match on e tag: ${tag[1].slice(0, 12)}...  ✓`);
					break;
				}
			}
			if (!fixedMatch) {
				console.log(`    FIXED → no e tag matched a known contract ID`);
			}
			console.log('');
		}

		console.log('');
		console.log('After attestation processing:');
		console.log(`  BUGGY  reviewedContractIds size = ${reviewedContractIds_BUGGY.size}`);
		console.log(`  FIXED  reviewedContractIds size = ${reviewedContractIds.size}`);
		console.log('');

		// ── QUERY 3: Kind 31006 status for unreviewed contracts ───────────────────
		const unreviewedIds = contractIds.filter((id) => !reviewedContractIds.has(id));
		const unreviewedIds_BUGGY = contractIds.filter((id) => !reviewedContractIds_BUGGY.has(id));

		console.log(`QUERY 3 — Kind 31006 status for unreviewed contracts ...`);
		console.log(`  FIXED:  ${unreviewedIds.length} unreviewed contracts to check`);
		console.log(`  BUGGY:  ${unreviewedIds_BUGGY.length} unreviewed contracts to check`);
		console.log('');

		if (unreviewedIds.length === 0 && unreviewedIds_BUGGY.length === 0) {
			console.log('Nothing to query for statuses.');
		} else {
			// Query statuses for the union (so we see both results in one query)
			const allUnreviewedIds = [...new Set([...unreviewedIds, ...unreviewedIds_BUGGY])];
			const statusEvents = await pool.querySync([RELAY_URL], {
				kinds: [KIND_CONTRACT_STATUS],
				'#e': allUnreviewedIds
			});
			console.log(`  → ${statusEvents.length} status event(s) returned`);
			console.log('');

			// Keep only latest per contract (mirrors fetchLatestStatusFromNostr)
			const newest = new Map();
			for (const ev of statusEvents) {
				const eTag = ev.tags.find((t) => t[0] === 'e');
				if (!eTag) continue;
				const parentId = eTag[1];
				const existing = newest.get(parentId);
				if (!existing || ev.created_at > existing.created_at) {
					newest.set(parentId, { created_at: ev.created_at, rawS: ev.tags.find((t) => t[0] === 's')?.[1] ?? '' });
				}
			}

			let count_FIXED = 0;
			let count_BUGGY = 0;

			console.log('  Status per unreviewed contract:');
			for (const [contractId, { rawS }] of newest) {
				const reviewable = isReviewableStatus(rawS);
				const inFixed = unreviewedIds.includes(contractId);
				const inBuggy = unreviewedIds_BUGGY.includes(contractId);
				console.log(`    ${contractId.slice(0, 12)}...  s=${rawS}  reviewable=${reviewable}  inFixed=${inFixed}  inBuggy=${inBuggy}`);
				if (inFixed && reviewable) count_FIXED++;
				if (inBuggy && reviewable) count_BUGGY++;
			}

			// Contracts with no status event are not counted (no reviewable status known)
			const noStatusFixed = unreviewedIds.filter((id) => !newest.has(id));
			const noStatusBuggy = unreviewedIds_BUGGY.filter((id) => !newest.has(id));
			if (noStatusFixed.length > 0) {
				console.log(`\n  Contracts with no Kind 31006 event (FIXED, not counted): ${noStatusFixed.length}`);
				for (const id of noStatusFixed) console.log(`    ${id.slice(0, 12)}...`);
			}
			if (noStatusBuggy.length > 0 && noStatusBuggy.some((id) => !noStatusFixed.includes(id))) {
				console.log(`\n  Additional contracts with no Kind 31006 event (BUGGY only, not counted): ${noStatusBuggy.filter((id) => !noStatusFixed.includes(id)).length}`);
			}

			console.log('');
			console.log('══════════════════════════════════');
			console.log(`  BUGGY  pending review count = ${count_BUGGY}`);
			console.log(`  FIXED  pending review count = ${count_FIXED}`);
			console.log('══════════════════════════════════');
			console.log('');
			console.log(`Expected: 1 (the user reports 1 real pending review)`);
			if (count_FIXED === 1) {
				console.log('✅ FIXED count matches expected!');
			} else {
				console.log(`❌ FIXED count does not match expected (got ${count_FIXED})`);
			}
		}
	} catch (err) {
		console.error('Error:', err);
	} finally {
		pool.close([RELAY_URL]);
		process.exit(0);
	}
}

main();
