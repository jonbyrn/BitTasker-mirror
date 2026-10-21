<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { locale } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { authState } from '$lib/stores/auth.store';
	import { isTempStaffEnabled } from '$lib/services/feature-flags';
	import { publishJob, publishSeat } from '$lib/staffing/board.svelte';
	import { staffCopy, staffErrorFrom } from '$lib/staffing/copy';
	import KeyUnlock from '$lib/components/wallet/KeyUnlock.svelte';
	import { prefetchPasskeyChallenge } from '$lib/utils/helpers/biometrics';
	import { walletUnlockRoute } from '$lib/utils/helpers/login-method';
	import { getMnemonic } from '$lib/utils/helpers/mnemonic';
	import { isNsecUnlockRequired } from '$lib/utils/helpers/nsec-unlock';
	import { SignerLockedError } from '$lib/utils/helpers/passkey-prompt';
	import { prepareSigner, signerReady } from '$lib/utils/nostrKeys';
	import { pubkeyHex } from '$lib/staffing/ids';
	import { takeRebook } from '$lib/staffing/rebook';
	import { ROLE_LABELS, roleLabel } from '$lib/staffing/roles';
	import { staffSuggestionCopy, suggestStaffRole } from '$lib/staffing/suggest-role';
	import { buildJob, inviteWorker, StaffRuleError } from '$lib/staffing/rules';
	import { STAFF_ROLE_CHOICES, type StaffRole } from '$lib/staffing/types';

	const enabled = isTempStaffEnabled();
	const language = $derived(String($locale || 'en').startsWith('es') ? 'es' : 'en');
	const copy = $derived(staffCopy(language));
	const suggestionCopy = $derived(staffSuggestionCopy(language));
	const suggestedRole = $derived(suggestStaffRole(title, requirements));
	const showRoleSuggestion = $derived(
		title.trim().length >= 3 && suggestedRole !== '' && suggestedRole !== role
	);

	let title = $state('');
	let role = $state<StaffRole | ''>('');
	let date = $state('');
	let endDate = $state('');
	let startTime = $state('09:00');
	let endTime = $state('17:00');
	let location = $state('');
	let headcount = $state(1);
	let hourlyRateUsd = $state<number | ''>(4);
	let requirements = $state('');
	let invitedPubkey = $state('');
	let sending = $state(false);
	let error = $state('');
	let needsUnlock = $state(false);

	onMount(() => {
		prefetchPasskeyChallenge();
		const draft = takeRebook();
		if (!draft) return;
		role = draft.role;
		location = draft.location;
		hourlyRateUsd = draft.hourlyRateUsd > 0 ? draft.hourlyRateUsd : 4;
		requirements = draft.requirements;
		invitedPubkey = draft.invitedPubkey;
		headcount = draft.headcount || 1;
	});

	function chooseStartDate(value: string) {
		date = value;
		if (value && (!endDate || endDate < value)) endDate = value;
	}

	function draftBody() {
		const rate = typeof hourlyRateUsd === 'number' ? hourlyRateUsd : Number(hourlyRateUsd);
		return {
			title: title.trim(),
			role,
			requirements,
			location,
			date,
			endDate: endDate || date,
			startTime,
			endTime,
			days: 1,
			headcount,
			hourlyRateUsd: Number.isFinite(rate) ? rate : 0,
			invitedPubkey
		};
	}

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

	async function saveShift(npub: string) {
		const body = draftBody();
		const invite = invitedPubkey.trim();
		const me = pubkeyHex(npub);
		if (!me) throw new StaffRuleError('login');
		if (invite && pubkeyHex(invite) === me) throw new StaffRuleError('own-job');
		const posted = buildJob(body, me, crypto.randomUUID(), Math.floor(Date.now() / 1000));
		const saved = await publishJob(posted);
		if (invite) {
			const seat = inviteWorker(saved, [], invite, 'Worker');
			await publishSeat(seat);
		}
		goto(resolve('/(app)/shifts/[id]', { id: saved.id }));
	}

	function publish(event: SubmitEvent) {
		event.preventDefault();
		if (sending) return;
		error = '';
		if (!$authState.isAuthenticated) {
			error = copy.login;
			return;
		}
		const body = draftBody();
		const invite = invitedPubkey.trim();
		try {
			buildJob(body, 'ab'.repeat(32), 'draft', Math.floor(Date.now() / 1000));
			if (invite && !pubkeyHex(invite)) throw new StaffRuleError('pubkey');
		} catch (cause) {
			fail(cause);
			return;
		}
		if (lockedNsec()) {
			needsUnlock = true;
			return;
		}
		const unlock = prepareSigner();
		sending = true;
		void unlock
			.then(({ npub }) => saveShift(npub))
			.then(() => {
				needsUnlock = false;
			})
			.catch((cause: unknown) => fail(cause))
			.finally(() => {
				sending = false;
			});
	}

	function unlockThenPublish(nsec: string) {
		const unlock = lockedNsec() ? null : prepareSigner();
		error = '';
		sending = true;
		void (async () => {
			try {
				if (walletUnlockRoute() === 'nsec') await getMnemonic({ nsec });
				const keys = unlock ? await unlock : await prepareSigner();
				await saveShift(keys.npub);
				needsUnlock = false;
			} catch (cause) {
				fail(cause);
			} finally {
				sending = false;
			}
		})();
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
		<p class="text-sm">{copy.noFee}</p>
		{#if !$authState.isAuthenticated}
			<p class="mt-4">
				{copy.login}
				<a href={resolve('/(app)/auth/login')} class="link link-primary">{copy.loginLink}</a>
			</p>
		{/if}
		<form class="mt-6 flex w-full flex-col gap-4" onsubmit={publish} novalidate>
			<label class="flex w-full min-w-0 flex-col gap-1 text-sm">
				{copy.shiftTitle}
				<input class="input input-bordered w-full" bind:value={title} maxlength="120" />
			</label>
			{#if showRoleSuggestion}
				<div
					class="border-primary/40 bg-primary/5 flex flex-col gap-2 rounded-xl border px-3 py-3 text-sm"
					data-testid="shift-role-suggestion"
				>
					<p>
						{suggestionCopy.suggested}:
						<strong>{roleLabel(suggestedRole, language)}</strong>
					</p>
					<div class="flex flex-wrap items-center gap-2">
						<button
							type="button"
							class="btn btn-primary btn-sm"
							data-testid="accept-shift-role"
							onclick={() => (role = suggestedRole)}
						>
							{suggestionCopy.accept}
						</button>
						<span class="text-base-content/70">{suggestionCopy.change}</span>
					</div>
				</div>
			{/if}
			<label class="flex w-full min-w-0 flex-col gap-1 text-sm">
				{copy.role}
				<select class="select select-bordered w-full" bind:value={role}>
					<option value="">{copy.chooseRole}</option>
					{#each STAFF_ROLE_CHOICES as item (item)}
						<option value={item}
							>{language === 'es' ? ROLE_LABELS[item].nameEs : ROLE_LABELS[item].name}</option
						>
					{/each}
				</select>
			</label>
			<div class="grid w-full gap-3 sm:grid-cols-2">
				<label class="flex min-w-0 flex-col gap-1 text-sm">
					{copy.date}
					<input
						class="input input-bordered w-full"
						type="date"
						value={date}
						oninput={(event) => chooseStartDate(event.currentTarget.value)}
						onchange={(event) => chooseStartDate(event.currentTarget.value)}
					/>
				</label>
				<label class="flex min-w-0 flex-col gap-1 text-sm">
					{copy.endDate}
					<input class="input input-bordered w-full" type="date" bind:value={endDate} min={date} />
				</label>
				<label class="flex min-w-0 flex-col gap-1 text-sm">
					{copy.start}
					<input class="input input-bordered w-full" type="time" bind:value={startTime} />
				</label>
				<label class="flex min-w-0 flex-col gap-1 text-sm">
					{copy.end}
					<input class="input input-bordered w-full" type="time" bind:value={endTime} />
				</label>
			</div>
			<label class="flex w-full min-w-0 flex-col gap-1 text-sm">
				{copy.location}
				<input class="input input-bordered w-full" bind:value={location} maxlength="200" />
			</label>
			<div class="grid w-full gap-3 sm:grid-cols-2">
				<label class="flex min-w-0 flex-col gap-1 text-sm">
					{copy.people}
					<input
						class="input input-bordered w-full"
						type="number"
						min="1"
						max="100"
						bind:value={headcount}
					/>
				</label>
				<label class="flex min-w-0 flex-col gap-1 text-sm">
					{copy.rate}
					<input
						class="input input-bordered w-full"
						type="number"
						min="0.01"
						step="0.01"
						inputmode="decimal"
						placeholder="3.50"
						bind:value={hourlyRateUsd}
					/>
				</label>
			</div>
			<label class="flex w-full min-w-0 flex-col gap-1 text-sm">
				<span>
					{copy.requirements}
					<span class="text-error" aria-hidden="true">*</span>
				</span>
				<textarea
					class="textarea textarea-bordered w-full"
					rows="4"
					bind:value={requirements}
					aria-required="true"
					maxlength="2000"
				></textarea>
			</label>
			<label class="flex w-full min-w-0 flex-col gap-1 text-sm">
				{copy.invite}
				<input class="input input-bordered w-full" bind:value={invitedPubkey} spellcheck="false" />
			</label>
			{#if error}
				<p class="text-error text-sm" data-testid="shift-error">{error}</p>
			{/if}
			{#if needsUnlock}
				<KeyUnlock
					embedded
					testId="shift-unlock"
					passkeyLabel={copy.unlock}
					keyLabel={copy.unlock}
					busy={sending}
					onunlock={unlockThenPublish}
				/>
			{/if}
			<button
				class="btn btn-primary w-full sm:w-auto"
				type="submit"
				disabled={sending}
				data-testid="publish-shift"
			>
				{#if sending}
					<span class="loading loading-spinner loading-sm"></span>
				{/if}
				{sending ? copy.sending : copy.save}
			</button>
		</form>
	{/if}
</div>
