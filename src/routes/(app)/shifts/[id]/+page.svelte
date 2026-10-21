<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { locale } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { authState } from '$lib/stores/auth.store';
	import { user } from '$lib/stores/user.store';
	import { isTempStaffEnabled } from '$lib/services/feature-flags';
	import ShiftSeat from '$lib/components/staffing/ShiftSeat.svelte';
	import {
		publishJob,
		publishSeat,
		refreshStaffBoard,
		staffBoard
	} from '$lib/staffing/board.svelte';
	import { dayCountLabel, staffCopy, staffErrorFrom, statusLabel } from '$lib/staffing/copy';
	import { shiftSpan } from '$lib/staffing/hours';
	import { isShiftExpired } from '$lib/utils/helpers/taskDeadline';
	import { pubkeyHex, samePerson } from '$lib/staffing/ids';
	import { roleLabel } from '$lib/staffing/roles';
	import {
		acceptInvite,
		acceptShift,
		cancelJob,
		countedSeats,
		declineSeat,
		jobEscrowUsd,
		jobExpectedHours,
		nextJobStatus,
		StaffRuleError
	} from '$lib/staffing/rules';
	import type { StaffJob, StaffSeat } from '$lib/staffing/types';
	import KeyUnlock from '$lib/components/wallet/KeyUnlock.svelte';
	import { prefetchPasskeyChallenge } from '$lib/utils/helpers/biometrics';
	import { isNsecUnlockRequired } from '$lib/utils/helpers/nsec-unlock';
	import { SignerLockedError } from '$lib/utils/helpers/passkey-prompt';
	import { walletUnlockRoute } from '$lib/utils/helpers/login-method';
	import { getMnemonic } from '$lib/utils/helpers/mnemonic';
	import { getNpub, prepareSigner, signerReady } from '$lib/utils/nostrKeys';

	const enabled = isTempStaffEnabled();
	const language = $derived(String($locale || 'en').startsWith('es') ? 'es' : 'en');
	const copy = $derived(staffCopy(language));
	const jobId = $derived(page.params.id ?? '');
	const job = $derived(staffBoard.jobs.find((item) => item.id === jobId));
	const seats = $derived(staffBoard.seats.filter((seat) => seat.jobId === jobId));

	let me = $state('');
	let error = $state('');
	let sending = $state(false);
	let needsUnlock = $state(false);
	let confirmClose = $state(false);
	let pending = $state<(() => Promise<void>) | null>(null);

	const isBusiness = $derived(Boolean(job && samePerson(job.businessPubkey, me)));
	const mine = $derived(seats.find((seat) => samePerson(seat.workerPubkey, me)));

	onMount(() => {
		if (!enabled) return;
		prefetchPasskeyChallenge();
		getNpub()
			.then((value) => {
				me = pubkeyHex(value);
			})
			.catch(() => {
				me = '';
			});
		refreshStaffBoard();
	});

	function fail(cause: unknown) {
		if (isNsecUnlockRequired(cause) || cause instanceof SignerLockedError) {
			needsUnlock = true;
			error = '';
			return;
		}
		error = staffErrorFrom(language, cause);
	}

	function lockedNsec(): boolean {
		return walletUnlockRoute() === 'nsec' && !signerReady();
	}

	async function saveSeat(next: StaffSeat, posted?: StaffJob) {
		await publishSeat(next);
		if (!posted) return;
		const sameJob = staffBoard.seats.filter(
			(seat) => seat.jobId === posted.id && seat.id !== next.id
		);
		const status = nextJobStatus(posted, [...sameJob, next]);
		if (status !== posted.status) await publishJob({ ...posted, status });
	}

	async function run(action: () => Promise<void>) {
		if (sending) return;
		if (!$authState.isAuthenticated) {
			error = copy.login;
			return;
		}
		error = '';
		if (lockedNsec()) {
			needsUnlock = true;
			pending = action;
			return;
		}
		const unlock = prepareSigner();
		sending = true;
		try {
			const { npub } = await unlock;
			if (!me) me = pubkeyHex(npub);
			needsUnlock = false;
			await action();
		} catch (cause) {
			pending = action;
			fail(cause);
		} finally {
			sending = false;
		}
	}

	function unlockThenRun(nsec: string) {
		const action = pending;
		const unlock = lockedNsec() ? null : prepareSigner();
		if (!action) return;
		error = '';
		sending = true;
		void (async () => {
			try {
				if (walletUnlockRoute() === 'nsec') await getMnemonic({ nsec });
				const keys = unlock ? await unlock : await prepareSigner();
				if (!me) me = pubkeyHex(keys.npub);
				needsUnlock = false;
				pending = null;
				await action();
			} catch (cause) {
				fail(cause);
			} finally {
				sending = false;
			}
		})();
	}

	function requireLogin() {
		if (!$authState.isAuthenticated || !me) throw new StaffRuleError('login');
	}

	function workerName() {
		return get(user).name.trim() || copy.you;
	}

	function money(amount: number) {
		return `$${amount.toFixed(2)}`;
	}
