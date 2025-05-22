<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { appStore } from '$lib/stores/app.store';
	import type { PortfolioItem, NostrProfileImage, Skill } from '$lib/types/profile.d';
	import {
		subscribeToPortfolioUpdates,
		publishPortfolioItem,
		deletePortfolioItem,
		subscribeToSkillsUpdates,
		publishMultipleImages,
		subscribeToProfileUpdates,
		_subscribeToProfileUpdates
	} from '$lib/nostr/profile';
	import Uploader from '$lib/components/Uploader.svelte';
	import uploadService from '$lib/api/services/upload.service';

	let { user, onComplete } = $props<{
		user: { pubkey?: string } | null | undefined;
		onComplete: (completed: boolean) => void;
	}>();

	// Local state
	let portfolioItems = $state<PortfolioItem[]>([]);
	let title = $state('');
	let description = $state('');
	let category = $state('');
	let completionDate = $state('');
	let selectedSkills = $state<string[]>([]);
	let userSkills = $state<Skill[]>([]);
	let images = $state<(NostrProfileImage | File)[]>([]);
	let isLoading = $state(false);
	let error = $state('');
	let editingItem = $state<PortfolioItem | null>(null);
	let successMessage = $state('');
	let skills = $state<Skill[]>([]);
	let events = $state<{
		portfolio: string | null;
		images: string | null;
		skills: string | null;
	}>({
		portfolio: null,
		images: null,
		skills: null
	});

	// Subscribe to portfolio and skills updates
	let unsubscribePortfolio: (() => void) | undefined;
	let unsubscribeSkills: (() => void) | undefined;
	let cleanup: (() => void) | null = null;

	/* async function setupSubscriptions() {
		if (!user?.pubkey) return;

		unsubscribePortfolio = await subscribeToPortfolioUpdates((items) => {
			portfolioItems = items;
		});

		unsubscribeSkills = await subscribeToSkillsUpdates((skills) => {
			userSkills = skills;
		});
	} */

	onMount(async () => {
		cleanup = await subscribeToProfileUpdates(
			async (event) => {
				console.log('event', event, event.kind);
				try {
					if (event.kind === 30001) {
						events.portfolio = event.id;
						portfolioItems = JSON.parse(event.content);
					} else if (event.kind === 1063 || event.kind === 30063) {
						events.images = event.id;
						images = JSON.parse(event.content);
					} else if (event.kind === 30000) {
						events.skills = event.id;
						skills = JSON.parse(event.content);
					}
				} catch (err) {
					console.error('Failed to subscribe to portfolio updates:', err);
				}
			},
			{
				30001: { d: 'portfolio' },
				1063: { d: 'portfolio-images' }
				// 30063: { 'd': 'portfolio-images' },
				// 30000: { 't': 'skills' }
			}
		);

		/* setupSubscriptions();

		return () => {
			if (unsubscribePortfolio) unsubscribePortfolio();
			if (unsubscribeSkills) unsubscribeSkills();
		}; */
	});

	onDestroy(() => {
		if (cleanup) cleanup();
		if (unsubscribePortfolio) unsubscribePortfolio();
		if (unsubscribeSkills) unsubscribeSkills();
	});

	// Handle image upload
	async function handleImageUpload(files: File[]) {
		images = [...images, ...files];
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
		if (!title || !description || !category || !completionDate || images.length === 0) {
			error = 'Please fill in all required fields and add at least one image';
			return;
		}

		try {
			isLoading = true;
			error = '';

			// const uploadedImages = await uploadImages(images);
			await publishMultipleImages(
				[
					{
						key: 'portfolio/1747948929920-10586a274a71f2dd.png',
						url: 'https://pub-9749cc3802084a9da8131640ddfd3403.r2.dev/portfolio/1747948929920-10586a274a71f2dd.png',
						type: 'image/png',
						alt: 'bugati bolide.png',
						isPrimary: true
					}
				],
				events.images,
				'portfolio-images'
			);
			return;

			const item: PortfolioItem = {
				title,
				description,
				category,
				completionDate,
				skills: selectedSkills
			};

			if (editingItem?.id) {
				item.id = editingItem.id;
			}

			await publishPortfolioItem(item);

			// Show success message
			successMessage = editingItem
				? 'Portfolio item updated successfully!'
				: 'Portfolio item added successfully!';

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
			isLoading = true;
			error = '';

			await deletePortfolioItem(
				item.id,
				item.images?.map((img) => img.key)
			);
			successMessage = 'Portfolio item deleted successfully!';
			setTimeout(() => (successMessage = ''), 3000);
		} catch (err) {
			console.error('Failed to remove portfolio item:', err);
			error = err instanceof Error ? err.message : 'Failed to remove portfolio item';
		} finally {
			isLoading = false;
		}
	}

	// Set primary image
	function setPrimaryImage(index: number) {
		images = images?.map((img, i) => ({
			...img,
			isPrimary: i === index
		}));
	}

	// Edit portfolio item
	function editItem(item: PortfolioItem) {
		editingItem = item;
		title = item.title;
		description = item.description;
		category = item.category;
		completionDate = item.completionDate;
		selectedSkills = [...item.skills];
		images = [...item.images];
	}

	// Reset form
	function resetForm() {
		editingItem = null;
		title = '';
		description = '';
		category = '';
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

<div class="space-y-8">
	<!-- Portfolio Form -->
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
			<div class="form-control">
				<label class="label" for="category">
					<span class="label-text font-medium">Category</span>
					<span class="label-text-alt">Required</span>
				</label>
				<select id="category" bind:value={category} class="select select-bordered w-full" required>
					<option value="">Select a category</option>
					{#each $appStore.categories as cat}
						<option value={cat.name}>{cat.name}</option>
					{/each}
				</select>
			</div>

			<!-- Completion Date -->
			<div class="form-control">
				<label class="label" for="completionDate">
					<span class="label-text font-medium">Completion Date</span>
					<span class="label-text-alt">Required</span>
				</label>
				<input
					type="date"
					id="completionDate"
					bind:value={completionDate}
					class="input input-bordered w-full"
					required
				/>
			</div>

			<!-- Skills Used -->
			<div class="form-control">
				<label class="label" for="skills">
					<span class="label-text font-medium">Skills Used</span>
				</label>
				<select
					id="skills"
					class="select select-bordered w-full"
					onchange={(e) => {
						const select = e.target as HTMLSelectElement;
						const skill = select.value;
						if (skill && !selectedSkills?.includes(skill)) {
							selectedSkills = [...selectedSkills, skill];
							select.value = '';
						}
					}}
				>
					<option value="">Select a skill</option>
					{#if userSkills}
						{#each userSkills as skill}
							{#if !selectedSkills?.includes(skill.name)}
								<option value={skill.name}>{skill.name}</option>
							{/if}
						{/each}
					{/if}
				</select>
				{#if selectedSkills.length > 0}
					<div class="mt-2 flex flex-wrap gap-2">
						{#each selectedSkills as skill}
							<span class="badge badge-primary gap-2">
								{skill}
								<button
									class="btn btn-ghost btn-xs"
									onclick={() => {
										selectedSkills = selectedSkills.filter((s) => s !== skill);
									}}
								>
									✕
								</button>
							</span>
						{/each}
					</div>
				{/if}
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
					maxFiles={10}
					files={images?.map((img) => (img instanceof File ? img : img.url))}
					onChange={handleImageUpload}
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
				{#if editingItem}
					<button class="btn btn-ghost" onclick={resetForm}> Cancel </button>
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

	<!-- Portfolio Items -->
	{#if portfolioItems.length > 0}
		<div class="grid gap-6 md:grid-cols-2">
			{#each portfolioItems as item}
				<div class="card bg-base-100 shadow-lg">
					<figure>
						<!-- <img
							src={item.images.find((img) => img.isPrimary)?.url || item.images[0].url}
							alt={item.title}
							class="h-48 w-full object-cover"
						/> -->
						test image
					</figure>
					<div class="card-body">
						<h2 class="card-title">{item.title}</h2>
						<p class="text-base-content/70">{item.description}</p>

						<div class="mt-4 flex flex-wrap gap-2">
							<span class="badge badge-ghost">{item.category}</span>
							{#if item.skills}
								{#each item.skills as skill}
									<span class="badge badge-primary badge-outline">{skill}</span>
								{/each}
							{/if}
						</div>

						<div class="card-actions mt-4 justify-end">
							<button class="btn btn-ghost btn-sm" onclick={() => editItem(item)}> Edit </button>
							<button class="btn btn-error btn-sm" onclick={() => removePortfolioItem(item)}>
								Remove
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
</div>

<!-- Success Toast -->
<div id="portfolio-toast-success" class="toast toast-end" style="display: none;">
	<div class="alert alert-success">
		<span>Portfolio updated successfully!</span>
	</div>
</div>
