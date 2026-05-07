#!/usr/bin/env node
/**
 * BitTasker Nostr Event Debugger — CLI Tool
 *
 * Fetches all contract/bid/status events for a given npub from the relay.
 * Shows event chains, tags, and identifies potential issues.
 *
 * Usage:
 *   node scripts/nostr-debug.mjs <npub-or-hex>
 *   node scripts/nostr-debug.mjs npub1s8k3lhhf6t5eepfgmquzt45rwhqqgdsh5lh9zec93y9egpt7m34qsvgrqj
 *   node scripts/nostr-debug.mjs npub1... --relay wss://relay1-dev.bittasker.com
 *
 * Options:
 *   --relay <url>     Relay URL (default: wss://relay1.bittasker.com)
 *   --full            Show full event JSON including encrypted content
 *   --kinds <nums>    Comma-separated kind numbers (default: 30006,31006,30007,30008,31000)
 *   --limit <n>       Max events per filter (default: 500)
 */

import { nip19, SimplePool } from 'nostr-tools';

// ── Config ──
const RELAY = process.argv.includes('--relay')
  ? process.argv[process.argv.indexOf('--relay') + 1]
  : 'wss://relay1.bittasker.com';

const SHOW_FULL = process.argv.includes('--full');

const KINDS = process.argv.includes('--kinds')
  ? process.argv[process.argv.indexOf('--kinds') + 1].split(',').map(Number)
  : [30006, 31006, 30007, 30008, 31000];

const LIMIT = process.argv.includes('--limit')
  ? parseInt(process.argv[process.argv.indexOf('--limit') + 1])
  : 500;

const npubOrHex = process.argv[2];

// ── Helpers ──
const KIND_NAMES = {
  30006: 'Contract',
  31006: 'ContractStatus',
  30007: 'Bid',
  30008: 'BidStatus',
  31000: 'Task',
  5: 'Deletion',
  0: 'Profile',
  4: 'DM',
};

const STATUS_LABELS = {
  '0': 'Funded',
  '1': 'InDispute',
  '2': 'DisputeResolved(FINAL)',
  '3': 'DisputeUnresolved(FINAL)',
  '4': 'Completed',
  '5': 'Cancelled(FINAL)',
  '6': 'Refunded(FINAL)',
  '7': 'FundsReleased(FINAL)',
  '8': 'FundsClaimed(FINAL)',
  '9': 'NoShow(FINAL)',
  '10': 'WorkInProgress',
  '11': 'InDisputeWorkInProgress',
  '12': 'PendingFunding',
  '13': 'InProgress',
  '14': 'PendingCompletion',
  '15': 'PendingCancellation',
  '16': 'PendingAcceptance',
};

function fmtTime(ts) {
  return new Date(ts * 1000).toISOString().replace('T', ' ').slice(0, 19);
}

function short(h, n = 8) {
  if (!h) return '(none)';
  return h.slice(0, n) + '...' + h.slice(-n);
}

function tagVal(tags, key) {
  return tags.find(t => t[0] === key)?.[1] || null;
}

function statusLabel(s) {
  return STATUS_LABELS[s] || s || '(none)';
}

function color(kind) {
  const c = { 30006: 35, 31006: 36, 30007: 33, 30008: 31, 31000: 95, 5: 91 };
  return c[kind] || 0;
}