</script>

<svelte:head>
	<title>{job?.title || copy.title} · BitTasker</title>
</svelte:head>

<div class="container mx-auto max-w-3xl px-4 py-8" data-testid="shift-detail">
	<a href={resolve('/(app)/shifts')} class="link link-primary text-sm">{copy.back}</a>

	{#if !enabled}
		<h1 class="mt-3 text-2xl font-semibold">{copy.title}</h1>
		<p class="mt-4" data-testid="shifts-off">{copy.off}</p>
	{:else if !job}
		<h1 class="mt-3 text-2xl font-semibold">{copy.title}</h1>
		{#if staffBoard.loaded}
			<p class="mt-4">{copy.empty}</p>
		{:else}
			<div class="mt-4 flex flex-col gap-3" data-testid="shift-loading" aria-busy="true">
				<span class="loading loading-spinner loading-md"></span>
				<div class="skeleton h-24 w-full"></div>
			</div>
		{/if}
	{:else}
		<h1 class="mt-3 text-2xl font-semibold">{job.title}</h1>
		<p class="mt-2 text-sm">
			{roleLabel(job.role, language)} · {shiftSpan(job)}{#if job.days > 1}
				· {dayCountLabel(language, job.days)}{/if}
		</p>
		<p class="mt-1 text-sm">{job.location}</p>
		<p class="mt-1 text-sm">
			{copy.people}: {countedSeats(seats).length}/{job.headcount} · {money(job.hourlyRateUsd)}/hr ·
			{copy.expected}: {jobExpectedHours(job)} · {money(jobEscrowUsd(job))} ·
			{statusLabel(language, isShiftExpired(job) ? 'expired' : job.status)}
		</p>
		<p class="mt-3 text-sm whitespace-pre-wrap">{job.requirements}</p>

		{#if error}
			<p class="text-error mt-4 text-sm" data-testid="shift-error">{error}</p>
		{/if}

		{#if needsUnlock}
			<div class="mt-4" data-testid="shift-unlock">
				<KeyUnlock
					embedded
					passkeyLabel={copy.unlock}
					keyLabel={copy.unlock}
					busy={sending}
					onunlock={unlockThenRun}
				/>
			</div>
		{/if}

		<div class="mt-6 flex flex-wrap gap-2">
			{#if isBusiness && job.status !== 'cancelled'}
				{#if confirmClose}
					<button
						type="button"
						class="btn btn-error btn-sm"
						disabled={sending}
						data-testid="confirm-close-shift"
						onclick={() =>
							run(async () => {
								requireLogin();
								if (!job) return;
								await publishJob(cancelJob(job, me));
								confirmClose = false;
							})}
					>
						{copy.closeYes}
					</button>
					<button
						type="button"
						class="btn btn-ghost btn-sm"
						disabled={sending}
						onclick={() => (confirmClose = false)}
					>
						{copy.keepOpen}
					</button>
				{:else}
					<button
						type="button"
						class="btn btn-outline btn-sm"
						disabled={sending}
						data-testid="close-shift"
						onclick={() => (confirmClose = true)}
					>
						{copy.close}
					</button>
				{/if}
			{/if}
			{#if !isBusiness && job.status === 'open' && !isShiftExpired(job) && (!mine || mine.status === 'declined' || mine.status === 'applied')}
				<button
					type="button"
					class="btn btn-primary btn-sm"
					disabled={sending}
					data-testid="accept-shift"
					onclick={() =>
						run(async () => {
							requireLogin();
							await saveSeat(acceptShift(job, seats, me, workerName()), job);
						})}
				>
					{#if sending}
						<span class="loading loading-spinner loading-xs"></span>
					{/if}
					{copy.accept}
				</button>
			{/if}
			{#if mine && mine.status === 'invited'}
				<button
					type="button"
					class="btn btn-primary btn-sm"
					disabled={sending}
					data-testid="accept-shift"
					onclick={() =>
						run(async () => {
							requireLogin();
							await saveSeat(acceptInvite(job, seats, me), job);
						})}
				>
					{copy.accept}
				</button>
				<button
					type="button"
					class="btn btn-outline btn-sm"
					disabled={sending}
					onclick={() =>
						run(async () => {
							if (!mine) return;
							await saveSeat(declineSeat(mine), job);
						})}
				>
					{copy.decline}
				</button>
			{/if}
		</div>

		<ul class="mt-6 flex flex-col gap-4">
			{#each seats as seat (seat.id)}
				<ShiftSeat
					{job}
					{seat}
					{seats}
					{me}
					{isBusiness}
					onChange={(next) => saveSeat(next, job)}
				/>
			{/each}
		</ul>
	{/if}
</div>
