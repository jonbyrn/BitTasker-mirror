<script lang="ts">
	import type { PortfolioItem, NostrProfileImage, Skill } from '$lib/types/profile.d';
	import { onDestroy, onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { appStore } from '$lib/stores/app.store';
	import {
		publishPortfolioItem,
		deletePortfolioItem,
		subscribeToProfileUpdates
	} from '$lib/nostr/profile';
	import Uploader from '$lib/components/Uploader.svelte';
	import uploadService from '$lib/api/services/upload.service';
	import SkillsMultiselect from '$lib/components/SkillsMultiselect.svelte';
	import DateInput from '$lib/components/date/DateInput.svelte';
	import KINDS from '$lib/utils/constants/kinds';

	let { onComplete, onSave } = $props<{
		onComplete: (completed: boolean) => void;
		onSave?: () => void;
	}>();

	// Local state
	let portfolioItems = $state<PortfolioItem[]>([]);
	let title = $state('');
	let description = $state('');
	let completionDate = $state('');
	let projectLink = $state('');
	let selectedSkills = $state<string[]>([]);
	let images = $state<(NostrProfileImage | File)[]>([]);
	let isLoading = $state(false);
	let error = $state('');
	let editingItem = $state<PortfolioItem | null>(null);
	let addingItem = $state(false);
	let successMessage = $state('');
	let skills = $state<Skill[]>([]);
	let isRemovingItem = $state<string | null>(null);
	let portfolioForm = $state<HTMLDivElement | null>(null);
	let isInitialLoading = $state(false);
	// Estado para el carrusel de imágenes de cada proyecto
	let projectImageSlides = $state<Record<string, number>>({});

	// Subscribe to portfolio and skills updates
	let unsubscribePortfolio: (() => void) | undefined;
	let unsubscribeSkills: (() => void) | undefined;
	let cleanup: (() => void) | null = null;

	let isFormOpen = $derived(addingItem || editingItem);

	onMount(async () => {
		cleanup = await subscribeToProfileUpdates(
			async (event) => {
				try {
					isInitialLoading = true;
					if (event.kind === KINDS.PROFILE_PORTFOLIO) {
						const item = JSON.parse(event.content);
						const identifier = event.tags[0][1];
						if (!portfolioItems.some((item) => item?.tags?.[0]?.[1] === identifier)) {
							// add new item
							portfolioItems.push({ id: event.id, ...item, tags: event.tags });
						} else {
							// update the item
							const index = portfolioItems.findIndex((item) => item?.tags?.[0]?.[1] === identifier);
							if (index !== -1) {
								portfolioItems[index] = { id: event.id, ...item, tags: event.tags };
							}
						}
					} else if (event.kind === KINDS.PROFILE_SKILLS) {
						skills = JSON.parse(event.content);
					}
				} catch (err) {
					console.error('Failed to subscribe to portfolio updates:', err);
				} finally {
					isInitialLoading = false;
				}
			},
			{
				30001: null,
				30000: { d: 'skills' }
			}
		);
	});

	onDestroy(() => {
		if (cleanup) cleanup();
		if (unsubscribePortfolio) unsubscribePortfolio();
		if (unsubscribeSkills) unsubscribeSkills();
	});

	// Handle image upload
	async function handleImageUpload(files: File[]) {
		// Filter out files that are already in the images array
		const newFiles = files.filter((file) => {
			if (!images.includes(file)) {
				return file instanceof File;
			}
			return false;
		});

		// Add only new files to the images array
		if (newFiles.length > 0) {
			images = [...images, ...newFiles];
		}
	}

	function handleImageRemove(index: number) {
		images = images.filter((_, i) => i !== index);
	}

	const uploadImages = async (pictures: (NostrProfileImage | File)[]) => {
		const uploadPromises = pictures?.map(async (picture, index) => {
			if (picture instanceof File) {
				const uploadResult = await uploadService.uploadSingleFile(picture, {
					folder: 'portfolio',
					useCloudflare: true,
					enableCompression: true,
					generateVariants: true,
					metadata: {
						uploadedAt: new Date().toISOString()
					}
				});
				return {
					key: uploadResult.key,
					url: uploadResult.url,
					type: picture.type,
					alt: picture.name,
					isPrimary: index === 0
				};
			} else {
				return picture;
			}
		});

		return Promise.all(uploadPromises);
	};

	// Add or update portfolio item
	async function handleSubmit() {
		if (!title || !description || !completionDate || images.length === 0) {
			error = $t('profile.portfolio.please_fill_required');
			return;
		}

		try {
			isLoading = true;
			error = '';

			const uploadedImages = await uploadImages(images);

			const item: PortfolioItem = {
				link: projectLink.trim(),
				title,
				description,
				completionDate,
				skills: selectedSkills,
				images: uploadedImages,
				...(projectLink.trim() && { link: projectLink.trim() })
			};

			let tags = [];
			if (editingItem?.tags) {
				tags = editingItem.tags;
			} else {
				tags = [
					['d', `portfolio-${Math.random().toString(36).substring(2)}`], // Generate unique d tag for each portfolio item
					...item.skills.map((skill) => ['t', skill])
				];
			}

			await publishPortfolioItem(item, tags);

			// Call onSave callback if provided (only when actually saved)
			if (onSave) {
				onSave();
			}

			// Show success message
			successMessage = editingItem
				? $t('profile.portfolio.item_updated_success')
				: $t('profile.portfolio.item_added_success');

			setTimeout(() => (successMessage = ''), 2000);

			// Reset form
			resetForm();
		} catch (err) {
			console.error('Failed to save portfolio item:', err);
			error = err instanceof Error ? err.message : $t('profile.portfolio.failed_to_save');
		} finally {
			isLoading = false;
		}
	}

	// Remove portfolio item
	async function removePortfolioItem(item: PortfolioItem) {
		try {
			isRemovingItem = item.id || null;
			error = '';

			if (item.id) {
				await deletePortfolioItem(item.id);
				portfolioItems = portfolioItems.filter((i) => i.id !== item.id);
				appStore.showSuccessToast($t('profile.portfolio.item_deleted_success'));
			} else {
				appStore.showErrorToast($t('profile.portfolio.item_not_found'));
			}
		} catch (err) {
			console.error('Failed to remove portfolio item:', err);
			error = err instanceof Error ? err.message : $t('profile.portfolio.failed_to_remove');
		} finally {
			isRemovingItem = null;
		}
	}

	// Edit portfolio item
	function editItem(item: PortfolioItem) {
		editingItem = item;
		title = item.title;
		description = item.description;
		completionDate = item.completionDate;
		projectLink = item?.link || '';
		selectedSkills = [...item.skills];
		images = [...item.images];
	}

	// Reset form
	function resetForm() {
		addingItem = false;
		editingItem = null;
		title = '';
		description = '';
		completionDate = '';
		projectLink = '';
		selectedSkills = [];
		images = [];
		error = '';
	}

	// Funciones para el carrusel de imágenes de cada proyecto
	function nextProjectImage(itemId: string, totalImages: number) {
		if (totalImages > 1) {
			const currentIndex = projectImageSlides[itemId] || 0;
			const nextIndex = (currentIndex + 1) % totalImages;
			projectImageSlides[itemId] = nextIndex;
			projectImageSlides = { ...projectImageSlides };
		}
	}

	function prevProjectImage(itemId: string, totalImages: number) {
		if (totalImages > 1) {
			const currentIndex = projectImageSlides[itemId] || 0;
			const prevIndex = (currentIndex - 1 + totalImages) % totalImages;
			projectImageSlides[itemId] = prevIndex;
			projectImageSlides = { ...projectImageSlides };
		}
	}

	function goToProjectImage(itemId: string, imageIndex: number) {
		projectImageSlides[itemId] = imageIndex;
		projectImageSlides = { ...projectImageSlides };
	}

	// Track form completion
	$effect(() => {
		const isComplete = portfolioItems.length > 0;
		onComplete(isComplete);
	});
</script>

{#if isInitialLoading}
	<div class="space-y-8">
		<!-- Portfolio Items Skeleton -->
		<div class="grid gap-6 md:grid-cols-2">
			{#each Array(2) as _}
				<div class="card bg-base-200 border-base-200 rounded-xl border shadow-lg">
					<div class="bg-base-300 h-48 w-full animate-pulse"></div>
					<div class="card-body">
						<div class="bg-base-300 h-6 w-48 animate-pulse rounded"></div>
						<div class="bg-base-300 mt-2 h-16 w-full animate-pulse rounded"></div>

						<div class="mt-4 flex flex-wrap gap-2">
							{#each Array(3) as _}
								<div class="bg-base-300 h-6 w-24 animate-pulse rounded-full"></div>
							{/each}
						</div>

						<div class="card-actions mt-4 justify-end">
							<div class="bg-base-300 h-8 w-20 animate-pulse rounded"></div>
							<div class="bg-base-300 h-8 w-20 animate-pulse rounded"></div>
						</div>
					</div>
				</div>
			{/each}
		</div>

		<!-- Add Project Button Skeleton -->
		<div class="flex justify-end">
			<div class="bg-base-300 h-8 w-32 animate-pulse rounded"></div>
		</div>
	</div>
{:else}
	<div class="space-y-8" bind:this={portfolioForm}>
		<!-- Portfolio Items -->
		{#if portfolioItems.length > 0}
			<div class="grid gap-6 md:grid-cols-2">
				{#each portfolioItems as item}
					<div class="card bg-base-200 border-base-200 rounded-xl border shadow-lg">
						<figure class="relative">
							{#if item.images && item.images.length > 0}
								{@const itemId = item.id || item.tags?.[0]?.[1] || 'unknown'}
								{@const currentImageIndex = projectImageSlides[itemId] || 0}
								{@const totalImages = item.images.length}
								{@const hasMultipleImages = totalImages > 1}
								
								<!-- Carrusel de imágenes del proyecto -->
								<div class="relative overflow-hidden">
									<div
										class="flex transition-transform duration-500 ease-in-out"
										style="transform: translateX(-{currentImageIndex * 100}%)"
									>
										{#each item.images as image, imgIndex}
											<div class="w-full shrink-0">
												<img
													src={image.url}
													alt={image.alt || `${item.title} - ${imgIndex + 1}`}
													class="h-48 w-full object-cover"
												/>
											</div>
										{/each}
									</div>
									
									<!-- Controles de navegación de imágenes (solo si hay más de una) -->
									{#if hasMultipleImages}
										<!-- Botón anterior -->
										<button
											onclick={() => prevProjectImage(itemId, totalImages)}
											class="absolute left-4 top-1/2 -translate-y-1/2 btn btn-circle bg-black/80 hover:bg-black border-2 border-white/50 text-white shadow-xl z-20 backdrop-blur-sm"
											aria-label="Previous image"
										>
											<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
												<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
											</svg>
										</button>
										
										<!-- Botón siguiente -->
										<button
											onclick={() => nextProjectImage(itemId, totalImages)}
											class="absolute right-4 top-1/2 -translate-y-1/2 btn btn-circle bg-black/80 hover:bg-black border-2 border-white/50 text-white shadow-xl z-20 backdrop-blur-sm"
											aria-label="Next image"
										>
											<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
												<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
											</svg>
										</button>
										
										<!-- Indicadores de imágenes -->
										<div class="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1 z-20">
											{#each item.images as _, imgIndex}
												<button
													onclick={() => goToProjectImage(itemId, imgIndex)}
													class="h-2 w-2 rounded-full transition-all duration-300 {currentImageIndex === imgIndex
														? 'bg-white w-6'
														: 'bg-white/50'}"
													aria-label="Go to image {imgIndex + 1}"
												></button>
											{/each}
										</div>
									{/if}
								</div>
							{:else}
								<div class="bg-base-300 flex h-48 w-full items-center justify-center">
									<span class="text-base-content/60">{$t('common.profile.no_image_available')}</span>
								</div>
							{/if}
						</figure>
						<div class="card-body">
							<h2 class="card-title">{item.title}</h2>
							<p class="text-base-content/70 line-clamp-4">{item.description}</p>

							{#if item.skills && item.skills.length > 0}
								<div class="mt-4 flex flex-wrap gap-2">
									{#each item.skills as skill}
										{@const skillName = skills.find((s) => s.id === skill || s.name === skill)?.name || skill}
										<span class="badge badge-primary badge-outline">
											{skillName}
										</span>
									{/each}
								</div>
							{/if}

							<div class="card-actions mt-4 justify-end">
								<button
									class="btn btn-ghost btn-outline btn-sm"
									onclick={() => {
										editItem(item);
										portfolioForm?.scrollIntoView({ behavior: 'smooth' });
									}}
								>
									{$t('common.edit')}
								</button>
								<button
									class="btn btn-error btn-sm min-w-20"
									onclick={() => removePortfolioItem(item)}
								>
									{#if isRemovingItem === item.id}
										<span class="loading loading-spinner loading-xs"></span>
									{:else}
										{$t('common.remove')}
									{/if}
								</button>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<div class="alert alert-outline">
				<span>{$t('profile.portfolio.no_items')}</span>
			</div>
		{/if}

		<button
			aria-label={$t('profile.portfolio.add_project')}
			class="btn btn-primary btn-sm flex items-center justify-evenly place-self-end whitespace-nowrap"
			onclick={() => (addingItem = !addingItem)}
		>
			<span class="text-black">{$t('profile.portfolio.add_project')}</span>
			<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24">
				<g
					fill="none"
					stroke="#000"
					stroke-dasharray="16"
					stroke-dashoffset="16"
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
				>
					<path d="M5 12h14">
						<animate fill="freeze" attributeName="stroke-dashoffset" dur="0.4s" values="16;0" />
					</path>
					{#if !addingItem}
						<path d="M12 5v14">
							<animate
								fill="freeze"
								attributeName="stroke-dashoffset"
								begin="0.4s"
								dur="0.4s"
								values="16;0"
							/>
						</path>
					{/if}
				</g>
			</svg>
		</button>

		<!-- Portfolio Form -->
		{#if isFormOpen}
			<div class="card border-base-300 rounded-xl border p-4">
				<h3 class="mb-4 text-lg font-medium">
					{editingItem ? $t('profile.portfolio.edit_project') : $t('profile.portfolio.add_project')}
				</h3>

				<div class="space-y-4">
					<!-- Title -->
					<div class="form-control">
						<label class="label" for="title">
							<span class="label-text font-medium">{$t('profile.portfolio.project_title')}</span>
							<span class="label-text-alt">{$t('common.required')}</span>
						</label>
						<input
							type="text"
							id="title"
							bind:value={title}
							class="input input-bordered w-full"
							placeholder={$t('profile.portfolio.project_title_placeholder')}
							required
						/>
					</div>

					<!-- Description -->
					<div class="form-control">
						<label class="label block" for="description">
							<span class="label-text font-medium">{$t('profile.portfolio.description')}</span>
							<span class="label-text-alt">{$t('common.required')}</span>
						</label>
						<textarea
							id="description"
							bind:value={description}
							class="textarea textarea-bordered h-32 w-full rounded-xl"
							placeholder={$t('profile.portfolio.description_placeholder')}
							required
						></textarea>
					</div>

					<!-- Completion Date -->
					<div class="form-control">
						<DateInput
							value={completionDate ? new Date(completionDate) : null}
							onChange={(date: Date | null) => (completionDate = date ? date.toISOString() : '')}
							type="single"
							labelKey="profile.portfolio.completion_date"
							placeholderKey="airdatepicker.select_date"
							required
							minDate={new Date()}
							maxDate={undefined}
						/>
					</div>

					<!-- Project Link -->
					<div class="form-control">
						<label class="label" for="projectLink">
							<span class="label-text font-medium">{$t('profile.portfolio.project_link')}</span>
							<span class="label-text-alt">{$t('common.optional')}</span>
						</label>
						<input
							type="url"
							id="projectLink"
							bind:value={projectLink}
							class="input input-bordered w-full"
							placeholder={$t('profile.portfolio.project_link_placeholder')}
						/>
					</div>

					<!-- Skills Used -->
					<div class="form-control">
						<label class="label" for="skills">
							<span class="label-text font-medium">{$t('profile.portfolio.skills_used')}</span>
						</label>

						<SkillsMultiselect
							bind:selectedSkills={selectedSkills}
							maxSelections={10}
							placeholder={$t('profile.portfolio.skills_used')}
							className="w-full"
						/>
					</div>

					<!-- Images -->
					<div class="form-control space-y-2">
						<div>
							<span class="text-base-content/80 block font-medium"
								>{$t('profile.portfolio.images')}</span
							>
							<span class="text-base-content/70 block">{$t('profile.portfolio.images_desc')}</span>
						</div>

						<Uploader
							id="portfolioImages"
							label={$t('profile.portfolio.add_images')}
							maxFiles={5}
							files={images?.map((img) => (img instanceof File ? img : img.url))}
							onChange={handleImageUpload}
							onRemove={handleImageRemove}
						/>
					</div>

					<!-- Error Message -->
					{#if error}
						<div class="alert alert-outline alert-error">
							<span>{error}</span>
						</div>
					{/if}

					<!-- Success Message -->
					{#if successMessage}
						<div class="alert alert-outline alert-success">
							<span>{successMessage}</span>
						</div>
					{/if}

					<!-- Form Actions -->
					<div class="flex justify-end gap-2">
					
						{#if editingItem}
							<button class="btn btn-ghost btn-outline" onclick={resetForm}>
								{$t('common.cancel')}
							</button>
						{/if}
						<button class="btn btn-primary" onclick={handleSubmit} disabled={isLoading}>
							{#if isLoading}
								<span class="loading loading-spinner"></span>
							{/if}
							{editingItem ? $t('common.update') : $t('common.add')}
						</button>
					</div>
				</div>
			</div>
		{/if}
	</div>
{/if}
