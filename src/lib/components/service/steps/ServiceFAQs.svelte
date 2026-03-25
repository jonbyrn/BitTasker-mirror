<script lang="ts">
	import { onMount } from 'svelte';
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { serviceStore as store } from '$lib/stores/service.store';
	import type { ServiceFAQ } from '$lib/types/service.d';
	import { t } from 'svelte-i18n';

	let { errors, direction } = $props();

	const MAX_FAQS = 5;

	// Initialize FAQs if not set (run once on mount)
	onMount(() => {
		if (!$store.service.faqs) {
			store.updateService({
				faqs: []
			});
		}
	});

	// Add new FAQ (max MAX_FAQS)
	function addFAQ() {
		const currentFAQs = $store.service.faqs || [];
		if (currentFAQs.length >= MAX_FAQS) return;
		const newFAQ: ServiceFAQ = {
			id: crypto.randomUUID(),
			question: '',
			answer: ''
		};
		store.updateService({
			faqs: [...currentFAQs, newFAQ]
		});
	}

	// Remove FAQ
	function removeFAQ(faqId: string) {
		const currentFAQs = $store.service.faqs || [];
		store.updateService({
			faqs: currentFAQs.filter((f) => f.id !== faqId)
		});
	}

	// Update FAQ
	function updateFAQ(faqId: string, updates: Partial<ServiceFAQ>) {
		const currentFAQs = $store.service.faqs || [];
		store.updateService({
			faqs: currentFAQs.map((faq) => (faq.id === faqId ? { ...faq, ...updates } : faq))
		});
	}
</script>

<div
	class="min-w-0 space-y-6 overflow-x-clip"
	in:fly={{
		duration: 200,
		easing: linear,
		y: 0,
		x: direction === 'forward' ? 20 : -20
	}}
>
	<div class="w-full">
		<label class="label" for="faqs-title">
			<span class="label-text-alt break-words">{$t('dashboard.services.create.faqs.hint')}</span>
			<span class="label-text-alt ml-1 break-words"
				>({($store.service.faqs || []).length}/{MAX_FAQS}
				{$t('dashboard.services.create.faqs.max')})</span
			>
		</label>
	</div>

	{#if ($store.service.faqs || []).length === 0}
		<div class="alert alert-outline alert-info" id="faqs-empty-message">
			<span>{$t('dashboard.services.create.faqs.empty_message')}</span>
		</div>
	{/if}

	{#each $store.service.faqs || [] as faq (faq.id)}
		<div class="card bg-base-200 min-w-0 space-y-4 overflow-hidden p-4">
			<div class="flex min-w-0 items-center justify-between gap-3">
				<h4 class="min-w-0 font-semibold break-words">
					{$t('dashboard.services.create.faqs.faq')} #{($store.service.faqs || []).indexOf(faq) + 1}
				</h4>
				<button
					type="button"
					class="btn btn-sm btn-error"
					onclick={() => removeFAQ(faq.id)}
					title={$t('dashboard.services.create.faqs.remove')}
				>
					✕
				</button>
			</div>

			<!-- FAQ Question -->
			<div class="w-full">
				<label for="faq-question-{faq.id}" class="label" id="faq-question-label-{faq.id}">
					<span class="label-text">{$t('dashboard.services.create.faqs.question_label')}</span>
				</label>
				<input
					type="text"
					id="faq-question-{faq.id}"
					value={faq.question}
					onchange={(e) => updateFAQ(faq.id, { question: (e.target as HTMLInputElement).value })}
					class="input input-bordered w-full"
					placeholder={$t('dashboard.services.create.faqs.question_placeholder')}
				/>
			</div>

			<!-- FAQ Answer -->
			<div class="w-full">
				<label for="faq-answer-{faq.id}" class="label" id="faq-answer-label-{faq.id}">
					<span class="label-text">{$t('dashboard.services.create.faqs.answer_label')}</span>
				</label>
				<textarea
					id="faq-answer-{faq.id}"
					value={faq.answer}
					onchange={(e) => updateFAQ(faq.id, { answer: (e.target as HTMLTextAreaElement).value })}
					class="textarea textarea-bordered w-full"
					placeholder={$t('dashboard.services.create.faqs.answer_placeholder')}
					rows="4"
				></textarea>
			</div>
		</div>
	{/each}

	<!-- Add FAQ Button (disabled at max) -->
	<button
		class="btn btn-outline w-full"
		onclick={addFAQ}
		disabled={($store.service.faqs || []).length >= MAX_FAQS}
		title={($store.service.faqs || []).length >= MAX_FAQS
			? $t('dashboard.services.create.faqs.max_reached')
			: ''}
	>
		+ {$t('dashboard.services.create.faqs.add')}
	</button>
	{#if ($store.service.faqs || []).length >= MAX_FAQS}
		<p class="label-text-alt text-base-content/70">
			{$t('dashboard.services.create.faqs.max_reached')}
		</p>
	{/if}

	{#if errors.faqs}
		<span class="label-text-alt text-error block">{errors.faqs}</span>
	{/if}
</div>
