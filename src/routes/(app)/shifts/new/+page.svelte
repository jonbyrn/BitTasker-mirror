<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { locale } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { authState } from '$lib/stores/auth.store';
	import { isTempStaffEnabled } from '$lib/services/feature-flags';
	import { publishJob, publishSeat } from '$lib/staffing/board.svelte';
	import { staffCopy, staffErrorFrom } from '$lib/staffing/copy';
	import { getNpub } from '$lib/utils/nostrKeys';
	import { pubkeyHex } from '$lib/staffing/ids';
	import { takeRebook } from '$lib/staffing/rebook';
	import { ROLE_LABELS } from '$lib/staffing/roles';
	import { buildJob, inviteWorker, StaffRuleError } from '$lib/staffing/rules';
	import { STAFF_ROLES, type StaffRole } from '$lib/staffing/types';

	const enabled = isTempStaffEnabled();
	const language = $derived(String($locale || 'en').startsWith('es') ? 'es' : 'en');
	const copy = $derived(staffCopy(language));

	let title = $state('');
	let role = $state<StaffRole>('hospitality');
	let date = $state('');
	let startTime = $state('09:00');
	let endTime = $state('17:00');
	let days = $state(1);
	let location = $state('');
	let headcount = $state(1);
	let hourlyRateUsd = $state(25);
	let requirements = $state('');
	let invitedPubkey = $state('');
	let sending = $state(false);
	let error = $state('');

	onMount(() => {
		const draft = takeRebook();
		if (!draft) return;
		role = draft.role;
		location = draft.location;
		hourlyRateUsd = draft.hourlyRateUsd || 25;
		requirements = draft.requirements;
		invitedPubkey = draft.invitedPubkey;
		headcount = draft.headcount || 1;
	});

	function fail(cause: unknown) {
		error = staffErrorFrom(language, cause);
	}

	async function publish(event: SubmitEvent) {
		event.preventDefault();
		if (sending) return;
		error = '';
		if (!$authState.isAuthenticated) {
			error = copy.login;
			return;
		}
		sending = true;
		try {
			const me = pubkeyHex(await getNpub());
			if (!me) throw new StaffRuleError('login');
			const invite = invitedPubkey.trim();
			if (invite && !pubkeyHex(invite)) throw new StaffRuleError('pubkey');
			if (invite && pubkeyHex(invite) === me) throw new StaffRuleError('own-job');
			const posted = buildJob(
				{
					title:
						title.trim() ||
						`${language === 'es' ? ROLE_LABELS[role].nameEs : ROLE_LABELS[role].name} ${date}`,
					role,
					requirements,
					location,
					date,
					startTime,
					endTime,
					days,
					headcount,
					hourlyRateUsd,
					invitedPubkey
				},
				me,
				crypto.randomUUID(),
				Math.floor(Date.now() / 1000)
			);
			const saved = await publishJob(posted);
			if (invite) {
				const seat = inviteWorker(saved, [], invite, 'Worker');
				await publishSeat(seat);
			}
			goto(resolve('/(app)/shifts/[id]', { id: saved.id }));
		} catch (cause) {
			fail(cause);
		} finally {
			sending = false;
		}
	}
</script>

<svelte:head>
	<title>{copy.post} · BitTasker</title>
</svelte:head>

<div class="container mx-auto max-w-2xl px-4 py-8" data-testid="shift-form">
	<a href={resolve('/(app)/shifts')} class="link link-primary text-sm">{copy.back}</a>
	<h1 class="mt-3 text-2xl font-semibold">{copy.post}</h1>

	{#if !enabled}
		<p class="mt-4" data-testid="shifts-off">{copy.off}</p>
	{:else}
		<p class="text-base-content/70 mt-2 text-sm">{copy.noKyc}</p>
		{#if !$authState.isAuthenticated}
			<p class="mt-4">
				{copy.login}
				<a href={resolve('/(app)/auth/login')} class="link link-primary">{copy.loginLink}</a>
			</p>
		{/if}
		<form class="mt-6 flex flex-col gap-4" onsubmit={publish}>
			<label class="flex flex-col gap-1 text-sm">
				{copy.shiftTitle}
				<input class="input input-bordered" bind:value={title} maxlength="120" />
			</label>
			<label class="flex flex-col gap-1 text-sm">
				{copy.role}
				<select class="select select-bordered" bind:value={role}>
					{#each STAFF_ROLES as item (item)}
						<option value={item}
							>{language === 'es' ? ROLE_LABELS[item].nameEs : ROLE_LABELS[item].name}</option
						>
					{/each}
				</select>
			</label>
			<div class="grid gap-3 sm:grid-cols-2">
				<label class="flex flex-col gap-1 text-sm">
					{copy.date}
					<input class="input input-bordered" type="date" bind:value={date} required />
				</label>
				<label class="flex flex-col gap-1 text-sm">
					{copy.days}
					<input class="input input-bordered" type="number" min="1" max="31" bind:value={days} />
				</label>
				<label class="flex flex-col gap-1 text-sm">
					{copy.start}
					<input class="input input-bordered" type="time" bind:value={startTime} required />
				</label>
				<label class="flex flex-col gap-1 text-sm">
					{copy.end}
					<input class="input input-bordered" type="time" bind:value={endTime} required />
				</label>
			</div>
			<label class="flex flex-col gap-1 text-sm">
				{copy.location}
				<input class="input input-bordered" bind:value={location} required maxlength="200" />
			</label>
			<div class="grid gap-3 sm:grid-cols-2">
				<label class="flex flex-col gap-1 text-sm">
					{copy.people}
					<input
						class="input input-bordered"
						type="number"
						min="1"
						max="100"
						bind:value={headcount}
					/>
				</label>
				<label class="flex flex-col gap-1 text-sm">
					{copy.rate}
					<input
						class="input input-bordered"
						type="number"
						min="1"
						step="0.01"
						bind:value={hourlyRateUsd}
					/>
				</label>
			</div>
			<label class="flex flex-col gap-1 text-sm">
				{copy.requirements}
				<textarea
					class="textarea textarea-bordered"
					rows="4"
					bind:value={requirements}
					required
					maxlength="2000"
				></textarea>
			</label>
			<label class="flex flex-col gap-1 text-sm">
				{copy.invite}
				<input class="input input-bordered" bind:value={invitedPubkey} spellcheck="false" />
			</label>
			{#if error}
				<p class="text-error text-sm" data-testid="shift-error">{error}</p>
			{/if}
			<button class="btn btn-primary" type="submit" disabled={sending} data-testid="publish-shift">
				{sending ? copy.sending : copy.save}
			</button>
		</form>
	{/if}
</div>
