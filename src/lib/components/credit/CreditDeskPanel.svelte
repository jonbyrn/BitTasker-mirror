<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { t } from 'svelte-i18n';
	import { formatCents } from '$lib/credit/money';
	import {
		currentQuote,
		deskAccept,
		deskCancelJob,
		deskCancelOpen,
		deskComplete,
		deskConfirmEscrow,
		deskConfirmFunding,
		deskFund,
		deskOffer,
		deskRequest,
		deskSetNewcomer,
		deskStatus,
		releaseLines,
		reputationFor,
		type CreditDesk
	} from '$lib/credit/flow';
	import {
		commitCreditDesk,
		creditDeskStore,
		openCreditDesk,
		resetCreditDesk
	} from '$lib/credit/session';

	let { mode = 'desk' }: { mode?: 'desk' | 'offers' } = $props();

	let role = $state<'worker' | 'lender' | 'hirer'>('worker');
	let errorMessage = $state('');
	let pending = $state(false);

	const desk = $derived($creditDeskStore);
	const mockQuery = $derived(
		page.url.searchParams.get('creditMock') === '1' ? '?creditMock=1' : ''
	);

	onMount(() => {
		if (!$creditDeskStore) openCreditDesk();
	});

	function nowSec(): number {
		return Math.floor(Date.now() / 1000);
	}

	async function run(
		action: (current: CreditDesk) => Promise<CreditDesk> | CreditDesk
	): Promise<void> {
		const current = $creditDeskStore;
		if (!current || pending) return;
		errorMessage = '';
		pending = true;
		try {
			commitCreditDesk(await action(current));
		} catch (cause) {
			errorMessage = cause instanceof Error ? cause.message : $t('credit.generic_error');
		} finally {
			pending = false;
		}
	}

	const reputation = $derived(desk ? reputationFor(desk) : null);
	const quote = $derived(desk ? currentQuote(desk) : null);
	const status = $derived(desk ? deskStatus(desk) : 'loading');
	const lines = $derived(releaseLines(desk?.split ?? null));

	function statusLabel(value: string): string {
		if (value === 'waiting-for-confirmation') return $t('credit.waiting');
		if (value === 'escrow-unconfirmed') return $t('credit.escrow_unconfirmed');
		if (value === 'escrow-funded') return $t('credit.escrow_funded');
		if (value === 'funded') return $t('credit.funded');
		if (value === 'repaid') return $t('credit.repaid');
		if (value === 'defaulted') return $t('credit.defaulted');
		if (value === 'requested') return $t('credit.requested');
		if (value === 'offered') return $t('credit.offered');
		if (value === 'accepted') return $t('credit.accepted');
		if (value === 'cancelled') return $t('credit.cancelled');
		return value;
	}
</script>

<section
	class="flex flex-col gap-4"
	data-testid={mode === 'offers' ? 'credit-offer-list' : 'credit-desk'}
