<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { t } from 'svelte-i18n';
	import type { NDKEvent } from '@nostr-dev-kit/ndk';
	import { leadingContractStatus } from '$lib/runes/contract.svelte';
	import { completeTask } from '$lib/nostr/task';
	import {
		CONTRACT_LIST_TABS,
		contractBadgeClass,
		contractStatusKey,
		contractStatusTab,
		contractTaskId,
		type ContractListTab
	} from '$lib/utils/contract/contract-tabs';
	import { getTaskRelay, ndk } from '$lib/nostr/ndk';
	import KINDS from '$lib/utils/constants/kinds';
	import { getNpub } from '$lib/utils/nostrKeys';
	import { normalizeNostrPubkey, nostrPubkeysMatch } from '$lib/utils/nostr-pubkey';

	type ContractListRow = {
		contractId: string;
		status: string;
		title: string;
		updatedAt: number;
	};

	let rows = $state<ContractListRow[]>([]);
	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let activeTab = $state<ContractListTab>('all');

	const visibleRows = $derived(
		activeTab === 'all' ? rows : rows.filter((row) => contractStatusTab(row.status) === activeTab)
	);

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
		if (!nostrPubkeysMatch(parties[1], pubkey)) return null;
		const body = readJson(event.content);
		const contractId = event.tagValue('r') || readString(body, 'contractId');
		if (!contractId) return null;
		const title = readString(body, 'contractTitle') || contractId;
		return {
			contractId,
			status: event.tagValue('s') || readString(body, 'status') || 'draft',
			title,
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
			for (const row of rows) {
				if (contractStatusTab(row.status) !== 'paid') continue;
				const taskId = contractTaskId(row.contractId);
				if (!taskId) continue;
				completeTask(taskId).catch((error: unknown) => {
					console.warn('[contract-list] task close failed', error);
				});
			}
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
		<div
			class="flex w-full min-w-0 flex-wrap gap-2"
			role="tablist"
			aria-label={$t('dashboard.contracts.filter_by_status')}
		>
			{#each CONTRACT_LIST_TABS as tab (tab.id)}
				<button
					type="button"
					role="tab"
					class="btn btn-sm min-h-11 min-w-0 flex-1 whitespace-normal sm:flex-none"
					class:btn-primary={activeTab === tab.id}
					class:btn-ghost={activeTab !== tab.id}
					aria-selected={activeTab === tab.id}
					onclick={() => (activeTab = tab.id)}
				>
					{$t(tab.label)}
				</button>
			{/each}
		</div>
		{#if visibleRows.length === 0}
			<div class="card bg-base-100 border-base-300 border shadow-sm">
				<div class="card-body p-5">
					<p class="text-base font-semibold">{$t('dashboard.contracts.no_filtered_contracts')}</p>
					<p class="text-base-content/70 text-sm">
						{$t('dashboard.contracts.try_different_filters')}
					</p>
				</div>
			</div>
		{:else}
			<div class="flex flex-col gap-4">
				{#each visibleRows as row (row.contractId)}
					<a
						class="card bg-base-100 border-base-300 border text-left shadow-sm"
						href="/hiring/contracts/{encodeURIComponent(row.contractId)}"
					>
						<div class="card-body gap-3 p-5">
							<div class="flex min-w-0 flex-wrap items-start justify-between gap-2">
								<div class="min-w-0">
									<p class="text-base-content/60 text-xs font-medium tracking-wide uppercase">
										{$t('dashboard.contracts.title')}
									</p>
									<p class="truncate text-base font-semibold">{row.title}</p>
								</div>
								<span class="badge badge-lg {contractBadgeClass(row.status)}"
									>{$t(contractStatusKey(row.status))}</span
								>
							</div>
						</div>
					</a>
				{/each}
			</div>
		{/if}
	{/if}
</div>
