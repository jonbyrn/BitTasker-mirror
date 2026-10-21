<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { locale } from 'svelte-i18n';
	import { publishSeat } from '$lib/staffing/board.svelte';
	import { staffCopy, staffErrorFrom, statusLabel } from '$lib/staffing/copy';
	import {
		contractForSeat,
		disputeStaffContract,
		fundStaffContract,
		releaseStaffContract
	} from '$lib/staffing/escrow';
	import { nowIso } from '$lib/staffing/hours';
	import { samePerson } from '$lib/staffing/ids';
	import { saveRebook } from '$lib/staffing/rebook';
	import {
		approveHours,
		btcPartialRelease,
		canRelease,
		checkIn,
		checkOut,
		declineSeat,
		disputeSeat,
		jobEscrowUsd,
		markFavourite,
		pickWorker,
		rateBusiness,
		rateWorker,
		rebookDraft,
		StaffRuleError
	} from '$lib/staffing/rules';
	import type { PayAsset, StaffJob, StaffSeat } from '$lib/staffing/types';
	import { usdToSats } from '$lib/utils/helpers/currencyFormatter';

	let {
		job,
		seat,
		seats,
		me,
		isBusiness,
		onChange
	}: {
		job: StaffJob;
		seat: StaffSeat;
		seats: StaffSeat[];
		me: string;
		isBusiness: boolean;
		onChange: (next: StaffSeat) => Promise<void>;
	} = $props();

	const language = $derived(String($locale || 'en').startsWith('es') ? 'es' : 'en');
	const copy = $derived(staffCopy(language));
	let sending = $state(false);
	let error = $state('');
	let notice = $state('');
	let approvedInput = $state('');
	let disputeNote = $state('');
	let invoice = $state('');
	let ratingNote = $state('');
	let asset = $state<PayAsset>('usdt');
	const mine = $derived(samePerson(seat.workerPubkey, me));
	const hold = $derived(jobEscrowUsd(job));

	async function fundSeat() {
		let escrowSats = 0;
		if (asset === 'btc') {
			escrowSats = await usdToSats(hold);
			if (escrowSats < 1) throw new StaffRuleError('price');
		}
		const rune = contractForSeat({ ...seat, asset, escrowUsd: hold, escrowSats }, job.title, hold);
		try {
			await fundStaffContract(rune);
		} catch (cause) {
			if (rune.status === 'funding' || rune.status === 'locked') {
				await publishSeat({
					...seat,
					asset,
					escrowSats,
					contractId: rune.contractId,
					contractStatus: rune.status,
					escrowUsd: hold
				});
			}
			throw cause;
		}
		await onChange({
			...seat,
			status: 'funded',
			asset,
			escrowSats,
			escrowUsd: hold,
			contractId: rune.contractId,
			contractStatus: 'funded'
		});
	}

	function fail(cause: unknown) {
		error = staffErrorFrom(language, cause);
	}

	async function run(action: () => Promise<void>) {
		if (sending) return;
		error = '';
		notice = '';
		sending = true;
		try {
			await action();
		} catch (cause) {
			fail(cause);
		} finally {
			sending = false;
		}
	}

	function money(amount: number) {
		return `$${amount.toFixed(2)}`;
	}
</script>

