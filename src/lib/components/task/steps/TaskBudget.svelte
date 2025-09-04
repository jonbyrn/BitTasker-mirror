<script lang="ts">
	import { onMount } from 'svelte';
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import MediaUploader from '$lib/components/MediaUploader.svelte';
	import type { UploadResult } from '$lib/api/services/upload.service';
	import type { Attachment } from '$lib/types/task';
	import { BudgetTypeEnum } from '$lib/utils/enums/task.enum';
	import { taskStore as store } from '$lib/stores/task.store';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import { formatNumberForInput, SATS_PER_BTC } from '$lib/utils/helpers/crypto';
	import { t } from 'svelte-i18n';


	// BTC to USD conversion state
	let usdAmount = $state<number>(0);
	let btcPrice = $state<number>(100000); // Default fallback price

	async function fetchBtcPrice(): Promise<void> {
		try {
			btcPrice = await cryptoPriceService.getCurrentPrice('BTC');

			// Si ya existe un valor en amount, interpretarlo según la moneda
			if ($store.task.budget.amount) {
				if ($store.task.budget.currency === 'USD') {
					// Si la moneda es USD, el amount ya es USD
					usdAmount = $store.task.budget.amount;
				} else {
					// Si la moneda es SATS, convertir a USD
					usdAmount = ($store.task.budget.amount / SATS_PER_BTC) * btcPrice;
					// Actualizar la moneda a USD y el amount a USD
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
		let input = cleanInput((event.target as HTMLInputElement).value);
		(event.target as HTMLInputElement).value = input;

		const usdValue = parseFloat(input.replace(/,/g, ''));
		if (!isNaN(usdValue)) {
			// Guardar directamente el valor USD en amount
			store.updateTask({
				budget: { 
					...$store.task.budget, 
					amount: usdValue,
					currency: 'USD' // Asegurar que la moneda sea USD
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

	function cleanInput(value: string): string {
		// Solo permite dígitos, comas y punto
		return value.replace(/[^0-9.,]/g, '');
	}

	let {
		errors,
		direction,
		newFiles = $bindable(),
		attachmentsToRemove = $bindable()
	} = $props<{
		errors: Record<string, string>;
		direction: 'forward' | 'backward';
		newFiles: File[];
		attachmentsToRemove: Attachment[];
	}>();

	// Handle file upload results from MediaUploader
	const handleUploadResults = (results: UploadResult[]) => {
		// Convert UploadResult to Attachment format
		const attachments: Attachment[] = results.map(result => ({
			key: result.key,
			url: result.url,
			type: result.type === 'image' ? 'image/*' : result.type === 'video' ? 'video/*' : 'document',
			alt: result.key, // Use key as alt for now
			cloudflareId: result.cloudflareId,
			variants: result.variants
		}));

		// Add to existing attachments
		$store.task.attachments = [...($store.task.attachments || []), ...attachments];
		
		// Clear newFiles since they've been uploaded
		newFiles = [];
	};

	// Handle file removal for both new and existing files
	const handleFileRemove = (index: number, file?: File | string | UploadResult) => {
		if (typeof file === 'string') {
			// Find the attachment to remove and schedule it for deletion
			const attachment = $store.task.attachments?.find((att) => att.url === file);
			if (attachment) {
				attachmentsToRemove = [...attachmentsToRemove, attachment];
				// Remove from store
				const attachmentIndex = $store.task.attachments?.findIndex((att) => att.url === file);
				if (attachmentIndex !== undefined && attachmentIndex >= 0) {
					$store.task.attachments?.splice(attachmentIndex, 1);
				}
			}
		} else if (file instanceof File) {
			// Remove from new files
			const newFileIndex = newFiles.findIndex((f: File) => f === file);
			if (newFileIndex >= 0) {
				newFiles.splice(newFileIndex, 1);
				newFiles = [...newFiles]; // Trigger reactivity
			}
		} else if (file && typeof file === 'object' && 'key' in file) {
			// UploadResult - find in attachments and remove
			const attachment = $store.task.attachments?.find((att) => att.key === file.key);
			if (attachment) {
				attachmentsToRemove = [...attachmentsToRemove, attachment];
				const attachmentIndex = $store.task.attachments?.findIndex((att) => att.key === file.key);
				if (attachmentIndex !== undefined && attachmentIndex >= 0) {
					$store.task.attachments?.splice(attachmentIndex, 1);
				}
			}
		} else {
			// Fallback: remove by index from attachments
			if ($store.task.attachments && index < $store.task.attachments.length) {
				const attachment = $store.task.attachments[index];
				attachmentsToRemove = [...attachmentsToRemove, attachment];
				$store.task.attachments.splice(index, 1);
			}
		}
	};

	// Combine saved attachments (as URLs) with new files for the Uploader
	let uploaderFiles = $derived(
		(() => {
			const savedAttachments = $store.task.attachments?.map((file) => file.url) || [];
			return [...savedAttachments, ...newFiles];
		})()
	);

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

	<div class="flex gap-4">
		<button
			class="btn {$store.task.budget.type === BudgetTypeEnum.FIXED ? 'btn-primary' : 'btn-outline'}"
			onclick={() =>
				store.updateTask({ budget: { ...$store.task.budget, type: BudgetTypeEnum.FIXED } })}
		>
			{$t('task.budget_fixed')}
		</button>
		<button
			class="btn {$store.task.budget.type === BudgetTypeEnum.HOURLY
				? 'btn-primary'
				: 'btn-outline'}"
			onclick={() =>
				store.updateTask({ budget: { ...$store.task.budget, type: BudgetTypeEnum.HOURLY } })}
		>
			{$t('task.budget_hourly')}
		</button>
	</div>

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
					onchange={handleUsdChange}
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
					value={formatNumberForInput(Math.round((usdAmount / btcPrice) * SATS_PER_BTC))}
					class="input input-bordered w-full pr-12 {errors.budget ? 'input-error' : ''}"
					placeholder={$t('task.sats_placeholder')}
					min="0"
					readonly
				/>
			</div>
		</div>
		{#if errors.budget}
			<span class="label-text-alt text-error">{errors.budget}</span>
		{/if}
		{#if usdAmount > 0}
			<span class="label-text-alt text-info mt-1 block"
				>{$t('task.btc_price')} ${btcPrice.toLocaleString()}</span
			>
		{/if}
	</div>

	{#if $store.task.budget.type === BudgetTypeEnum.HOURLY}
		<div class="w-full">
			<label for="estimatedHours" class="label">
				<span class="label-text">{$t('task.estimated_hours')}</span>
			</label>
			<input
				type="number"
				id="estimatedHours"
				value={$store.task.budget.estimatedHours}
				onchange={(e) => {
					store.updateTask({
						budget: {
							...$store.task.budget,
							estimatedHours: parseInt((e.target as HTMLInputElement).value)
						}
					});
				}}
				class="input input-bordered w-full"
				placeholder={$t('task.hours_placeholder')}
				min="1"
			/>
			{#if errors.estimatedHours}
				<span class="label-text-alt text-error">{errors.estimatedHours}</span>
			{/if}
		</div>
	{/if}

	<div class="w-full">
		<label for="description">
			<span class="label">{$t('task.description')}</span>
			<textarea
				id="description"
				value={$store.task.description}
				onchange={(e) => {
					store.updateTask({ description: (e.target as HTMLTextAreaElement).value });
				}}
				class="textarea textarea-bordered h-32 w-full rounded-xl {errors.description
					? 'textarea-error'
					: ''}"
				placeholder={$t('task.description_placeholder')}
			></textarea>
		</label>
		{#if errors.description}
			<span class="label-text-alt text-error">{errors.description}</span>
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
			id="attachments"
			label={$t('task.attachments')}
			allowedTypes={['image/*', 'video/*']}
			files={uploaderFiles}
			maxFiles={5}
			maxFileSize={200}
			maxDuration={30}
			className="w-full h-full min-h-28"
			enableImageCompression={true}
			compressionQuality={0.8}
			maxImageDimension={3840}
			showCompressionInfo={true}
			useCloudflare={true}
			generateVariants={true}
			uploadFolder="tasks"
			onChange={handleUploadResults}
			onRemove={handleFileRemove}
		/>
	</div>

</div>
