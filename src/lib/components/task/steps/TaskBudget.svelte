<script lang="ts">
	import type { Attachment } from '$lib/types/task';
	import { onMount } from 'svelte';
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { taskStore as store } from '$lib/stores/task.store';
	import { formatNumberForInput, SATS_PER_BTC } from '$lib/utils/helpers/crypto';
	import { t } from 'svelte-i18n';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import MediaUploader from '$lib/components/MediaUploader.svelte';
	import type { UploadResult } from '$lib/api/services/upload.service';

	// BTC to USD conversion state
	let usdAmount = $state<number>(0);
	let btcPrice = $state<number>(0);

	// Reactive calculation of sats from usdAmount and btcPrice
	let sats = $derived(
		formatNumberForInput(btcPrice > 0 ? Math.round((usdAmount / btcPrice) * SATS_PER_BTC) : 0)
	);

	async function fetchBtcPrice(): Promise<void> {
		try {
			btcPrice = await cryptoPriceService.getCurrentPrice('BTC');

			// Si ya existe un valor en amount, interpretarlo según la moneda
			if ($store.task.budget.amount) {
				if ($store.task.budget.currency === 'USD') {
					usdAmount = $store.task.budget.amount;
				} else {
					usdAmount = ($store.task.budget.amount / SATS_PER_BTC) * btcPrice;
					store.updateTask({
						budget: {
							...$store.task.budget,
							currency: 'USD',
							amount: usdAmount
						}
					});
				}
			}
		} catch (error) {
			console.error('Error fetching BTC price:', error);
		}
	}

	function handleUsdChange(event: Event) {
		const rawValue = (event.target as HTMLInputElement).value;
		const input = cleanInput(rawValue);
		
		// Remove leading zeros (but keep single zero if that's all there is)
		let cleanedInput = input.replace(/,/g, '');
		// Remove leading zeros, but allow "0" or "0." or "0.5" etc.
		if (cleanedInput.length > 1 && cleanedInput.startsWith('0') && cleanedInput[1] !== '.') {
			cleanedInput = cleanedInput.replace(/^0+/, '') || '0';
		}
		
		const usdValue = parseFloat(cleanedInput);

		if (!isNaN(usdValue)) {
			store.updateTask({
				budget: {
					...$store.task.budget,
					amount: usdValue,
					currency: 'USD'
				}
			});
			usdAmount = usdValue;
		} else {
			store.updateTask({
				budget: {
					...$store.task.budget,
					amount: 0,
					currency: 'USD'
				}
			});
			usdAmount = 0;
		}
	}

	function handleSatsChange(event: Event) {
		const rawValue = (event.target as HTMLInputElement).value;
		const input = cleanInput(rawValue);
		
		// Remove leading zeros (but keep single zero if that's all there is)
		let cleanedInput = input.replace(/,/g, '');
		// Remove leading zeros, but allow "0"
		if (cleanedInput.length > 1 && cleanedInput.startsWith('0')) {
			cleanedInput = cleanedInput.replace(/^0+/, '') || '0';
		}
		
		const satsValue = parseInt(cleanedInput, 10);

		if (!isNaN(satsValue) && btcPrice > 0) {
			// Convert sats to USD
			const usdValue = (satsValue / SATS_PER_BTC) * btcPrice;
			store.updateTask({
				budget: {
					...$store.task.budget,
					amount: usdValue,
					currency: 'USD'
				}
			});
			usdAmount = usdValue;
		} else if (!isNaN(satsValue) && satsValue === 0) {
			store.updateTask({
				budget: {
					...$store.task.budget,
					amount: 0,
					currency: 'USD'
				}
			});
			usdAmount = 0;
		}
	}

	function cleanInput(value: string): string {
		return value.replace(/[^0-9.,]/g, '');
	}

	let {
		errors,
		direction,
		attachmentsToRemove = $bindable()
	} = $props<{
		errors: Record<string, string>;
		direction: 'forward' | 'backward';
		attachmentsToRemove: Attachment[];
	}>();

	// Reactive validation for description - clears error when requirement is met
	// This validates in real-time as the user types
	let descriptionError = $derived.by(() => {
		const description = $store.task.description?.trim() || '';
		
		// Only validate if there was an error before (from errors prop) or if user has started typing
		// This prevents showing errors before the user has interacted with the field
		if (errors.description || description.length > 0) {
			if (!description) {
				return $t('task.errors.description_required');
			}
			if (description.length < 20) {
				return $t('task.errors.description_min_length');
			}
			// If description meets requirement, return empty string to clear error
			return '';
		}
		return '';
	});

	function uploadResultToAttachment(result: UploadResult): Attachment {
		return {
			key: result.key,
			url: result.url,
			type: result.type === 'image' ? 'image/*' : result.type === 'video' ? 'video/*' : 'document',
			alt: result.key,
			size: result.size
		};
	}

	function handleFileUpload(results: UploadResult[]) {
		const newAttachments = results.map(uploadResultToAttachment);
		store.updateTask({
			attachments: [...($store.task.attachments || []), ...newAttachments]
		});
	}

	function handleFileRemove(index: number, _file: unknown) {
		const attachments = $store.task.attachments || [];
		const attachment = attachments[index];
		if (attachment) {
			attachmentsToRemove = [...attachmentsToRemove, attachment];
			store.updateTask({
				attachments: attachments.filter((_, i) => i !== index)
			});
		}
	}

	/** Returns current attachments (MediaUploader uploads immediately, so no pending upload needed) */
	async function uploadPendingFiles(): Promise<Attachment[]> {
		return [...($store.task.attachments || [])];
	}

	export { uploadPendingFiles };

	let attachmentFiles = $derived(($store.task.attachments || []).map((a) => a.url));

	// Sync usdAmount with store when component loads
	$effect(() => {
		if ($store.task.budget.amount) {
			usdAmount = $store.task.budget.amount;
		}
	});

	onMount(() => {
		fetchBtcPrice();
	});
