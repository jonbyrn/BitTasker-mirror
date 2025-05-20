<script lang="ts">
	import { UpdateUserProfileStore } from '$houdini';
	import Uploader from '$lib/components/Uploader.svelte';
	import uploadService from '$lib/api/services/upload.service';

	interface PortfolioItem {
		id: string;
		title: string;
		description: string;
		category: string;
		completionDate: string;
		images: Array<{
			url: string;
			key: string;
			isPrimary: boolean;
		}>;
		skills: string[];
		clientTestimonial?: {
			name: string;
			rating: number;
			text: string;
		};
	}

	let { user, onComplete } = $props<{
		user: { portfolio?: Array<PortfolioItem> | null } | null | undefined;
		onComplete: (completed: boolean) => void;
	}>();

	const profileStore = new UpdateUserProfileStore();

	// Local state
	let portfolioItems = $state<PortfolioItem[]>(user?.portfolio || []);
	let title = $state('');
	let description = $state('');
	let category = $state('');
	let completionDate = $state('');
	let selectedSkills = $state<string[]>([]);
	let images: Array<{ url: string; key: string; isPrimary: boolean }> = $state([]);
	let isLoading = $state(false);
	let error = $state('');
	let editingItem = $state<PortfolioItem | null>(null);

	// Available categories
	const categories = [
		'Web Development',
		'Mobile Apps',
		'Design',
		'Writing',
		'Video Production',
		'Photography',
		'Marketing',
		'Business',
		'Other'
	];

	// Track form completion
	$effect(() => {
		const isComplete = portfolioItems.length > 0;
		onComplete(isComplete);
	});

	// Handle image upload
	async function handleImageUpload(files: File[]) {
		if (!files.length) return;

		try {
			isLoading = true;
			error = '';

			const uploadPromises = files.map((file) => uploadService.uploadSingleFile(file, 'portfolio'));
			const uploadedFiles = await Promise.all(uploadPromises);

			images = [
				...images,
				...uploadedFiles.map((file, index) => ({
					url: file.url,
					key: file.key,
					isPrimary: images.length === 0 && index === 0 // First image is primary by default
				}))
			];
		} catch (err) {
			console.error('File upload failed:', err);
			error = 'Failed to upload images. Please try again.';
		} finally {
			isLoading = false;
		}
	}

	// Set primary image
	function setPrimaryImage(index: number) {
		images = images.map((img, i) => ({
			...img,
			isPrimary: i === index
		}));
	}

	// Remove image
	function removeImage(index: number) {
		images = images.filter((_, i) => i !== index);
		if (images.length > 0 && !images.some((img) => img.isPrimary)) {
			images[0].isPrimary = true;
		}
	}

	// Add or update portfolio item
	function addOrUpdatePortfolioItem() {
		if (!title || !description || !category || !completionDate || images.length === 0) {
			error = 'Please fill in all required fields and add at least one image';
			return;
		}

		const item: PortfolioItem = {
			id: editingItem?.id || `portfolio-${Date.now()}`,
			title,
			description,
			category,
			completionDate,
			images,
			skills: selectedSkills
		};

		if (editingItem) {
			portfolioItems = portfolioItems.map((i) => (i.id === editingItem?.id ? item : i));
		} else {
			portfolioItems = [...portfolioItems, item];
		}

		// Reset form
		resetForm();
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

	// Remove portfolio item
	function removeItem(id: string) {
		portfolioItems = portfolioItems.filter((item) => item.id !== id);
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

	// Save portfolio
	async function handleSubmit() {
		try {
			isLoading = true;
			error = '';

			// Update profile using GraphQL
			const result = await profileStore.mutate({
				input: {
					portfolio: portfolioItems
				}
			});

			if (result.errors) {
				throw new Error(result.errors[0].message);
			}

			// Show success message
			const toast = document.getElementById('portfolio-toast-success');
			if (toast) toast.style.display = 'block';
		} catch (err) {
			console.error('Portfolio update failed:', err);
			error = err instanceof Error ? err.message : 'Failed to update portfolio';
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="space-y-8">
	<!-- Portfolio Form -->
	<div class="card border-base-300 border rounded-xl p-4">
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
					class="textarea textarea-bordered rounded-xl h-32 w-full"
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
					{#each categories as cat}
						<option value={cat}>{cat}</option>
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
				<input
					type="text"
					id="skills"
					placeholder="Type a skill and press Enter"
					class="input input-bordered w-full"
					onkeydown={(e) => {
						if (e.key === 'Enter') {
							e.preventDefault();
							const input = e.target as HTMLInputElement;
							const skill = input.value.trim();
							if (skill && !selectedSkills.includes(skill)) {
								selectedSkills = [...selectedSkills, skill];
								input.value = '';
							}
						}
					}}
				/>
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
					<span class="text-base-content/80 font-medium block">Project Images</span>
					<span class="text-base-content/70 block">Required • First image will be primary</span>
				</div>

				<Uploader
					id="portfolioImages"
					label="Add Images"
					maxFiles={10}
					files={images.map((img) => img.url)}
					onChange={handleImageUpload}
				/>
			</div>

			<!-- Error Message -->
			{#if error}
				<div class="alert alert-error">
					<span>{error}</span>
				</div>
			{/if}

			<!-- Form Actions -->
			<div class="flex justify-end gap-2">
				{#if editingItem}
					<button class="btn btn-ghost" onclick={resetForm}> Cancel </button>
				{/if}
				<button class="btn btn-primary" onclick={addOrUpdatePortfolioItem} disabled={isLoading}>
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
						<img
							src={item.images.find((img) => img.isPrimary)?.url || item.images[0].url}
							alt={item.title}
							class="h-48 w-full object-cover"
						/>
					</figure>
					<div class="card-body">
						<h2 class="card-title">{item.title}</h2>
						<p class="text-base-content/70">{item.description}</p>

						<div class="mt-4 flex flex-wrap gap-2">
							<span class="badge badge-ghost">{item.category}</span>
							{#each item.skills as skill}
								<span class="badge badge-primary badge-outline">{skill}</span>
							{/each}
						</div>

						<div class="card-actions mt-4 justify-end">
							<button class="btn btn-ghost btn-sm" onclick={() => editItem(item)}> Edit </button>
							<button class="btn btn-error btn-sm" onclick={() => removeItem(item.id)}>
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

	<!-- Save Button -->
	<div class="flex justify-end">
		<button
			class="btn btn-primary"
			onclick={handleSubmit}
			disabled={isLoading || portfolioItems.length === 0}
		>
			{#if isLoading}
				<span class="loading loading-spinner"></span>
			{/if}
			Save Portfolio
		</button>
	</div>
</div>

<!-- Success Toast -->
<div id="portfolio-toast-success" class="toast toast-end" style="display: none;">
	<div class="alert alert-success">
		<span>Portfolio updated successfully!</span>
	</div>
</div>
