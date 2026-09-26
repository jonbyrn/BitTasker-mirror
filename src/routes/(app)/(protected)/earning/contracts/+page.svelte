<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { t } from 'svelte-i18n';
	import type { NDKEvent } from '@nostr-dev-kit/ndk';
	import { leadingContractStatus } from '$lib/runes/contract.svelte';
	import { getTaskRelay, ndk } from '$lib/nostr/ndk';
	import KINDS from '$lib/utils/constants/kinds';
	import { getNpub } from '$lib/utils/nostrKeys';
	import { normalizeNostrPubkey, nostrPubkeysMatch } from '$lib/utils/nostr-pubkey';
	import { parseEarningQuery } from '$lib/utils/dashboardQuery';

	type ContractListRow = {
		contractId: string;
		status: string;
		title: string;
		updatedAt: number;
	};

	let rows = $state<ContractListRow[]>([]);
	let loading = $state(true);
	let loadError = $state<string | null>(null);

	const highlight = $derived(parseEarningQuery(page.url).highlight ?? null);
	const highlightMissing = $derived(
		!loading && highlight !== null && !rows.some((row) => row.contractId === highlight)
	);

	function statusBadgeClass(status: string): string {
		if (status === 'funded') return 'badge-warning';
		if (status === 'work_submitted' || status === 'work_in_progress' || status === 'approved') {
			return 'badge-info';
		}
		if (status === 'released') return 'badge-success';
		return 'badge-outline';
	}

	function readJson(content: string): Record<string, unknown> | null {
		try {
			const parsed: unknown = JSON.parse(content);
			if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
			return parsed as Record<string, unknown>;
		} catch {
			return null;
		}
	}

	function readString(record: Record<string, unknown> | null, key: string): string {
		const value = record?.[key];
		return typeof value === 'string' ? value : '';
	}

	function readContractRow(event: NDKEvent, pubkey: string): ContractListRow | null {
		const parties = event.tags.filter((tag) => tag[0] === 'p').map((tag) => tag[1] ?? '');
		if (!nostrPubkeysMatch(parties[0], pubkey)) return null;
		const body = readJson(event.content);
		const contractId = event.tagValue('r') || readString(body, 'contractId');
		if (!contractId) return null;
		return {
			contractId,
			status: event.tagValue('s') || readString(body, 'status') || 'draft',
			title: readString(body, 'contractTitle') || contractId,
			updatedAt: event.created_at ?? 0
		};
	}

	async function loadContractRows(): Promise<void> {
		loading = true;
		loadError = null;
		try {
			const pubkey = normalizeNostrPubkey(await getNpub());
			if (!pubkey) {
				rows = [];
				return;
			}
			const events = await ndk.fetchEvents(
				{ kinds: [KINDS.CONTRACT_STATUS], '#p': [pubkey], limit: 100 },
				{ closeOnEose: true },
				getTaskRelay()
			);
			const byId: Record<string, ContractListRow> = {};
			for (const event of events) {
				const row = readContractRow(event, pubkey);
				if (!row) continue;
				const current = byId[row.contractId];
				if (!current) {
					byId[row.contractId] = row;
					continue;
				}
				const status = leadingContractStatus([current.status, row.status]);
				const source = status === row.status ? row : current;
				byId[row.contractId] = {
					...source,
					status,
					updatedAt: Math.max(current.updatedAt, row.updatedAt)
				};
			}
			rows = Object.values(byId).sort((left, right) => right.updatedAt - left.updatedAt);
		} catch (error) {
			loadError = error instanceof Error ? error.message : $t('dashboard.contracts.error_title');
			console.error('[contract-list] Failed to load contracts', error);
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		if (!browser) return;
		loadContractRows().catch((error: unknown) => {
			console.error('[contract-list] Failed to load contracts', error);
		});
	});
</script>

<div class="mx-auto flex w-full max-w-5xl flex-col gap-4 p-3 sm:p-6">
	<div>
		<p class="text-base-content/60 text-xs font-medium tracking-wide uppercase">
			{$t('dashboard.contracts.title')}
		</p>
		<h2 class="text-2xl font-semibold sm:text-3xl">{$t('dashboard.contracts.title')}</h2>
	</div>

	{#if highlightMissing}
		<div class="alert alert-outline alert-info" role="status">
			<span>{$t('dashboard.earning.messages.contracts_highlight_not_found')}</span>
		</div>
	{/if}

	{#if loading}
		<div class="flex items-center justify-center py-6">
			<span class="loading loading-spinner loading-md"></span>
			<span class="text-base-content/60 ml-2">{$t('dashboard.contracts.loading')}</span>
		</div>
	{:else if loadError}
		<div class="alert alert-outline alert-error" role="alert">
			<span>{loadError}</span>
			<button
				class="btn btn-sm"
				type="button"
				onclick={() => {
					loadContractRows().catch((error: unknown) => {
						console.error('[contract-list] Failed to load contracts', error);
					});
				}}
			>
				{$t('dashboard.contracts.retry')}
			</button>
		</div>
	{:else if rows.length === 0}
		<div class="card bg-base-100 border-base-300 border shadow-sm">
			<div class="card-body p-5">
				<p class="text-base font-semibold">{$t('dashboard.contracts.no_contracts')}</p>
				<p class="text-base-content/70 text-sm">{$t('dashboard.contracts.description')}</p>
			</div>
		</div>
	{:else}
		<div class="flex flex-col gap-4">
			{#each rows as row (row.contractId)}
				<a
					class="card bg-base-100 border shadow-sm {row.contractId === highlight
						? 'border-primary'
						: 'border-base-300'}"
					href="/earning/contracts/{encodeURIComponent(row.contractId)}"
				>
					<div class="card-body gap-3 p-5">
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0">
								<p class="text-base-content/60 text-xs font-medium tracking-wide uppercase">
									{$t('dashboard.contracts.title')}
								</p>
								<p class="truncate text-base font-semibold">{row.title}</p>
							</div>
							<span class="badge badge-lg {statusBadgeClass(row.status)}">{row.status}</span>
						</div>
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>