</script>

<div
	class="space-y-4"
	in:fly={{
		duration: 200,
		easing: linear,
		y: 0,
		x: direction === 'forward' ? 20 : -20
	}}
>
	<h4 class="text-lg font-semibold">{$t('task.budget_question')}</h4>

	<div class="w-full">
		<label for="budget" class="label">
			<span class="label-text">{$t('task.budget_label')}</span>
		</label>
		<div class="flex gap-2">
			<div class="relative">
				<span class="text-base-content/70 absolute top-1/2 left-3 z-10 -translate-y-1/2"> $ </span>
				<input
					type="text"
					id="budget-usd"
					value={formatNumberForInput(usdAmount)}
					oninput={handleUsdChange}
					class="input input-bordered w-full pl-7 {errors.budget ? 'input-error' : ''}"
					placeholder={$t('task.usd_placeholder')}
					min="0"
				/>
			</div>
			<div class="relative">
				<span class="text-base-content/70 absolute top-1/2 right-3 z-10 -translate-y-1/2">
					Sats
				</span>
				<input
					type="text"
					id="budget-btc"
					value={sats}
					oninput={handleSatsChange}
					class="input input-bordered w-full pr-12 {errors.budget ? 'input-error' : ''}"
					placeholder={$t('task.sats_placeholder')}
					min="0"
				/>
			</div>
		</div>
		{#if errors.budget}
			<span class="label-text-alt text-error">{errors.budget}</span>
		{/if}
		<span class="label-text-alt mt-1 block text-white/70"
			>{$t('task.btc_price')} ${Math.round(btcPrice).toLocaleString()}</span
		>
	</div>

	<div class="w-full">
		<label for="description" class="label">
			<span class="label-text">{$t('task.description')}</span>
			{#if $store.task.description.length > 0}
				<span
					class="label-text-alt {$store.task.description.length >= 10000
						? 'text-warning'
						: 'text-base-content/60'}"
				>
					{$store.task.description.length}/10000 {$t('dashboard.bids.bid_creation.max')}
				</span>
			{/if}
		</label>
		<textarea
			id="description"
			value={$store.task.description}
			oninput={(e) => {
				store.updateTask({ description: (e.target as HTMLTextAreaElement).value });
			}}
			class="textarea textarea-bordered h-32 w-full rounded-xl {descriptionError
				? 'textarea-error'
				: ''}"
			placeholder={$t('task.description_placeholder')}
			maxlength="10000"
		></textarea>
		{#if descriptionError}
			<span class="label-text-alt text-error">{descriptionError}</span>
		{/if}
	</div>

	<div class="w-full">
		<div class="my-5">
			<label for="attachments" class="label block text-lg font-semibold text-white">
				{$t('task.attachments_label')}
			</label>
			<label for="attachments" class="label-text-alt block text-white/70">
				{$t('task.attachments_hint')}
			</label>
		</div>

		<MediaUploader
			id="task-attachments"
			label={$t('task.attachments')}
			maxFiles={5}
			maxFileSize={200}
			maxDuration={30}
			allowedTypes={['image/*', 'video/*']}
			enablePhotoMenu={true}
			uploadFolder="tasks"
			className="h-24 w-24 sm:h-28 sm:w-28 md:h-32 md:w-32"
			files={attachmentFiles}
			onChange={(results) => handleFileUpload(results)}
			onRemove={handleFileRemove}
		/>
	</div>
</div>
