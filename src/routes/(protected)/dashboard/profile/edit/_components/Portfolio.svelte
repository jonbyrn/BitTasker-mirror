<script lang="ts">
	import type { PortfolioItem, NostrProfileImage, Skill } from '$lib/types/profile.d';
	import { onDestroy, onMount } from 'svelte';
	import { appStore } from '$lib/stores/app.store';
	import {
		publishPortfolioItem,
		deletePortfolioItem,
		subscribeToProfileUpdates
	} from '$lib/nostr/profile';
	import Uploader from '$lib/components/Uploader.svelte';
	import uploadService from '$lib/api/services/upload.service';
	import Tags from '$lib/components/Tags.svelte';
	import DatePicker from '$lib/components/date/DatePicker.svelte';

	let { onComplete } = $props<{
		onComplete: (completed: boolean) => void;
	}>();

	// Local state
	let portfolioItems = $state<PortfolioItem[]>([]);
	let title = $state('');
	let description = $state('');
	let completionDate = $state('');
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

	// Subscribe to portfolio and skills updates
	let unsubscribePortfolio: (() => void) | undefined;
	let unsubscribeSkills: (() => void) | undefined;
	let cleanup: (() => void) | null = null;

	let isFormOpen = $derived(addingItem || editingItem);

	onMount(async () => {
		cleanup = await subscribeToProfileUpdates(
			async (event) => {
				try {
					if (event.kind === 30001) {
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
					} else if (event.kind === 30000) {
						skills = JSON.parse(event.content);
					}
				} catch (err) {
					console.error('Failed to subscribe to portfolio updates:', err);
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
				const uploadResult = await uploadService.uploadSingleFile(picture, 'portfolio');
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
			error = 'Please fill in all required fields and add at least one image';
			return;
		}

		try {
			isLoading = true;
			error = '';

			const uploadedImages = await uploadImages(images);

			const item: PortfolioItem = {
				title,
				description,
				completionDate,
				skills: selectedSkills,
				images: uploadedImages
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

			// Show success message
			successMessage = editingItem
				? 'Portfolio item updated successfully!'
				: 'Portfolio item added successfully!';

			setTimeout(() => (successMessage = ''), 2000);

			// Reset form
			resetForm();
		} catch (err) {
			console.error('Failed to save portfolio item:', err);
			error = err instanceof Error ? err.message : 'Failed to save portfolio item';
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
				appStore.showSuccessToast('Portfolio item deleted successfully!');
			} else {
				appStore.showErrorToast('Portfolio item not found');
			}
		} catch (err) {
			console.error('Failed to remove portfolio item:', err);
			error = err instanceof Error ? err.message : 'Failed to remove portfolio item';
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
		selectedSkills = [];
		images = [];
		error = '';
	}

	// Track form completion
	$effect(() => {
		const isComplete = portfolioItems.length > 0;
		onComplete(isComplete);
	});
</script>

<div class="space-y-8" bind:this={portfolioForm}>
	<!-- Portfolio Items -->
	{#if portfolioItems.length > 0}
		<div class="grid gap-6 md:grid-cols-2">
			{#each portfolioItems as item}
				<div class="card bg-base-200 border-base-200 rounded-xl border shadow-lg">
					<figure>
						<img
							src={item.images.find((img) => img.isPrimary)?.url || item.images[0].url}
							alt={item.title}
							class="h-48 w-full object-cover"
						/>
					</figure>
					<div class="card-body">
						<h2 class="card-title">{item.title}</h2>
						<p class="text-base-content/70">{item.description}</p>

						{#if skills && skills.length > 0 && item.skills && item.skills.length > 0}
							<div class="mt-4 flex flex-wrap gap-2">
								{#each item.skills as skill}
									<span class="badge badge-primary badge-outline">
										{skills.find((s) => s.id === skill)?.name}
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
								Edit
							</button>
							<button
								class="btn btn-error btn-sm min-w-20"
								onclick={() => removePortfolioItem(item)}
							>
								{#if isRemovingItem === item.id}
									<span class="loading loading-spinner loading-xs"></span>
								{:else}
									Remove
								{/if}
							</button>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<div class="alert">
			<span>No portfolio items yet. Add some projects to showcase your work.</span>
		</div>
	{/if}

	<button
		aria-label="Add Portfolio Item"
		class="btn btn-primary btn-sm flex items-center justify-evenly place-self-end whitespace-nowrap"
		onclick={() => (addingItem = !addingItem)}
	>
		<span class="text-black">Add Project</span>
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
				{editingItem ? 'Edit Portfolio Item' : 'Add Portfolio Item'}
			</h3>

			<div class="space-y-4">
				<!-- Title -->
				<div class="form-control">
					<label class="label" for="title">
						<span class="label-text font-medium">Title</span>
						<span class="label-text-alt">Required</span>
					</label>
					<input
						type="text"
						id="title"
						bind:value={title}
						class="input input-bordered w-full"
						placeholder="Project title"
						required
					/>
				</div>

				<!-- Description -->
				<div class="form-control">
					<label class="label block" for="description">
						<span class="label-text font-medium">Description</span>
						<span class="label-text-alt">Required</span>
					</label>
					<textarea
						id="description"
						bind:value={description}
						class="textarea textarea-bordered h-32 w-full rounded-xl"
						placeholder="Describe your project, your role, and the outcomes..."
						required
					></textarea>
				</div>

				<!-- Category -->
				<!-- <div class="form-control">
						<label class="label" for="category">
							<span class="label-text font-medium">Category</span>
							<span class="label-text-alt">Required</span>
						</label>
						<select
							id="category"
							bind:value={category}
							class="select select-bordered w-full"
							required
						>
							<option value="">Select a category</option>
							{#each $appStore.categories as cat}
								<option value={cat.name}>{cat.name}</option>
							{/each}
						</select>
					</div> -->

				<!-- Completion Date -->
				<div class="form-control">
					<label class="label" for="completionDate">
						<span class="label-text font-medium">Completion Date</span>
						<span class="label-text-alt">(Required)</span>
					</label>
					<DatePicker
						label="Completion Date"
						value={completionDate}
						onChange={(value: string) => (completionDate = value)}
						required
					/>
				</div>

				<!-- Skills Used -->
				<div class="form-control">
					<label class="label" for="skills">
						<span class="label-text font-medium">Skills Used</span>
					</label>

					<Tags
						selectedTags={selectedSkills}
						options={skills.map((skill) => ({
							id: skill.id || '',
							name: skill.name
						}))}
						onChange={(value: (string | number)[]) => (selectedSkills = value as string[])}
					/>
				</div>

				<!-- Images -->
				<div class="form-control space-y-2">
					<div>
						<span class="text-base-content/80 block font-medium">Project Images</span>
						<span class="text-base-content/70 block">Required • First image will be primary</span>
					</div>

					<Uploader
						id="portfolioImages"
						label="Add Images"
						maxFiles={5}
						files={images?.map((img) => (img instanceof File ? img : img.url))}
						onChange={handleImageUpload}
						onRemove={handleImageRemove}
					/>
				</div>

				<!-- Error Message -->
				{#if error}
					<div class="alert alert-error">
						<span>{error}</span>
					</div>
				{/if}

				<!-- Success Message -->
				{#if successMessage}
					<div class="alert alert-success">
						<span>{successMessage}</span>
					</div>
				{/if}

				<!-- Form Actions -->
				<div class="flex justify-end gap-2">
					<button class="btn btn-ghost btn-outline" onclick={resetForm}> Cancel </button>
					{#if editingItem}
						<button class="btn btn-ghost btn-outline" onclick={resetForm}> Cancel </button>
					{/if}
					<button class="btn btn-primary" onclick={handleSubmit} disabled={isLoading}>
						{#if isLoading}
							<span class="loading loading-spinner"></span>
						{/if}
						{editingItem ? 'Update Item' : 'Add Item'}
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>
