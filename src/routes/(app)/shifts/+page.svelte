<script lang="ts">
	import { resolve } from '$app/paths';
	import { locale } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { isTempStaffEnabled } from '$lib/services/feature-flags';
	import { refreshStaffBoard, staffBoard } from '$lib/staffing/board.svelte';
	import { staffCopy, statusLabel } from '$lib/staffing/copy';
	import { jobEscrowUsd, jobExpectedHours, countedSeats, shiftMatches } from '$lib/staffing/rules';
	import { ROLE_LABELS, roleLabel } from '$lib/staffing/roles';
	import { STAFF_ROLES } from '$lib/staffing/types';

	const enabled = isTempStaffEnabled();
	const language = $derived(String($locale || 'en').startsWith('es') ? 'es' : 'en');
	const copy = $derived(staffCopy(language));
	let role = $state('');
	let date = $state('');
	let maxRate = $state('');
	let location = $state('');

	const shifts = $derived(
		staffBoard.jobs.filter((job) =>
			shiftMatches(job, {
				role,
				date,
				maxRate: Number(maxRate) || 0,
				location
			})
		)
	);

	onMount(() => {
		if (!enabled) return;
		refreshStaffBoard();
	});

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

		{#if !staffBoard.loaded}
			<p data-testid="shifts-loading">{language === 'es' ? 'Cargando…' : 'Loading…'}</p>
		{:else if staffBoard.error}
			<p>{copy.loadError}</p>
		{:else if shifts.length === 0}
			<p data-testid="shifts-empty">{copy.empty}</p>
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
								{roleLabel(job.role, language)} · {job.date} · {job.startTime}–{job.endTime} · {job.location}
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
