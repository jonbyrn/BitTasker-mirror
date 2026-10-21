<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { locale } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { isTempStaffEnabled } from '$lib/services/feature-flags';
	import { refreshStaffBoard, staffBoard } from '$lib/staffing/board.svelte';
	import { staffCopy, statusLabel } from '$lib/staffing/copy';
	import { shiftSpan } from '$lib/staffing/hours';
	import { pubkeyHex, samePerson } from '$lib/staffing/ids';
	import { jobEscrowUsd, jobExpectedHours, countedSeats, shiftMatches } from '$lib/staffing/rules';
	import { ROLE_LABELS, roleLabel } from '$lib/staffing/roles';
	import { STAFF_ROLES } from '$lib/staffing/types';
	import { getNpub } from '$lib/utils/nostrKeys';

	const enabled = isTempStaffEnabled();
	const language = $derived(String($locale || 'en').startsWith('es') ? 'es' : 'en');
	const copy = $derived(staffCopy(language));
	const tab = $derived(page.url.searchParams.get('tab') === 'mine' ? 'mine' : 'open');
	let role = $state('');
	let date = $state('');
	let maxRate = $state('');
	let location = $state('');
	let me = $state('');
	let meReady = $state(false);

	const shifts = $derived(
		staffBoard.jobs.filter((job) => {
			if (
				!shiftMatches(job, {
					role,
					date,
					maxRate: Number(maxRate) || 0,
					location
				})
			) {
				return false;
			}
			if (tab === 'open') return job.status === 'open';
			return (
				samePerson(job.businessPubkey, me) ||
				staffBoard.seats.some((seat) => seat.jobId === job.id && samePerson(seat.workerPubkey, me))
			);
		})
	);

	onMount(() => {
		if (!enabled) return;
		getNpub()
			.then((value) => {
				me = pubkeyHex(value);
			})
			.catch(() => {
				me = '';
			})
			.finally(() => {
				meReady = true;
			});
		refreshStaffBoard();
	});

	function setTab(next: 'open' | 'mine') {
		const url = new URL(page.url);
		if (next === 'mine') url.searchParams.set('tab', 'mine');
		else url.searchParams.delete('tab');
		goto(url.pathname + url.search, { replaceState: true, keepFocus: true, noScroll: true });
	}

	function money(amount: number) {
		return `$${amount.toFixed(2)}`;
	}
</script>

<svelte:head>
	<title>{copy.title} · BitTasker</title>
</svelte:head>

<div class="container mx-auto min-w-0 px-4 py-8" data-testid="shifts-page">
	<div class="mb-6 flex flex-wrap items-end justify-between gap-3">
		<div>
			<h1 class="text-2xl font-semibold">{copy.title}</h1>
			{#if enabled}
				<p class="text-base-content/70 mt-1 max-w-xl text-sm">{copy.noKyc}</p>
			{/if}
		</div>
		{#if enabled}
			<a href={resolve('/(app)/shifts/new')} class="btn btn-primary" data-testid="post-shift">
				{copy.post}
			</a>
		{/if}
	</div>

	{#if !enabled}
		<p data-testid="shifts-off">{copy.off}</p>
	{:else}
		<div class="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="shifts-filters">
			<label class="flex flex-col gap-1 text-sm">
				{copy.role}
				<select class="select select-bordered" bind:value={role}>
					<option value="">{copy.anyRole}</option>
					{#each STAFF_ROLES as item (item)}
						<option value={item}
							>{language === 'es' ? ROLE_LABELS[item].nameEs : ROLE_LABELS[item].name}</option
						>
					{/each}
				</select>
			</label>
			<label class="flex flex-col gap-1 text-sm">
				{copy.onOrAfter}
				<input class="input input-bordered" type="date" bind:value={date} />
			</label>
			<label class="flex flex-col gap-1 text-sm">
				{copy.maxRate}
				<input
					class="input input-bordered"
					type="number"
					min="0"
					step="0.01"
					bind:value={maxRate}
				/>
			</label>
			<label class="flex flex-col gap-1 text-sm">
				{copy.location}
				<input class="input input-bordered" type="search" bind:value={location} />
			</label>
		</div>

		<div class="mb-4 flex gap-2" role="tablist" data-testid="shifts-tabs">
			<button
				type="button"
				class="btn btn-sm"
				class:btn-primary={tab === 'open'}
				class:btn-outline={tab !== 'open'}
				role="tab"
				aria-selected={tab === 'open'}
				data-testid="shifts-tab-open"
				onclick={() => setTab('open')}
			>
				{copy.openTab}
			</button>
			<button
				type="button"
				class="btn btn-sm"
				class:btn-primary={tab === 'mine'}
				class:btn-outline={tab !== 'mine'}
				role="tab"
				aria-selected={tab === 'mine'}
				data-testid="shifts-tab-mine"
				onclick={() => setTab('mine')}
			>
				{copy.mineTab}
			</button>
		</div>

		{#if !staffBoard.loaded || (tab === 'mine' && !meReady)}
			<p data-testid="shifts-loading">{copy.loading}</p>
		{:else if tab === 'mine' && !me}
			<p>
				{copy.login}
				<a href={resolve('/(app)/auth/login')} class="link link-primary">{copy.loginLink}</a>
			</p>
		{:else if staffBoard.error}
			<p>{copy.loadError}</p>
		{:else if shifts.length === 0}
			<p data-testid="shifts-empty">{tab === 'mine' ? copy.mineEmpty : copy.empty}</p>
		{:else}
			<ul class="flex flex-col gap-3">
				{#each shifts as job (job.id)}
					<li>
						<a
							href={resolve('/(app)/shifts/[id]', { id: job.id })}
							class="border-base-300 hover:border-primary block rounded-xl border px-4 py-3"
							data-testid="shift-card"
						>
							<span class="flex flex-wrap items-baseline justify-between gap-2">
								<span class="font-medium">{job.title}</span>
								<span>{money(job.hourlyRateUsd)}/hr</span>
							</span>
							<span class="text-base-content/70 mt-1 block text-sm">
								{roleLabel(job.role, language)} · {shiftSpan(job)} · {job.location}
							</span>
							<span class="mt-1 block text-sm">
								{copy.people}: {countedSeats(
									staffBoard.seats.filter((seat) => seat.jobId === job.id)
								).length}/{job.headcount}
								· {copy.expected}: {jobExpectedHours(job)} · {money(jobEscrowUsd(job))}
								· {statusLabel(language, job.status)}
							</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</div>