// ── Main ──
async function main() {
  if (!npubOrHex) {
    console.error('Usage: node nostr-debug.mjs <npub-or-hex> [--relay <url>] [--full]');
    process.exit(1);
  }

  // Decode npub → hex
  let hexPubkey;
  if (/^[0-9a-fA-F]{64}$/.test(npubOrHex)) {
    hexPubkey = npubOrHex;
  } else if (npubOrHex.startsWith('npub1')) {
    try {
      const decoded = nip19.decode(npubOrHex);
      if (decoded.type !== 'npub') throw new Error(`Not an npub: ${decoded.type}`);
      hexPubkey = decoded.data;
    } catch (e) {
      console.error(`Failed to decode npub: ${e.message}`);
      process.exit(1);
    }
  } else {
    console.error('Invalid input. Expected npub1... or 64-char hex.');
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  BitTasker Nostr Event Debugger');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  npub:     ${npubOrHex}`);
  console.log(`  hex:      ${hexPubkey}`);
  console.log(`  relay:    ${RELAY}`);
  console.log(`  kinds:    ${KINDS.join(', ')}`);
  console.log(`  limit:    ${LIMIT}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const pool = new SimplePool();

  try {
    // Query 1: Events authored by this pubkey
    console.log('─── Querying: AUTHORED events ───');
    const authoredEvents = await pool.querySync([RELAY], {
      kinds: KINDS,
      authors: [hexPubkey],
      limit: LIMIT,
    });
    console.log(`  Found: ${authoredEvents.length} events authored by this npub\n`);

    // Query 2: Events where this pubkey is a participant (p-tagged)
    console.log('─── Querying: PARTICIPANT (#p) events ───');
    const participantEvents = await pool.querySync([RELAY], {
      kinds: KINDS,
      '#p': [hexPubkey],
      limit: LIMIT,
    });
    console.log(`  Found: ${participantEvents.length} events where npub is #p participant\n`);

    // Merge and deduplicate
    const eventMap = new Map();
    for (const e of authoredEvents) eventMap.set(e.id, { ...e, _role: 'author' });
    for (const e of participantEvents) {
      if (eventMap.has(e.id)) {
        eventMap.get(e.id)._role = 'author+participant';
      } else {
        eventMap.set(e.id, { ...e, _role: 'participant' });
      }
    }

    const allEvents = [...eventMap.values()].sort((a, b) => a.created_at - b.created_at);
    console.log(`─── Total unique events: ${allEvents.length} ───\n`);

    // Group by kind
    const byKind = {};
    for (const e of allEvents) {
      byKind[e.kind] = byKind[e.kind] || [];
      byKind[e.kind].push(e);
    }

    // Print summary
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  SUMMARY BY KIND');
    console.log('═══════════════════════════════════════════════════════════════');
    for (const [kind, events] of Object.entries(byKind).sort(([a], [b]) => Number(a) - Number(b))) {
      const name = KIND_NAMES[kind] || `Kind-${kind}`;
      console.log(`  \x1b[${color(Number(kind))}m${name} (${kind})\x1b[0m: ${events.length} events`);
    }

    // Print event chains
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  EVENT CHAINS (grouped by task ID from #t tag)');
    console.log('═══════════════════════════════════════════════════════════════');

    // Group events by task ID (from #t tag)
    const byTask = new Map();
    const orphanEvents = [];
    for (const e of allEvents) {
      const taskId = tagVal(e.tags, 't');
      if (taskId) {
        if (!byTask.has(taskId)) byTask.set(taskId, []);
        byTask.get(taskId).push(e);
      } else {
        orphanEvents.push(e);
      }
    }

    if (byTask.size === 0) {
      console.log('  ⚠️  No events with #t (task) tags found!');
      console.log('  This means NO contracts, bids, or tasks are linked to task IDs.');
      console.log('  Possible causes:');
      console.log('    1. Events were never published');
      console.log('    2. Events are on a different relay');
      console.log('    3. Events were deleted (kind 5 deletion events)');
      console.log('    4. The npub has never interacted with any tasks\n');
    }

    for (const [taskId, events] of byTask) {
      console.log(`\n  ┌─ Task: ${short(taskId, 12)} (${events.length} events)`);

      // Sort by time
      const sorted = events.sort((a, b) => a.created_at - b.created_at);

      for (const e of sorted) {
        const name = KIND_NAMES[e.kind] || `Kind-${e.kind}`;
        const status = tagVal(e.tags, 's');
        const escrowId = tagVal(e.tags, 'd') || tagVal(e.tags, 'r');
        const refEventId = tagVal(e.tags, 'e');
        const roleIcon = e._role === 'author' ? '✎' : '→';
        const kindColor = color(e.kind);

        const parts = [
          `\x1b[${kindColor}m${roleIcon} ${name.padEnd(15)}\x1b[0m`,
          `\x1b[2m${fmtTime(e.created_at)}\x1b[0m`,
        ];
        if (status) parts.push(`status=\x1b[1m${statusLabel(status)}\x1b[0m`);
        if (escrowId) parts.push(`escrow=${short(escrowId, 6)}`);
        if (refEventId) parts.push(`ref=${short(refEventId, 6)}`);
        parts.push(`id=${short(e.id, 6)}`);

        console.log(`  │  ${parts.join('  ')}`);
      }

      console.log(`  └─`);
    }

    // Print orphan events
    if (orphanEvents.length > 0) {
      console.log(`\n  ┌─ Events without #t tag: ${orphanEvents.length} events`);
      for (const e of orphanEvents.sort((a, b) => a.created_at - b.created_at)) {
        const name = KIND_NAMES[e.kind] || `Kind-${e.kind}`;
        const status = tagVal(e.tags, 's');
        const escrowId = tagVal(e.tags, 'd') || tagVal(e.tags, 'r');
        const kindColor = color(e.kind);
        console.log(`  │  \x1b[${kindColor}m${name}\x1b[0m \x1b[2m${fmtTime(e.created_at)}\x1b[0m escrow=${short(escrowId, 6)} status=${statusLabel(status)} id=${short(e.id, 6)}`);
      }
      console.log(`  └─`);
    }

    // Contract-specific analysis
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  CONTRACT ANALYSIS');
    console.log('═══════════════════════════════════════════════════════════════');

    const contracts = allEvents.filter(e => e.kind === 30006);
    const contractStatuses = allEvents.filter(e => e.kind === 31006);
    const bids = allEvents.filter(e => e.kind === 30007);
    const bidStatuses = allEvents.filter(e => e.kind === 30008);

    if (contracts.length === 0) {
      console.log('  ❌ NO contract events (kind 30006) found!');
      console.log('  This is why the contracts tab is empty.');
      console.log('');
      console.log('  Check:');
      console.log('    1. Were any bids (30007) accepted (30008 status=accepted)?');
      console.log('    2. Did the escrow funding transaction succeed on RSK?');
      console.log('    3. Did publishContractEvent() succeed after funding?');
      console.log('    4. Check browser console for errors during bid acceptance flow');
    } else {
      contracts.forEach(c => {
        const escrowId = tagVal(c.tags, 'd');
        const status = tagVal(c.tags, 's');
        const network = tagVal(c.tags, 'n');
        const version = tagVal(c.tags, 'v');
        const taskId = tagVal(c.tags, 't');
        const participants = c.tags.filter(t => t[0] === 'p').map(t => t[1]);

        console.log(`  Contract: escrow=${short(escrowId, 8)} status=${status} network=${network} ver=${version}`);
        console.log(`    Task:    ${short(taskId, 12)}`);
        console.log(`    Created: ${fmtTime(c.created_at)}`);
        console.log(`    By:      ${short(c.pubkey, 8)} (is this the client?)`);
        console.log(`    Parties: ${participants.map(p => short(p, 8)).join(', ')}`);

        // Find associated status events
        const relatedStatuses = contractStatuses.filter(s => tagVal(s.tags, 'e') === c.id);
        if (relatedStatuses.length === 0) {
          console.log(`    ⚠️  NO status events found for this contract!`);
        } else {
          console.log(`    Status events (${relatedStatuses.length}):`);
          relatedStatuses.forEach(s => {
            const action = tagVal(s.tags, 's');
            console.log(`      - ${fmtTime(s.created_at)}: ${statusLabel(action)} by ${short(s.pubkey, 8)}`);
          });
        }
      });
    }

    // Bid analysis
    console.log('\n  BID ANALYSIS:');
    if (bids.length === 0) {
      console.log('  No bid events (30007) found');
    } else {
      bids.forEach(b => {
        const status = tagVal(b.tags, 's');
        const taskId = tagVal(b.tags, 't');
        console.log(`  Bid: task=${short(taskId, 12)} status=${statusLabel(status)} at ${fmtTime(b.created_at)} by ${short(b.pubkey, 8)}`);
      });
    }

    if (bidStatuses.length === 0) {
      console.log('  No bid status events (30008) found');
    } else {
      bidStatuses.forEach(bs => {
        const status = tagVal(bs.tags, 's');
        const taskId = tagVal(bs.tags, 't');
        const refBid = tagVal(bs.tags, 'e');
        console.log(`  BidStatus: task=${short(taskId, 12)} status=${statusLabel(status)} ref=${short(refBid, 8)} at ${fmtTime(bs.created_at)} by ${short(bs.pubkey, 8)}`);
      });
    }

    // Deletion events check
    const deletions = allEvents.filter(e => e.kind === 5);
    if (deletions.length > 0) {
      console.log('\n  ⚠️  DELETION EVENTS FOUND:');
      deletions.forEach(d => {
        const deletedEventId = tagVal(d.tags, 'e');
        const deletedKind = tagVal(d.tags, 'k');
        console.log(`  Kind 5: deleted event ${short(deletedEventId, 8)} (was kind ${deletedKind}) at ${fmtTime(d.created_at)}`);
      });
    }

    // Network tag analysis
    console.log('\n  NETWORK TAG ANALYSIS:');
    const networkTags = new Set();
    allEvents.forEach(e => {
      const n = tagVal(e.tags, 'n');
      if (n) networkTags.add(n);
    });
    if (networkTags.size === 0) {
      console.log('  ⚠️  NO #n (network) tags found on any events');
      console.log('  Current environment VITE_RSK_NETWORK filters by network.');
      console.log('  If contracts have no #n tag, they might not match the filter.');
    } else {
      console.log(`  Networks found: ${[...networkTags].join(', ')}`);
    }

    // Full dump if requested
    if (SHOW_FULL) {
      console.log('\n═══════════════════════════════════════════════════════════════');
      console.log('  FULL EVENT DUMP');
      console.log('═══════════════════════════════════════════════════════════════');
      for (const e of allEvents) {
        console.log(JSON.stringify(e, null, 2));
      }
    }

  } finally {
    pool.close([RELAY]);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