>
	<div class="flex flex-wrap gap-2">
		<a class="btn btn-sm btn-ghost" href={`/credit${mockQuery}`} data-testid="credit-open-request">
			{$t('credit.open_request')}
		</a>
		<a
			class="btn btn-sm btn-ghost"
			href={`/credit/offers${mockQuery}`}
			data-testid="credit-open-offers"
		>
			{$t('credit.open_offers')}
		</a>
	</div>

	{#if !desk || !reputation || !quote}
		<p role="status">{$t('credit.loading')}</p>
	{:else}
		<div class="card bg-base-100 border-base-300 border shadow-sm">
			<div class="card-body gap-3 p-5">
				<p class="text-sm" data-testid="credit-escrow-status">{statusLabel(status)}</p>
				<p class="text-sm" data-testid="credit-funding-status">{statusLabel(status)}</p>
				<p class="text-sm">
					{$t('credit.jobs', { values: { count: reputation.completedContracts } })}
					{#if reputation.averageRating != null}
						{$t('credit.rating', { values: { rating: reputation.averageRating } })}
					{/if}
				</p>
				<p class="text-sm">{$t('credit.score', { values: { score: reputation.score } })}</p>
				<p class="text-2xl font-bold" data-testid="credit-max-advance">
					{$t('credit.max', {
						values: { amount: formatCents(quote.advanceCents), percent: quote.percent }
					})}
				</p>
				<p class="text-sm" data-testid="credit-partial-guard">{$t('credit.partial_guard')}</p>
				{#if desk.notice}
					<p class="text-sm">{desk.notice}</p>
				{/if}
			</div>
		</div>

		{#if mode === 'desk'}
			<div class="flex flex-wrap gap-2" role="group" aria-label={$t('credit.role_group')}>
				<button
					type="button"
					class="btn btn-sm"
					class:btn-primary={role === 'worker'}
					onclick={() => (role = 'worker')}
					data-testid="credit-role-worker">{$t('credit.role_worker')}</button
				>
				<button
					type="button"
					class="btn btn-sm"
					class:btn-primary={role === 'lender'}
					onclick={() => (role = 'lender')}
					data-testid="credit-role-lender">{$t('credit.role_lender')}</button
				>
				<button
					type="button"
					class="btn btn-sm"
					class:btn-primary={role === 'hirer'}
					onclick={() => (role = 'hirer')}
					data-testid="credit-role-hirer">{$t('credit.role_hirer')}</button
				>
			</div>
		{/if}

		{#if errorMessage}
			<p class="text-error text-sm" role="alert" data-testid="credit-error">{errorMessage}</p>
		{/if}

		<div class="flex flex-col gap-2">
			{#if mode === 'offers' || role === 'lender'}
				{#if desk.advance?.status === 'requested'}
					<button
						type="button"
						class="btn btn-primary"
						disabled={pending}
						onclick={() => run((current) => deskOffer(current, nowSec()))}
						data-testid="credit-offer">{$t('credit.offer')}</button
					>
				{/if}
			{/if}
			{#if mode === 'desk' && role === 'worker'}
				<label class="label cursor-pointer justify-start gap-3">
					<input
						type="checkbox"
						class="checkbox"
						checked={desk.useNewcomer}
						onchange={(event) =>
							commitCreditDesk(deskSetNewcomer(desk, event.currentTarget.checked))}
						data-testid="credit-newcomer"
					/>
					<span>{$t('credit.newcomer')}</span>
				</label>
				{#if !desk.advance || desk.advance.status === 'cancelled'}
					<button
						type="button"
						class="btn btn-outline"
						disabled={pending || desk.escrow.confirmations >= 1}
						onclick={() => run((current) => deskConfirmEscrow(current, nowSec()))}
						data-testid="credit-confirm-escrow">{$t('credit.confirm_escrow')}</button
					>
					<button
						type="button"
						class="btn btn-primary"
						disabled={pending}
						onclick={() => run((current) => deskRequest(current, nowSec()))}
						data-testid="credit-request">{$t('credit.request')}</button
					>
				{/if}
				{#if desk.advance?.status === 'offered'}
					<button
						type="button"
						class="btn btn-primary"
						disabled={pending}
						onclick={() => run((current) => deskAccept(current, nowSec()))}
						data-testid="credit-accept">{$t('credit.accept')}</button
					>
				{/if}
			{/if}
			{#if mode === 'desk' && role === 'lender' && desk.advance?.status === 'accepted' && !desk.advance.fundingTxid}
				<button
					type="button"
					class="btn btn-primary"
					disabled={pending}
					onclick={() => run((current) => deskFund(current, nowSec()))}
					data-testid="credit-fund">{$t('credit.fund')}</button
				>
			{/if}
			{#if mode === 'desk' && role === 'lender' && status === 'waiting-for-confirmation'}
				<button
					type="button"
					class="btn btn-primary"
					disabled={pending}
					onclick={() => run((current) => deskConfirmFunding(current, nowSec()))}
					data-testid="credit-confirm-funding">{$t('credit.confirm_funding')}</button
				>
			{/if}
			{#if mode === 'desk' && role === 'hirer' && desk.advance?.status === 'funded'}
				<button
					type="button"
					class="btn btn-primary"
					disabled={pending}
					onclick={() => run((current) => deskComplete(current, nowSec()))}
					data-testid="credit-complete">{$t('credit.complete')}</button
				>
				<button
					type="button"
					class="btn btn-outline"
					disabled={pending}
					onclick={() => run((current) => deskCancelJob(current, nowSec()))}
					data-testid="credit-cancel">{$t('credit.cancel_job')}</button
				>
			{/if}
			{#if mode === 'desk' && desk.advance && ['requested', 'offered', 'accepted'].includes(desk.advance.status) && !desk.advance.fundingTxid}
				<button
					type="button"
					class="btn btn-ghost"
					disabled={pending}
					onclick={() => run((current) => deskCancelOpen(current, nowSec()))}
					data-testid="credit-cancel-open">{$t('credit.cancel_open')}</button
				>
			{/if}
			<button
				type="button"
				class="btn btn-ghost"
				disabled={pending}
				onclick={() => {
					errorMessage = '';
					resetCreditDesk();
				}}
				data-testid="credit-reset">{$t('credit.reset')}</button
			>
		</div>

		{#if desk.split}
			<div class="card bg-base-100 border-base-300 border shadow-sm" data-testid="credit-split">
				<div class="card-body gap-1 p-5 text-sm">
					<p data-testid="credit-lender-received">
						{$t('credit.lender_received', { values: { amount: formatCents(lines.lender) } })}
					</p>
					<p data-testid="credit-worker-received">
						{$t('credit.worker_received', { values: { amount: formatCents(lines.worker) } })}
					</p>
					<p data-testid="credit-hirer-refund">
						{$t('credit.hirer_refund', { values: { amount: formatCents(lines.hirer) } })}
					</p>
					<p data-testid="credit-sum">
						{$t('credit.sum', { values: { amount: formatCents(lines.sum) } })}
					</p>
					{#if desk.lenderLossCents > 0}
						<p data-testid="credit-loss">
							{$t('credit.loss', { values: { amount: formatCents(desk.lenderLossCents) } })}
						</p>
					{/if}
					<p>{$t('credit.net_note')}</p>
				</div>
			</div>
		{/if}
	{/if}
</section>
