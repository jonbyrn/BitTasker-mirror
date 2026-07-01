<script lang="ts">
	/* eslint-disable
		svelte/prefer-svelte-reactivity,
		svelte/require-each-key
	*/

	import { onDestroy } from 'svelte';
	import { SimplePool, nip19 } from 'nostr-tools';
	import type { NostrEvent } from 'nostr-tools';
	import IconMagnify from '~icons/mdi/magnify';
	import IconClose from '~icons/mdi/close';

	// ── Constants ──
	const KIND_NAMES: Record<number, string> = {
		30006: 'Contract',
		31006: 'ContractStatus',
		30007: 'Bid',
		30008: 'BidStatus',
		31000: 'Task',
		31002: 'RecurringTask',
		5: 'Deletion',
		0: 'ProfileMeta',
		4: 'DM',
		1984: 'Report',
		30000: 'Skills',
		30002: 'Availability',

		30063: 'ProfileImg',
		30078: 'BoltzSwap',
		6420: 'ServiceQuoteReq',
		10002: 'RelayList',
		1063: 'FileMeta'
	};

	const TASK_STATUS_LABELS: Record<string, string> = {
		OPEN: 'Open',
		BID_ACCEPTED: 'Bid Accepted',
		ESCROW_FUNDED: 'Escrow Funded',
		IN_PROGRESS: 'In Progress',
		RESCOPED: 'Rescoped',
		RESCOPE_ACCEPTED: 'Rescope Accepted',
		COMPLETED: 'Completed',
		CANCELLED: 'Cancelled',
		REFUNDED: 'Refunded',
		DISPUTED: 'Disputed',
		DISPUTE_PROPOSAL: 'Dispute Proposal'
	};

	const STATUS_LABELS: Record<string, string> = {
		'0': 'Funded',
		'1': 'InDispute',
		'2': 'DisputeResolved',
		'3': 'DisputeUnresolved',
		'4': 'Completed',
		'5': 'Cancelled',
		'6': 'Refunded',
		'7': 'FundsReleased',
		'8': 'FundsClaimed',
		'9': 'NoShow',
		'10': 'WorkInProgress',
		'11': 'InDisputeWorkInProgress',
		'12': 'PendingFunding',
		'13': 'InProgress',
		pending: 'pending',
		accepted: 'accepted'
	};

	// ── State ──
	let npub = $state('');
	let hexPubkey = $state('');
	let relay = $state('wss://relay1.bittasker.com');
	let customRelay = $state('');
	let relayMode = $state<'preset' | 'custom'>('preset');
	let connected = $state(false);
	let connecting = $state(false);
	let events: (NostrEvent & { _role?: string })[] = $state([]);
	let logLines: { text: string; type: string; time: string }[] = $state([]);
	let view = $state<'timeline' | 'chain' | 'raw'>('timeline');
	let expandedEvents = $state(new Set<string>());
	let selectedKinds = $state(new Set([30006, 31006, 30007, 30008]));
	let showAuthor = $state(true);
	let showParticipant = $state(true);
	let pool: SimplePool | null = null;

	// Profile cache
	let profiles = $state(
		new Map<string, { name?: string; picture?: string; created_at?: number }>()
	);

	// Section toggles
	let section = $state<'explorer' | 'task-inspector' | 'profile-inspector'>('explorer');

	// Task inspector state
	let taskInspectorDtag = $state('');
	let taskInspectorLoading = $state(false);
	let taskInspectorEvents: (NostrEvent & { _role?: string })[] = $state([]);
	let taskInspectorAuthorProfile: { name?: string; picture?: string; created_at?: number } | null =
		$state(null);
	let taskInspectorParsedContent: Record<string, unknown> | null = $state(null);

	// Profile inspector state
	let profileInspectorInput = $state('');
	let profileInspectorLoading = $state(false);
	let profileInspectorEvents: NostrEvent[] = $state([]);
	let profileInspectorData: {
		name?: string;
		picture?: string;
		about?: string;
		created_at?: number;
		relays?: string[];
	} | null = $state(null);

	// ── Helpers ──
	function addLog(text: string, type: string = 'info') {
		logLines = [...logLines, { text, type, time: new Date().toLocaleTimeString() }];
	}
	function short(h: string | undefined, n: number = 8): string {
		if (!h) return '(none)';
		return h.slice(0, n) + '...' + h.slice(-n);
	}
	function fmtTime(ts: number): string {
		return new Date(ts * 1000).toISOString().replace('T', ' ').slice(0, 19);
	}
	function tagVal(tags: string[][], key: string): string | null {
		return tags.find((t) => t[0] === key)?.[1] ?? null;
	}
	function kindName(kind: number): string {
		return KIND_NAMES[kind] || `Kind-${kind}`;
	}
	function kindColor(kind: number): string {
		const c: Record<number, string> = {
			30006: '#6366f1',
			31006: '#06b6d4',
			30007: '#f59e0b',
			30008: '#f97316',
			31000: '#a855f7',
			5: '#ef4444',
			0: '#22c55e',
			10002: '#e879f9'
		};
		return c[kind] || '#8b90a0';
	}
	function statusLabel(s: string | null): string {
		if (!s) return '';
		return TASK_STATUS_LABELS[s] || STATUS_LABELS[s] || s;
	}
	function decodeNpub(input: string): string | null {
		const t = input.trim();
		if (/^[0-9a-fA-F]{64}$/.test(t)) return t;
		if (t.startsWith('npub1')) {
			try {
				const d = nip19.decode(t);
				return d.type === 'npub' ? d.data : null;
			} catch {
				return null;
			}
		}
		if (t.startsWith('nprofile1')) {
			try {
				const d = nip19.decode(t);
				return (d as { data?: { pubkey?: string } }).data?.pubkey || null;
			} catch {
				return null;
			}
		}
		return null;
	}
	function profileName(hex: string): string | null {
		const p = profiles.get(hex);
		return p?.name || null;
	}

	// ── Profile batch fetch ──
	async function resolveProfiles(pubkeys: string[]) {
		if (!pool || pubkeys.length === 0) return;
		const unique = [...new Set(pubkeys)].filter((k) => !profiles.has(k));
		if (unique.length === 0) return;
		try {
			const results = await pool.querySync([relay], {
				kinds: [0],
				authors: unique,
				limit: unique.length
			});
			for (const e of results) {
				try {
					const c = JSON.parse(e.content);
					profiles.set(e.pubkey, {
						name: c.display_name || c.displayName || c.name,
						picture: c.picture,
						created_at: e.created_at
					});
				} catch {
					profiles.set(e.pubkey, {});
				}
			}
			// Mark unfound
			for (const k of unique) {
				if (!profiles.has(k)) profiles.set(k, {});
			}
		} catch (e) {
			addLog(`Profile fetch error: ${e instanceof Error ? e.message : 'Unknown error'}`, 'error');
		}
	}

	// ── Connect (Event Explorer) ──
	async function connect() {
		const hex = decodeNpub(npub);
		if (!hex) {
			addLog('Invalid npub or hex', 'error');
			return;
		}
		hexPubkey = hex;
		if (pool) disconnect();
		connecting = true;
		pool = new SimplePool();

		const kinds =
			selectedKinds.size > 0 ? Array.from(selectedKinds) : [30006, 31006, 30007, 30008, 31000];
		addLog(`Connecting to ${relay}...`, 'info');
		addLog(`Querying: kinds=[${kinds.join(',')}], author+p-tag, limit=500`, 'info');

		try {
			const [authored, participant] = await Promise.all([
				pool.querySync([relay], { kinds, authors: [hex], limit: 500 }),
				pool.querySync([relay], { kinds, '#p': [hex], limit: 500 })
			]);
			addLog(`Authored: ${authored.length}, Participant: ${participant.length}`, 'success');

			const map = new Map<string, NostrEvent & { _role?: string }>();
			for (const e of authored) map.set(e.id, { ...e, _role: 'author' });
			for (const e of participant) {
				if (map.has(e.id)) map.get(e.id)!._role = 'author+participant';
				else map.set(e.id, { ...e, _role: 'participant' });
			}
			events = [...map.values()].sort((a, b) => b.created_at - a.created_at);
			connected = true;
			addLog(`Total unique events: ${events.length}`, 'success');

			// Resolve profiles for all unique pubkeys
			const allPubkeys = new Set<string>();
			for (const e of events) {
				allPubkeys.add(e.pubkey);
				for (const t of e.tags) {
					if (t[0] === 'p' && t[1]) allPubkeys.add(t[1]);
				}
			}
			await resolveProfiles([...allPubkeys]);

			// Diagnosis
			if (!events.some((e) => e.kind === 30006))
				addLog('⚠ NO Contract events (30006) — contracts tab will be empty', 'error');
			if (!events.some((e) => e.kind === 31006))
				addLog('⚠ NO Contract Status events (31006)', 'error');
			if (!events.some((e) => e.kind === 30008))
				addLog('⚠ NO Bid Status events (30008) — no bids accepted', 'error');
		} catch (e) {
			addLog(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`, 'error');
		} finally {
			connecting = false;
		}
	}

	function disconnect() {
		if (pool) {
			pool.close([relay]);
			pool = null;
		}
		connected = false;
		events = [];
		hexPubkey = '';
		profiles = new Map();
	}

	function toggleKind(kind: number) {
		if (selectedKinds.has(kind)) selectedKinds.delete(kind);
		else selectedKinds.add(kind);
		selectedKinds = new Set(selectedKinds);
	}
	function toggleExpand(id: string) {
		if (expandedEvents.has(id)) expandedEvents.delete(id);
		else expandedEvents.add(id);
		expandedEvents = new Set(expandedEvents);
	}

	function filteredEvents(): (NostrEvent & { _role?: string })[] {
		return events.filter((e) => {
			if (!selectedKinds.has(e.kind)) return false;
			const role = e._role || '';
			if (!showAuthor && role.includes('author')) return false;
			if (!showParticipant && role === 'participant') return false;
			return true;
		});
	}

	function kindCounts(): Record<number, number> {
		const counts: Record<number, number> = {};
		for (const e of events) counts[e.kind] = (counts[e.kind] || 0) + 1;
		return counts;
	}

	// ── Task Inspector ──
	async function inspectTask() {
		const dtag = taskInspectorDtag.trim();
		if (!dtag) {
			addLog('Enter a task d-tag or slug', 'error');
			return;
		}
		if (!pool) {
			// Create a fresh pool if not connected
			pool = new SimplePool();
		}
		taskInspectorLoading = true;
		taskInspectorEvents = [];
		taskInspectorAuthorProfile = null;
		taskInspectorParsedContent = null;

		try {
			// Query kind 31000 by d-tag
			const taskEvents = await pool.querySync([relay], { kinds: [31000], '#d': [dtag], limit: 5 });
			addLog(
				`Task events found by d-tag: ${taskEvents.length}`,
				taskEvents.length > 0 ? 'success' : 'error'
			);

			if (taskEvents.length > 0) {
				const taskEvent = taskEvents[0];
				try {
					taskInspectorParsedContent = JSON.parse(taskEvent.content);
				} catch {
					taskInspectorParsedContent = { _raw: taskEvent.content };
				}

				// Fetch author profile
				const authorHex = taskEvent.pubkey;
				const profileEvents = await pool.querySync([relay], {
					kinds: [0],
					authors: [authorHex],
					limit: 1
				});
				if (profileEvents.length > 0) {
					try {
						const c = JSON.parse(profileEvents[0].content);
						taskInspectorAuthorProfile = {
							name: c.display_name || c.displayName || c.name,
							picture: c.picture,
							created_at: profileEvents[0].created_at
						};
					} catch {
						taskInspectorAuthorProfile = {};
					}
				}

				// Fetch events with this task's #t tag (bids, contracts, statuses)
				const taskTagEvents = await pool.querySync([relay], {
					kinds: [30006, 31006, 30007, 30008, 5],
					'#t': [dtag],
					limit: 200
				});
				addLog(`Related events (by #t tag): ${taskTagEvents.length}`, 'info');

				// Fetch deletion events targeting the task event
				const deletionEvents = await pool.querySync([relay], {
					kinds: [5],
					'#e': [taskEvent.id],
					limit: 10
				});

				// Merge all
				const allEvents = [...taskEvents, ...taskTagEvents, ...deletionEvents];
				const dedup = new Map<string, NostrEvent & { _role?: string }>();
				for (const e of allEvents) {
					if (!dedup.has(e.id)) {
						dedup.set(e.id, { ...e, _role: e.pubkey === authorHex ? 'author' : 'participant' });
					}
				}
				taskInspectorEvents = [...dedup.values()].sort((a, b) => a.created_at - b.created_at);

				// Resolve all profiles
				const allPubkeys = new Set<string>();
				for (const e of taskInspectorEvents) {
					allPubkeys.add(e.pubkey);
					for (const t of e.tags) {
						if ((t[0] === 'p' || t[0] === 'e') && t[1]) allPubkeys.add(t[1]);
					}
				}
				await resolveProfiles([...allPubkeys]);
			}
		} catch (e) {
			addLog(`Task inspect error: ${e instanceof Error ? e.message : 'Unknown error'}`, 'error');
		} finally {
			taskInspectorLoading = false;
		}
	}

	// ── Profile Inspector ──
	async function inspectProfile() {
		const input = profileInspectorInput.trim();
		const hex = decodeNpub(input);
		if (!hex) {
			addLog('Invalid npub/hex for profile lookup', 'error');
			return;
		}
		if (!pool) {
			pool = new SimplePool();
		}

		profileInspectorLoading = true;
		profileInspectorEvents = [];
		profileInspectorData = null;

		try {
			const kinds = [0, 30063, 10002, 30000, 30002];
			const results = await pool.querySync([relay], { kinds, authors: [hex], limit: 20 });
			profileInspectorEvents = results.sort((a, b) => b.created_at - a.created_at);
			addLog(`Profile events found: ${results.length}`, 'success');

			// Parse kind 0
			const kind0 = results.find((e) => e.kind === 0);
			if (kind0) {
				try {
					const c = JSON.parse(kind0.content);
					profileInspectorData = {
						name: c.display_name || c.displayName || c.name,
						picture: c.picture,
						about: c.about,
						created_at: kind0.created_at
					};
				} catch {
					profileInspectorData = {};
				}
			}

			// Parse relay list
			const kind10002 = results.find((e) => e.kind === 10002);
			if (kind10002) {
				const relays = kind10002.tags
					.filter((t) => t[0] === 'r' && t[1])
					.map((t) => t[1] + (t[2] || ''));
				if (profileInspectorData) {
					profileInspectorData.relays = relays;
				} else {
					profileInspectorData = { relays };
				}
			}

			if (!profileInspectorData) {
				profileInspectorData = {};
				addLog('⚠ No kind 0 (profile metadata) found — user has no profile', 'error');
			}
		} catch (e) {
			addLog(`Profile inspect error: ${e instanceof Error ? e.message : 'Unknown error'}`, 'error');
		} finally {
			profileInspectorLoading = false;
		}
	}

	onDestroy(() => {
		if (pool) pool.close([relay]);
	});
</script>

<div class="debugger">
	<h1>Nostr Debug Console</h1>

	<!-- ── Section Tabs ── -->
	<div class="section-tabs">
		<button
			class="section-tab"
			class:active={section === 'explorer'}
			onclick={() => (section = 'explorer')}>Event Explorer</button
		>
		<button
			class="section-tab"
			class:active={section === 'task-inspector'}
			onclick={() => (section = 'task-inspector')}>Task Inspector</button
		>
		<button
			class="section-tab"
			class:active={section === 'profile-inspector'}
			onclick={() => (section = 'profile-inspector')}>Profile Inspector</button
		>
	</div>

	<!-- ════════════════════════════════════════════════════════ -->
	<!-- SECTION 1: Event Explorer -->
	<!-- ════════════════════════════════════════════════════════ -->
	{#if section === 'explorer'}
		<div class="controls">
			<div class="field">
				<label for="debug-nostr-npub">npub or hex pubkey</label>
				<input
					id="debug-nostr-npub"
					type="text"
					bind:value={npub}
					placeholder="npub1... or 64-char hex"
				/>
			</div>
			<div class="field">
				<label for="debug-nostr-relay">Relay</label>
				<div class="relay-input-group">
					<select
						id="debug-nostr-relay"
						value={relayMode === 'custom' ? 'custom' : relay}
						onchange={(e) => {
							const val = e.currentTarget.value;
							if (val === 'custom') {
								relayMode = 'custom';
							} else {
								relayMode = 'preset';
								relay = val;
							}
						}}
					>
						<option value="wss://relay1.bittasker.com">relay1 (Prod)</option>
						<option value="wss://relay1-dev.bittasker.com">relay1 (Dev)</option>
						<option value="wss://relay2-dev.bittasker.com">relay2 (Dev Tasks)</option>
						<option value="wss://relay.damus.io">damus.io (Public)</option>
						<option value="wss://nos.lol">nos.lol (Public)</option>
						<option value="custom">Custom relay...</option>
					</select>
					{#if relayMode === 'custom'}
						<input
							type="text"
							class="custom-relay-input"
							bind:value={customRelay}
							oninput={() => {
								relay = customRelay;
							}}
							placeholder="wss://your-relay.com"
						/>
					{/if}
				</div>
			</div>
			<button class="btn-primary" onclick={connect} disabled={connecting}>
				<IconMagnify />
				{connecting ? 'Connecting...' : 'Connect'}
			</button>
			<button class="btn-secondary" onclick={disconnect} disabled={!connected}
				><IconClose /> Disconnect</button
			>
		</div>

		<div class="status-bar">
			<span
				class="status-dot"
				class:connected
				class:connecting
				class:disconnected={!connected && !connecting}
			></span>
			<span
				>{connecting
					? 'Connecting...'
					: connected
						? `Connected — ${events.length} events — ${profiles.size} profiles resolved`
						: 'Disconnected'}</span
			>
			{#if hexPubkey}<span class="hex">hex: {hexPubkey}</span>{/if}
		</div>

		<div class="filters">
			<span class="filter-label">Kinds:</span>
			{#each [30006, 31006, 30007, 30008, 31000, 5, 0] as k}
				<label class="chip" class:active={selectedKinds.has(k)}>
					<input type="checkbox" checked={selectedKinds.has(k)} onchange={() => toggleKind(k)} />
					<span style="color:{kindColor(k)}">{kindName(k)}</span>
					<span class="chip-kind">{k}</span>
				</label>
			{/each}
			<span class="sep">|</span>
			<label class="chip" class:active={showAuthor}
				><input type="checkbox" bind:checked={showAuthor} /> Author</label
			>
			<label class="chip" class:active={showParticipant}
				><input type="checkbox" bind:checked={showParticipant} /> Participant</label
			>
		</div>

		{#if events.length > 0}
			<div class="stats">
				{#each Object.entries(kindCounts()) as [kind, count]}
					<div class="stat">
						<span class="stat-val" style="color:{kindColor(Number(kind))}">{count}</span><span
							class="stat-label">{kindName(Number(kind))}</span
						>
					</div>
				{/each}
			</div>
		{/if}

		<div class="view-toggle">
			<button class="btn-tab" class:active={view === 'timeline'} onclick={() => (view = 'timeline')}
				>Timeline</button
			>
			<button class="btn-tab" class:active={view === 'chain'} onclick={() => (view = 'chain')}
				>Event Chains</button
			>
			<button class="btn-tab" class:active={view === 'raw'} onclick={() => (view = 'raw')}
				>Raw Tags</button
			>
		</div>

		<div class="output">
			{#if !connected && events.length === 0}
				<div class="empty">Connect to a relay to fetch events</div>
			{:else if filteredEvents().length === 0}
				<div class="empty">No events matching filters</div>
			{:else if view === 'timeline'}
				{#each filteredEvents() as e (e.id)}
					{@const st = tagVal(e.tags, 's')}
					{@const escId = tagVal(e.tags, 'd')}
					{@const taskId = tagVal(e.tags, 't')}
					{@const refE = tagVal(e.tags, 'e')}
					{@const name = profileName(e.pubkey)}
					<button
						type="button"
						class="event-row"
						class:expanded={expandedEvents.has(e.id)}
						onclick={() => toggleExpand(e.id)}
					>
						<div class="event-header">
							<span
								class="kind-badge"
								style="background:{kindColor(e.kind)}22;color:{kindColor(e.kind)}"
								>{kindName(e.kind)}</span
							>
							{#if e._role === 'author'}<span class="role author">AUTHOR</span>
							{:else if e._role === 'participant'}<span class="role participant">PART</span>
							{/if}
							{#if st}<span class="status-badge">{statusLabel(st)}</span>{/if}
							{#if escId}<span class="tag-ref">d: {short(escId, 6)}</span>{/if}
							{#if taskId}<span class="tag-ref">t: {short(taskId, 6)}</span>{/if}
							{#if refE}<span class="tag-ref ref">→ {short(refE, 6)}</span>{/if}
							<span class="pubkey" class:has-name={!!name}>{name || short(e.pubkey)}</span>
							<span class="time">{fmtTime(e.created_at)}</span>
						</div>
						{#if expandedEvents.has(e.id)}
							<div class="event-detail">
								<div class="event-id">ID: {e.id}</div>
								<div class="event-id">
									NIP-33: {e.kind}:{e.pubkey}:{tagVal(e.tags, 'd') ||
										tagVal(e.tags, 't') ||
										'(none)'}
								</div>
								<div class="tags">
									{#each e.tags as tag}
										<span class="tag"><b>#{tag[0]}</b>={tag.slice(1).join(', ')}</span>
									{/each}
								</div>
								<pre class="raw">{e.content?.length > 2000
										? e.content.slice(0, 2000) + '...'
										: e.content || '(empty)'}</pre>
								<div class="meta">ID: {e.id} | Pubkey: {e.pubkey} | Sig: {short(e.sig, 8)}</div>
							</div>
						{/if}
					</button>
				{/each}
			{:else if view === 'chain'}
				{@const chainData = (() => {
					const byTask = new Map<string, (NostrEvent & { _role?: string })[]>();
					const orphans: (NostrEvent & { _role?: string })[] = [];
					for (const e of filteredEvents()) {
						const tId = tagVal(e.tags, 't');
						if (tId) {
							if (!byTask.has(tId)) byTask.set(tId, []);
							byTask.get(tId)!.push(e);
						} else {
							orphans.push(e);
						}
					}
					return {
						tasks: [...byTask.entries()].map(([id, evts]) => ({
							id,
							evts: evts.sort((a, b) => a.created_at - b.created_at)
						})),
						orphans: orphans.sort((a, b) => a.created_at - b.created_at)
					};
				})()}
				<div class="chain-view">
					{#each chainData.tasks as { id: taskId, evts: sorted }}
						<div class="chain-task">
							<h3>Task: {short(taskId, 12)} ({sorted.length} events)</h3>
							{#each sorted as e}
								{@const st = tagVal(e.tags, 's')}
								{@const rE = tagVal(e.tags, 'e')}
								{@const escI = tagVal(e.tags, 'd') || tagVal(e.tags, 'r')}
								<div class="chain-event" class:indent={e.kind === 31006 || e.kind === 30008}>
									<span class="kind-dot" style="background:{kindColor(e.kind)}"></span>
									<span style="color:{kindColor(e.kind)};font-weight:600;">{kindName(e.kind)}</span>
									{#if st}<span class="status-badge">{statusLabel(st)}</span>{/if}
									<span class="chain-time">{fmtTime(e.created_at)}</span>
									<span class="chain-extra">
										{profileName(e.pubkey) || short(e.pubkey, 6)}
										{#if rE}
											ref:{short(rE, 4)}{/if}
										{#if escI}
											{short(escI, 4)}{/if}
									</span>
								</div>
							{/each}
						</div>
					{/each}
					{#if chainData.orphans.length > 0}
						<div class="chain-task">
							<h3>Events without #t tag ({chainData.orphans.length})</h3>
							{#each chainData.orphans as e}
								<div class="chain-event">
									<span class="kind-dot" style="background:{kindColor(e.kind)}"></span><span
										style="color:{kindColor(e.kind)};font-weight:600;">{kindName(e.kind)}</span
									><span class="chain-time">{fmtTime(e.created_at)}</span><span class="chain-extra"
										>{profileName(e.pubkey) || short(e.pubkey)}</span
									>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{:else}
				{#each filteredEvents() as e (e.id)}
					<button
						type="button"
						class="event-row"
						class:expanded={expandedEvents.has(e.id)}
						onclick={() => toggleExpand(e.id)}
					>
						<div class="event-header">
							<span
								class="kind-badge"
								style="background:{kindColor(e.kind)}22;color:{kindColor(e.kind)}"
								>{kindName(e.kind)}</span
							>
							<span class="time">{fmtTime(e.created_at)}</span>
							<span class="pubkey" class:has-name={!!profileName(e.pubkey)}
								>{profileName(e.pubkey) || short(e.pubkey)}</span
							>
						</div>
						{#if expandedEvents.has(e.id)}
							<div class="event-detail">
								<table class="tag-table">
									<tbody>
										{#each e.tags as tag}
											<tr><td class="tag-key">#{tag[0]}</td><td>{tag.slice(1).join(', ')}</td></tr>
										{/each}
									</tbody>
								</table>
								<pre class="raw">{e.content || '(empty)'}</pre>
								<div class="meta">ID: {e.id} | Pubkey: {e.pubkey} | Sig: {short(e.sig, 8)}</div>
							</div>
						{/if}
					</button>
				{/each}
			{/if}
		</div>
	{/if}

	<!-- ════════════════════════════════════════════════════════ -->
	<!-- SECTION 2: Task Inspector -->
	<!-- ════════════════════════════════════════════════════════ -->
	{#if section === 'task-inspector'}
		<div class="controls">
			<div class="field" style="flex:1">
				<label for="debug-nostr-task-dtag">Task d-tag or slug</label>
				<input
					id="debug-nostr-task-dtag"
					type="text"
					bind:value={taskInspectorDtag}
					placeholder="e.g. necesito-chicles-1778087761-d38f65"
					style="width:100%"
				/>
			</div>
			<button class="btn-primary" onclick={inspectTask} disabled={taskInspectorLoading}>
				<IconMagnify />
				{taskInspectorLoading ? 'Loading...' : 'Inspect'}
			</button>
		</div>

		{#if taskInspectorParsedContent}
			<div class="panel">
				<h3>Task Details</h3>
				<div class="grid-2col">
					<div class="kv">
						<span class="kv-key">Title</span><span class="kv-val"
							>{taskInspectorParsedContent.title || '(none)'}</span
						>
					</div>
					<div class="kv">
						<span class="kv-key">Status</span><span class="kv-val"
							>{statusLabel(taskInspectorParsedContent.status as string | null)}</span
						>
					</div>
					<div class="kv">
						<span class="kv-key">Task Type</span><span class="kv-val"
							>{taskInspectorParsedContent.taskType || '(none)'}</span
						>
					</div>
					<div class="kv">
						<span class="kv-key">Budget</span><span class="kv-val"
							>{(taskInspectorParsedContent.budget as Record<string, unknown>)?.amount}
							{(taskInspectorParsedContent.budget as Record<string, unknown>)?.currency}</span
						>
					</div>
					{#if taskInspectorParsedContent.creator}
						<div class="kv">
							<span class="kv-key">Creator username</span><span class="kv-val"
								>{(taskInspectorParsedContent.creator as Record<string, unknown>).username ||
									'(none)'}</span
							>
						</div>
						<div class="kv">
							<span class="kv-key">Creator avatar</span><span class="kv-val"
								>{(taskInspectorParsedContent.creator as Record<string, unknown>).avatar ||
									'(none)'}</span
							>
						</div>
					{/if}
					<div class="kv">
						<span class="kv-key">Description</span><span class="kv-val"
							>{(taskInspectorParsedContent.description as string)?.slice(0, 200) || '(none)'}</span
						>
					</div>
				</div>
			</div>
		{/if}

		{#if taskInspectorAuthorProfile}
			{@const tp = taskInspectorAuthorProfile}
			<div class="panel">
				<h3>Author Profile</h3>
				<div class="grid-2col">
					<div class="kv">
						<span class="kv-key">Name</span><span class="kv-val">{tp.name || '(not set)'}</span>
					</div>
					<div class="kv">
						<span class="kv-key">Picture</span><span class="kv-val"
							>{tp.picture || '(not set)'}</span
						>
					</div>
					<div class="kv">
						<span class="kv-key">Profile created</span><span class="kv-val"
							>{tp.created_at ? fmtTime(tp.created_at) : '(unknown)'}</span
						>
					</div>
				</div>
				{#if !tp.name}
					<div class="warn">
						⚠ This user has no profile name set — will show as truncated npub on listing pages
					</div>
				{/if}
			</div>
		{/if}

		{#if taskInspectorEvents.length > 0}
			{@const byKindCount = (() => {
				const c: Record<number, number> = {};
				for (const e of taskInspectorEvents) c[e.kind] = (c[e.kind] || 0) + 1;
				return c;
			})()}
			<div class="stats">
				{#each Object.entries(byKindCount) as [kind, count]}
					<div class="stat">
						<span class="stat-val" style="color:{kindColor(Number(kind))}">{count}</span><span
							class="stat-label">{kindName(Number(kind))}</span
						>
					</div>
				{/each}
			</div>
			<div class="output" style="max-height:50vh;">
				{#each taskInspectorEvents as e (e.id)}
					{@const st = tagVal(e.tags, 's')}
					{@const name = profileName(e.pubkey)}
					<button
						type="button"
						class="event-row"
						class:expanded={expandedEvents.has(e.id)}
						onclick={() => toggleExpand(e.id)}
					>
						<div class="event-header">
							<span
								class="kind-badge"
								style="background:{kindColor(e.kind)}22;color:{kindColor(e.kind)}"
								>{kindName(e.kind)}</span
							>
							{#if st}<span class="status-badge">{statusLabel(st)}</span>{/if}
							<span class="pubkey" class:has-name={!!name}>{name || short(e.pubkey)}</span>
							<span class="time">{fmtTime(e.created_at)}</span>
						</div>
						{#if expandedEvents.has(e.id)}
							<div class="event-detail">
								<div class="event-id">ID: {e.id}</div>
								<div class="tags">
									{#each e.tags as tag}<span class="tag"
											><b>#{tag[0]}</b>={tag.slice(1).join(', ')}</span
										>{/each}
								</div>
								<pre class="raw">{e.content?.length > 2000
										? e.content.slice(0, 2000) + '...'
										: e.content || '(empty)'}</pre>
							</div>
						{/if}
					</button>
				{/each}
			</div>
		{:else if !taskInspectorLoading && taskInspectorDtag}
			<div class="empty">
				No events found for this task d-tag. Check the relay ({relay}) and try again.
			</div>
		{/if}
	{/if}

	<!-- ════════════════════════════════════════════════════════ -->
	<!-- SECTION 3: Profile Inspector -->
	<!-- ════════════════════════════════════════════════════════ -->
	{#if section === 'profile-inspector'}
		<div class="controls">
			<div class="field" style="flex:1">
				<label for="debug-nostr-profile-input">npub, nprofile, or hex pubkey</label>
				<input
					id="debug-nostr-profile-input"
					type="text"
					bind:value={profileInspectorInput}
					placeholder="npub1... or hex"
					style="width:100%"
				/>
			</div>
			<button class="btn-primary" onclick={inspectProfile} disabled={profileInspectorLoading}>
				<IconMagnify />
				{profileInspectorLoading ? 'Loading...' : 'Inspect'}
			</button>
		</div>

		{#if profileInspectorData}
			{@const pd = profileInspectorData}
			<div class="panel">
				<h3>Profile Data</h3>
				<div class="grid-2col">
					<div class="kv">
						<span class="kv-key">Display Name</span><span class="kv-val"
							>{pd.name || '⚠ NOT SET'}</span
						>
					</div>
					<div class="kv">
						<span class="kv-key">Picture</span><span class="kv-val">{pd.picture || '(none)'}</span>
					</div>
					<div class="kv">
						<span class="kv-key">About</span><span class="kv-val"
							>{pd.about?.slice(0, 200) || '(none)'}</span
						>
					</div>
					<div class="kv">
						<span class="kv-key">Profile created</span><span class="kv-val"
							>{pd.created_at ? fmtTime(pd.created_at) : '(unknown)'}</span
						>
					</div>
				</div>
				{#if !pd.name}
					<div class="warn">
						⚠ No profile name — user will appear as truncated npub in listing pages
					</div>
				{/if}
				{#if pd.relays && pd.relays.length > 0}
					<h4 style="margin-top:12px;">Relay List (NIP-65)</h4>
					<div class="tags">
						{#each pd.relays as r}<span class="tag"><b>r</b>={r}</span>{/each}
					</div>
				{/if}
			</div>
		{:else if !profileInspectorLoading && profileInspectorInput}
			<div class="empty">No profile data found for this pubkey. The user has no kind 0 event.</div>
		{/if}

		{#if profileInspectorEvents.length > 0}
			<div class="output" style="max-height:40vh;">
				{#each profileInspectorEvents as e (e.id)}
					<button
						type="button"
						class="event-row"
						class:expanded={expandedEvents.has(e.id)}
						onclick={() => toggleExpand(e.id)}
					>
						<div class="event-header">
							<span
								class="kind-badge"
								style="background:{kindColor(e.kind)}22;color:{kindColor(e.kind)}"
								>{kindName(e.kind)}</span
							>
							<span class="time">{fmtTime(e.created_at)}</span>
							<span class="pubkey">id: {short(e.id, 6)}</span>
						</div>
						{#if expandedEvents.has(e.id)}
							<div class="event-detail">
								<div class="tags">
									{#each e.tags as tag}<span class="tag"
											><b>#{tag[0]}</b>={tag.slice(1).join(', ')}</span
										>{/each}
								</div>
								<pre class="raw">{e.content?.length > 2000
										? e.content.slice(0, 2000) + '...'
										: e.content || '(empty)'}</pre>
							</div>
						{/if}
					</button>
				{/each}
			</div>
		{/if}
	{/if}

	<!-- ════════════════════════════════════════════════════════ -->
	<!-- Log -->
	<!-- ════════════════════════════════════════════════════════ -->
	{#if logLines.length > 0}
		<div class="log">
			{#each logLines as l}
				<div class="log-line {l.type}"><span class="log-time">{l.time}</span> {l.text}</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.debugger {
		max-width: 1100px;
		margin: 0 auto;
		padding: 20px;
		font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', monospace;
		font-size: 13px;
		color: #e1e4ed;
	}
	h1 {
		font-size: 18px;
		color: #6366f1;
		margin-bottom: 16px;
	}
	h3 {
		font-size: 13px;
		margin-bottom: 8px;
		color: #e1e4ed;
	}
	h4 {
		font-size: 12px;
		margin: 4px 0;
		color: #8b90a0;
	}

	.section-tabs {
		display: flex;
		gap: 4px;
		margin-bottom: 16px;
	}
	.section-tab {
		background: #1a1d27;
		color: #8b90a0;
		border: 1px solid #2e3347;
		padding: 8px 20px;
		font-size: 13px;
		cursor: pointer;
		font-family: inherit;
	}
	.section-tab:first-child {
		border-radius: 6px 0 0 6px;
	}
	.section-tab:last-child {
		border-radius: 0 6px 6px 0;
	}
	.section-tab.active {
		background: #6366f1;
		color: #fff;
		border-color: #6366f1;
	}

	.controls {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		align-items: flex-end;
		background: #1a1d27;
		border: 1px solid #2e3347;
		border-radius: 8px;
		padding: 16px;
		margin-bottom: 12px;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.field label {
		font-size: 11px;
		color: #8b90a0;
		text-transform: uppercase;
	}
	input,
	select {
		background: #242836;
		border: 1px solid #2e3347;
		color: #e1e4ed;
		padding: 8px 12px;
		border-radius: 6px;
		font-family: inherit;
		font-size: 13px;
	}
	input:focus,
	select:focus {
		border-color: #6366f1;
		outline: none;
	}
	select {
		min-width: 200px;
	}

	.relay-input-group {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.custom-relay-input {
		flex: 1;
		min-width: 200px;
	}

	button {
		border: none;
		padding: 9px 16px;
		border-radius: 6px;
		font-family: inherit;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 6px;
	}
	button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.btn-primary {
		background: #6366f1;
		color: #fff;
	}
	.btn-secondary {
		background: #242836;
		border: 1px solid #2e3347;
		color: #e1e4ed;
	}

	.status-bar {
		display: flex;
		gap: 8px;
		align-items: center;
		margin-bottom: 12px;
		font-size: 12px;
		color: #8b90a0;
	}
	.status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		display: inline-block;
	}
	.status-dot.connected {
		background: #22c55e;
	}
	.status-dot.connecting {
		background: #f59e0b;
	}
	.status-dot.disconnected {
		background: #ef4444;
	}
	.hex {
		color: #6366f1;
		font-size: 11px;
	}

	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		align-items: center;
		margin-bottom: 12px;
	}
	.filter-label {
		font-size: 11px;
		color: #8b90a0;
		margin-right: 4px;
		text-transform: uppercase;
	}
	.chip {
		display: flex;
		align-items: center;
		gap: 4px;
		background: #1a1d27;
		border: 1px solid #2e3347;
		border-radius: 4px;
		padding: 3px 8px;
		font-size: 11px;
		cursor: pointer;
	}
	.chip.active {
		border-color: #6366f1;
	}
	.chip input {
		display: none;
	}
	.chip-kind {
		color: #8b90a0;
		font-size: 10px;
	}
	.sep {
		color: #2e3347;
		margin: 0 4px;
	}

	.stats {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 14px;
	}
	.stat {
		background: #1a1d27;
		border: 1px solid #2e3347;
		border-radius: 6px;
		padding: 8px 14px;
		text-align: center;
		min-width: 70px;
	}
	.stat-val {
		font-size: 24px;
		font-weight: 700;
		display: block;
	}
	.stat-label {
		font-size: 10px;
		color: #8b90a0;
		text-transform: uppercase;
	}

	.view-toggle {
		display: flex;
		gap: 2px;
		margin-bottom: 14px;
	}
	.btn-tab {
		background: #1a1d27;
		color: #8b90a0;
		border: 1px solid #2e3347;
		padding: 6px 16px;
		font-size: 12px;
		cursor: pointer;
	}
	.btn-tab:first-child {
		border-radius: 6px 0 0 6px;
	}
	.btn-tab:last-child {
		border-radius: 0 6px 6px 0;
	}
	.btn-tab.active {
		background: #6366f1;
		color: #fff;
		border-color: #6366f1;
	}

	.output {
		background: #1a1d27;
		border: 1px solid #2e3347;
		border-radius: 8px;
		min-height: 200px;
		max-height: 60vh;
		overflow-y: auto;
	}
	.empty {
		padding: 40px;
		text-align: center;
		color: #8b90a0;
	}

	.event-row {
		display: block;
		width: 100%;
		border: none;
		border-bottom: 1px solid #2e3347;
		padding: 10px 14px;
		cursor: pointer;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
	}
	.event-row:hover {
		background: #242836;
	}
	.event-row.expanded {
		background: #242836;
	}
	.event-header {
		display: flex;
		gap: 8px;
		align-items: center;
		flex-wrap: wrap;
	}
	.kind-badge {
		display: inline-block;
		padding: 2px 8px;
		border-radius: 4px;
		font-weight: 700;
		font-size: 11px;
	}
	.role {
		font-size: 10px;
		font-weight: 700;
		padding: 1px 5px;
		border-radius: 3px;
	}
	.role.author {
		background: #22c55e22;
		color: #22c55e;
	}
	.role.participant {
		background: #f59e0b22;
		color: #f59e0b;
	}
	.status-badge {
		padding: 1px 6px;
		border-radius: 3px;
		font-size: 10px;
		font-weight: 600;
		background: #6366f122;
		color: #6366f1;
	}
	.tag-ref {
		font-size: 10px;
		color: #8b90a0;
	}
	.tag-ref.ref {
		color: #06b6d4;
	}
	.pubkey {
		color: #8b90a0;
		font-size: 11px;
	}
	.pubkey.has-name {
		color: #22c55e;
		font-weight: 600;
	}
	.time {
		color: #8b90a0;
		font-size: 11px;
		margin-left: auto;
	}

	.event-detail {
		margin-top: 10px;
	}
	.event-id {
		color: #8b90a0;
		font-size: 10px;
		word-break: break-all;
		margin-bottom: 4px;
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-bottom: 6px;
	}
	.tag {
		background: #0f1117;
		border: 1px solid #2e3347;
		border-radius: 3px;
		padding: 2px 6px;
		font-size: 11px;
	}
	.tag b {
		color: #6366f1;
	}
	.raw {
		background: #0f1117;
		border: 1px solid #2e3347;
		border-radius: 4px;
		padding: 8px;
		font-size: 11px;
		max-height: 150px;
		overflow-y: auto;
		white-space: pre-wrap;
		word-break: break-all;
		color: #8b90a0;
		margin: 0;
	}
	.meta {
		font-size: 10px;
		color: #8b90a0;
		margin-top: 4px;
	}

	/* Panels */
	.panel {
		background: #1a1d27;
		border: 1px solid #2e3347;
		border-radius: 8px;
		padding: 14px;
		margin-bottom: 12px;
	}
	.grid-2col {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	.kv {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.kv-key {
		font-size: 10px;
		color: #8b90a0;
		text-transform: uppercase;
	}
	.kv-val {
		font-size: 12px;
		color: #e1e4ed;
		word-break: break-all;
	}
	.warn {
		background: #f59e0b11;
		border: 1px solid #f59e0b33;
		border-radius: 4px;
		padding: 8px 12px;
		margin-top: 10px;
		font-size: 12px;
		color: #f59e0b;
	}

	/* Chain view */
	.chain-view {
		padding: 16px;
	}
	.chain-task {
		margin-bottom: 16px;
		border-left: 3px solid #2e3347;
		padding-left: 14px;
	}
	.chain-task h3 {
		font-size: 12px;
		color: #8b90a0;
		margin-bottom: 6px;
	}
	.chain-event {
		display: flex;
		gap: 8px;
		align-items: center;
		padding: 4px 8px;
		border-radius: 4px;
		font-size: 12px;
	}
	.chain-event.indent {
		margin-left: 24px;
	}
	.kind-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.chain-time {
		color: #8b90a0;
		font-size: 11px;
	}
	.chain-extra {
		color: #8b90a0;
		font-size: 10px;
	}

	/* Raw view */
	.tag-table {
		width: 100%;
		font-size: 11px;
		border-collapse: collapse;
	}
	.tag-table td {
		padding: 2px 8px;
	}
	.tag-key {
		color: #6366f1;
		font-weight: 600;
		white-space: nowrap;
		width: 1%;
	}

	/* Log */
	.log {
		background: #1a1d27;
		border: 1px solid #2e3347;
		border-radius: 8px;
		max-height: 180px;
		overflow-y: auto;
		margin-top: 14px;
	}
	.log-line {
		padding: 3px 14px;
		font-size: 11px;
		border-bottom: 1px solid #2e3347;
	}
	.log-line.error {
		color: #ef4444;
	}
	.log-line.success {
		color: #22c55e;
	}
	.log-line.info {
		color: #06b6d4;
	}
	.log-time {
		color: #8b90a0;
		margin-right: 8px;
	}
</style>