<li class="border-base-300 rounded-xl border p-4" data-testid="shift-seat">
	<p class="font-medium">
		{seat.workerName}
		<span class="text-base-content/70 font-normal">· {statusLabel(language, seat.status)}</span>
	</p>
	{#if seat.escrowUsd > 0}
		<p class="text-sm">
			{copy.fund}: {money(seat.escrowUsd)} · {seat.asset === 'btc' ? copy.bitcoin : copy.usdt}
			{#if seat.asset === 'btc' && seat.escrowSats > 0}· {seat.escrowSats} sats{/if}
		</p>
	{/if}
	{#if seat.checkInAt}
		<p class="text-sm">{copy.checkIn}: {seat.checkInAt}</p>
	{/if}
	{#if seat.checkOutAt}
		<p class="text-sm">{copy.checkOut}: {seat.checkOutAt}</p>
	{/if}
	{#if seat.hoursWorked > 0}
		<p class="text-sm">{copy.hoursWorked}: {seat.hoursWorked}</p>
	{/if}
	{#if seat.approvedHours > 0}
		<p class="text-sm">{copy.approvedHours}: {seat.approvedHours} · {money(seat.releaseUsd)}</p>
	{/if}
	{#if seat.disputeNote}
		<p class="text-sm">{copy.dispute}: {seat.disputeNote}</p>
	{/if}
	{#if seat.workerRating > 0}
		<p class="text-sm">{copy.rateWorker}: {seat.workerRating}/5 {seat.workerNote}</p>
	{/if}
	{#if seat.businessRating > 0}
		<p class="text-sm">{copy.rateBusiness}: {seat.businessRating}/5 {seat.businessNote}</p>
	{/if}
	{#if error}
		<p class="text-error mt-2 text-sm">{error}</p>
	{/if}
	{#if notice}
		<p class="mt-2 text-sm">{notice}</p>
	{/if}

	<div class="mt-3 flex flex-wrap gap-2">
		{#if isBusiness && seat.status === 'applied'}
			<button
				type="button"
				class="btn btn-primary btn-sm"
				disabled={sending}
				data-testid="pick-worker"
				onclick={() => run(() => onChange(pickWorker(job, seats, seat.id)))}
			>
				{copy.pick}
			</button>
			<button
				type="button"
				class="btn btn-outline btn-sm"
				disabled={sending}
				onclick={() => run(() => onChange(declineSeat(seat)))}
			>
				{copy.decline}
			</button>
		{/if}
		{#if isBusiness && seat.status === 'picked'}
			<button
				type="button"
				class="btn btn-outline btn-sm"
				disabled={sending}
				onclick={() => run(() => onChange(declineSeat(seat)))}
			>
				{copy.decline}
			</button>
			<fieldset class="flex flex-wrap items-center gap-3" data-testid="pay-asset">
				<legend class="text-sm">{copy.asset}</legend>
				<label class="flex items-center gap-2 text-sm">
					<input
						type="radio"
						name="asset-{seat.id}"
						value="usdt"
						bind:group={asset}
						data-testid="pay-with-usdt"
					/>
					{copy.usdt}
				</label>
				<label class="flex items-center gap-2 text-sm">
					<input
						type="radio"
						name="asset-{seat.id}"
						value="btc"
						bind:group={asset}
						data-testid="pay-with-btc"
					/>
					{copy.bitcoin}
				</label>
				<button
					type="button"
					class="btn btn-primary btn-sm"
					disabled={sending}
					data-testid="fund-escrow"
					onclick={() => run(fundSeat)}
				>
					{copy.fund} · {money(hold)}
				</button>
			</fieldset>
			<p class="basis-full text-sm">{copy.noFee}</p>
		{/if}
		{#if mine && seat.status === 'funded'}
			<button
				type="button"
				class="btn btn-primary btn-sm"
				disabled={sending}
				data-testid="check-in"
				onclick={() => run(() => onChange(checkIn(seat, nowIso())))}
			>
				{copy.checkIn}
			</button>
		{/if}
		{#if mine && seat.status === 'checked_in'}
			<button
				type="button"
				class="btn btn-primary btn-sm"
				disabled={sending}
				data-testid="check-out"
				onclick={() => run(() => onChange(checkOut(seat, nowIso())))}
			>
				{copy.checkOut}
			</button>
		{/if}
		{#if isBusiness && seat.status !== 'applied' && seat.status !== 'invited' && seat.status !== 'declined'}
			<button
				type="button"
				class="btn btn-outline btn-sm"
				disabled={sending}
				data-testid="favourite-worker"
				onclick={() => run(() => onChange(markFavourite(seat, !seat.favourite)))}
			>
				{seat.favourite ? '★' : '☆'}
				{copy.favourite}
			</button>
		{/if}
		{#if isBusiness && seat.favourite}
			<button
				type="button"
				class="btn btn-outline btn-sm"
				data-testid="rebook-worker"
				onclick={() => {
					saveRebook(rebookDraft(job, seat));
					goto(resolve('/(app)/shifts/new'));
				}}
			>
				{copy.rebook}
			</button>
		{/if}
	</div>

	{#if isBusiness && seat.status === 'checked_out'}
		<form
			class="mt-3 flex flex-wrap items-end gap-2"
			onsubmit={(event) => {
				event.preventDefault();
				run(() => onChange(approveHours(seat, Number(approvedInput), job.hourlyRateUsd)));
			}}
		>
			<label class="flex flex-col gap-1 text-sm">
				{copy.approvedHours}
				<input
					class="input input-bordered input-sm"
					type="number"
					min="0.01"
					step="0.01"
					bind:value={approvedInput}
					data-testid="approved-hours"
				/>
			</label>
			<button class="btn btn-primary btn-sm" type="submit" disabled={sending}>{copy.approve}</button
			>
		</form>
	{/if}

	{#if isBusiness && btcPartialRelease(seat)}
		<p class="mt-3 text-sm" data-testid="btc-partial">{copy.btcPartial}</p>
	{:else if isBusiness && canRelease(seat)}
		<form
			class="mt-3 flex flex-col gap-2"
			onsubmit={(event) => {
				event.preventDefault();
				run(async () => {
					const rune = contractForSeat(seat, job.title, seat.escrowUsd || hold);
					await releaseStaffContract(rune, invoice, seat);
					await onChange({ ...seat, status: 'released', contractStatus: rune.status });
					notice = copy.released;
				});
			}}
		>
			<label class="flex flex-col gap-1 text-sm">
				{copy.invoice}
				<input
					class="input input-bordered input-sm"
					bind:value={invoice}
					data-testid="payout-invoice"
				/>
			</label>
			<button
				class="btn btn-primary btn-sm w-fit"
				type="submit"
				disabled={sending}
				data-testid="release-payment"
			>
				{copy.release} · {money(seat.releaseUsd)}
			</button>
		</form>
	{/if}

	{#if (isBusiness || mine) && (seat.status === 'funded' || seat.status === 'checked_in' || seat.status === 'checked_out' || seat.status === 'approved')}
		<form
			class="mt-3 flex flex-col gap-2"
			onsubmit={(event) => {
				event.preventDefault();
				run(async () => {
					const next = disputeSeat(seat, disputeNote);
					const rune = contractForSeat(seat, job.title, seat.escrowUsd || jobEscrowUsd(job));
					await disputeStaffContract(rune, next.disputeNote);
					await onChange({ ...next, contractStatus: 'disputed' });
				});
			}}
		>
			<label class="flex flex-col gap-1 text-sm">
				{copy.disputeNote}
				<textarea class="textarea textarea-bordered textarea-sm" rows="2" bind:value={disputeNote}
				></textarea>
			</label>
			<button
				class="btn btn-outline btn-sm w-fit"
				type="submit"
				disabled={sending}
				data-testid="dispute-shift"
			>
				{copy.dispute}
			</button>
		</form>
	{/if}

	{#if (isBusiness || mine) && (seat.status === 'checked_out' || seat.status === 'approved' || seat.status === 'released' || seat.status === 'disputed')}
		<form
			class="mt-3 flex flex-wrap items-center gap-2"
			onsubmit={(event) => {
				event.preventDefault();
			}}
		>
			<label class="text-sm" for="rating-note-{seat.id}"
				>{isBusiness ? copy.rateWorker : copy.rateBusiness}</label
			>
			<input
				id="rating-note-{seat.id}"
				class="input input-bordered input-sm"
				bind:value={ratingNote}
			/>
			{#each [1, 2, 3, 4, 5] as stars (stars)}
				<button
					type="button"
					class="btn btn-xs"
					disabled={sending}
					onclick={() =>
						run(() =>
							onChange(
								isBusiness
									? rateWorker(seat, stars, ratingNote)
									: rateBusiness(seat, stars, ratingNote)
							)
						)}
				>
					{stars}
				</button>
			{/each}
		</form>
	{/if}
</li>
