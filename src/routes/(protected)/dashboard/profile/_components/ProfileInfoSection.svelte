<script lang="ts">
	import { mockUser } from '$lib/utils/consts';

	// Define necessary types locally
	type UserSkill = { name: string; level: number; verified: boolean };
	type UserCertification = {
		id: string;
		name: string;
		issue: string;
		date: string;
		verified: boolean;
	};
	type UserPortfolioItem = {
		id: string;
		title: string;
		description: string;
		images: string[];
		date: string;
	};
	type Reviewer = { id: string; name: string; avatar?: string }; // Avatar is optional in mock
	type UserReview = { id: string; from: Reviewer; rating: number; text: string; date: string };
	type User = typeof mockUser;

	let { isEditMode, formatDate, yearsFrom } = $props<{
		isEditMode: boolean;
		formatDate: (dateString: string) => string;
		yearsFrom: (dateString: string) => number;
	}>();

	// Use mockUser directly
	const user = mockUser;

	// --- Local State for Edit Mode ---
	let editSkills = $state([...user.skills]);
	let newSkillName = $state('');
	let newSkillLevel = $state(3);

	let portfolioItems = $state([...user.portfolio]); // Local reactive copy for portfolio
	let newPortfolioTitle = $state('');
	let newPortfolioDescription = $state('');
	let newPortfolioImages = $state<File[]>([]);

	// Sync local edit state if isEditMode changes (e.g., cancel)
	$effect(() => {
		if (!isEditMode) {
			editSkills = [...user.skills];
			newSkillName = '';
			newSkillLevel = 3;
			portfolioItems = [...user.portfolio];
			newPortfolioTitle = '';
			newPortfolioDescription = '';
			newPortfolioImages = [];
		}
	});

	// --- Local Edit Functions ---
	function addSkill() {
		const nameToAdd = newSkillName.trim();
		if (nameToAdd) {
			editSkills = [
				...editSkills,
				{
					name: nameToAdd,
					level: newSkillLevel,
					verified: false // New skills aren't verified by default
				}
			];
			newSkillName = ''; // Reset form
			newSkillLevel = 3;
		}
	}

	function removeSkill(index: number) {
		editSkills = editSkills.filter((_, i) => i !== index);
	}

	function updateSkillLevel(index: number, level: number) {
		if (editSkills && editSkills[index]) {
			editSkills[index].level = level;
		}
	}

	function handleImageUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		if (input.files) {
			let addedImages: File[] = [];
			for (let i = 0; i < input.files.length; i++) {
				addedImages.push(input.files[i]);
			}
			newPortfolioImages = [...newPortfolioImages, ...addedImages];
		}
	}

	function addPortfolioItem() {
		const titleToAdd = newPortfolioTitle.trim();
		const descriptionToAdd = newPortfolioDescription.trim();

		if (titleToAdd && descriptionToAdd) {
			// Create mock URLs for display, real implementation would upload
			const mockImageUrls = newPortfolioImages.map(
				(file, i) => `/mock/portfolio/${Date.now()}-${i}.jpg`
			);

			const newItem: UserPortfolioItem = {
				id: `port${portfolioItems.length + 1 + Date.now()}`, // More unique ID
				title: titleToAdd,
				description: descriptionToAdd,
				images: mockImageUrls,
				date: new Date().toISOString().split('T')[0]
			};

			portfolioItems = [newItem, ...portfolioItems];

			// Reset form
			newPortfolioTitle = '';
			newPortfolioDescription = '';
			newPortfolioImages = [];
		}
	}
	// TODO: Need a way to save the modified `editSkills` and `portfolioItems`
	// when the parent's `saveProfile` is called. Options:
	// 1. Emit events with the data.
	// 2. Use a writable store.
	// 3. Pass callback props for updating parent state (less ideal for deep nesting).
</script>

<div class="lg:w-2/3">
	{#if isEditMode}
		<!-- ====================== -->
		<!--    EDIT MODE           -->
		<!-- ====================== -->

		<!-- Skills Edit Section -->
		<div class="mb-8">
			<h3 class="mb-4 text-xl font-semibold">Skills</h3>
			<!-- Add Skill Form -->
			<div class="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
				<!-- Skill Name Input -->
				<div class="form-control">
					<label for="newSkillName" class="label">
						<span class="label-text">Skill Name</span>
					</label>
					<input
						type="text"
						id="newSkillName"
						bind:value={newSkillName}
						class="input input-bordered w-full"
						placeholder="Add a skill"
					/>
				</div>
				<!-- Skill Level Input -->
				<div class="form-control">
					<label for="newSkillLevel" class="label">
						<span class="label-text">Skill Level (1-5)</span>
					</label>
					<input
						type="range"
						id="newSkillLevel"
						bind:value={newSkillLevel}
						min="1"
						max="5"
						class="range range-primary"
					/>
					<div class="flex w-full justify-between px-2 text-xs">
						<span>1</span>
						<span>2</span>
						<span>3</span>
						<span>4</span>
						<span>5</span>
					</div>
				</div>
				<!-- Add Skill Button -->
				<div class="form-control flex items-end">
					<button class="btn btn-primary" onclick={addSkill} disabled={!newSkillName?.trim()}>
						Add Skill
					</button>
				</div>
			</div>

			<!-- Current Skills Table -->
			{#if editSkills && editSkills.length > 0}
				<div class="overflow-x-auto">
					<table class="table-zebra table w-full">
						<thead>
							<tr>
								<th>Skill</th>
								<th>Level</th>
								<th>Actions</th>
							</tr>
						</thead>
						<tbody>
							{#each editSkills as skill, i}
								<tr>
									<td>
										{skill.name}
										{#if skill.verified}
											<span class="badge badge-success badge-sm ml-2">Verified</span>
										{/if}
									</td>
									<td>
										<div class="rating rating-sm">
											{#each Array(5) as _, j}
												<input
													type="radio"
													name={`rating-${i}`}
													class="mask mask-star-2 bg-orange-400"
													checked={j + 1 === skill.level}
													onchange={() => updateSkillLevel(i, j + 1)}
												/>
											{/each}
										</div>
									</td>
									<td>
										<button class="btn btn-error btn-sm" onclick={() => removeSkill(i)}>
											Remove
										</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<div class="alert">
					<span>No skills added yet. Add some skills to showcase your expertise.</span>
				</div>
			{/if}
		</div>

		<!-- Portfolio Edit Section -->
		<div class="mb-8">
			<h3 class="mb-4 text-xl font-semibold">Add Portfolio Item</h3>
			<!-- Portfolio Title Input -->
			<div class="form-control mb-4">
				<label for="portfolioTitle" class="label">
					<span class="label-text">Project Title</span>
				</label>
				<input
					type="text"
					id="portfolioTitle"
					bind:value={newPortfolioTitle}
					class="input input-bordered w-full"
					placeholder="Enter project title"
				/>
			</div>
			<!-- Portfolio Description Input -->
			<div class="form-control mb-4">
				<label for="portfolioDescription" class="label">
					<span class="label-text">Project Description</span>
				</label>
				<textarea
					id="portfolioDescription"
					bind:value={newPortfolioDescription}
					class="textarea textarea-bordered h-24"
					placeholder="Describe the project and your contribution"
				></textarea>
			</div>
			<!-- Portfolio Image Input -->
			<div class="form-control mb-4">
				<label for="portfolioImages" class="label">
					<span class="label-text">Project Images</span>
				</label>
				<input
					type="file"
					id="portfolioImages"
					onchange={handleImageUpload}
					class="file-input file-input-bordered w-full"
					multiple
					accept="image/*"
				/>
				<!-- Display Selected Images -->
				{#if newPortfolioImages && newPortfolioImages.length > 0}
					<div class="mt-2 flex flex-wrap gap-2">
						{#each newPortfolioImages as file}
							<div class="badge badge-lg">{file.name}</div>
						{/each}
					</div>
				{/if}
			</div>
			<!-- Add Portfolio Item Button -->
			<button
				class="btn btn-primary"
				onclick={addPortfolioItem}
				disabled={!newPortfolioTitle?.trim() || !newPortfolioDescription?.trim()}
			>
				Add Portfolio Item
			</button>
		</div>

		<!-- Display Current Portfolio Items in Edit Mode -->
		{#if portfolioItems && portfolioItems.length > 0}
			<div class="mb-8">
				<h4 class="mb-2 text-lg font-semibold">Current Portfolio</h4>
				<div class="grid grid-cols-1 gap-6">
					{#each portfolioItems as item}
						<div class="card bg-base-200 shadow-sm">
							<div class="card-body p-4">
								<h4 class="card-title text-base">{item.title}</h4>
								<p class="text-base-content/70 text-sm">{formatDate(item.date)}</p>
								<p class="my-1 text-sm">{item.description}</p>
								{#if item.images && item.images.length > 0}
									<div class="mt-2 flex flex-wrap gap-1">
										{#each item.images as image}
											<!-- Display mock path or placeholder -->
											<div class="badge badge-outline text-xs">{image.split('/').pop()}</div>
										{/each}
									</div>
								{/if}
								<!-- TODO: Add delete/edit buttons for portfolio items -->
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	{:else if user}
		<!-- ====================== -->
		<!--    VIEW MODE           -->
		<!-- ====================== -->

		<!-- Bio Section -->
		{#if user.bio}
			<div class="mb-8">
				<h3 class="mb-4 text-xl font-semibold">About</h3>
				<p class="whitespace-pre-line">{user.bio}</p>
			</div>
		{/if}

		<!-- Skills Section -->
		<div class="mb-8">
			<h3 class="mb-4 text-xl font-semibold">Skills</h3>
			{#if user.skills && user.skills.length > 0}
				<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
					{#each user.skills as skill}
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<span>{skill.name}</span>
								{#if skill.verified}
									<span class="badge badge-success badge-sm">Verified</span>
								{/if}
							</div>
							<div class="rating rating-sm">
								{#each Array(5) as _, i}
									<input
										type="radio"
										class="mask mask-star-2 bg-orange-400"
										checked={i + 1 === skill.level}
										disabled
									/>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="alert">
					<span>No skills listed yet.</span>
				</div>
			{/if}
		</div>

		<!-- Certifications Section -->
		<div class="mb-8">
			<h3 class="mb-4 text-xl font-semibold">Certifications</h3>
			{#if user.certifications && user.certifications.length > 0}
				<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
					{#each user.certifications as cert}
						<div class="card bg-base-200">
							<div class="card-body p-4">
								<div class="flex items-start justify-between">
									<h4 class="card-title text-base">{cert.name}</h4>
									{#if cert.verified}
										<div class="badge badge-success">Verified</div>
									{/if}
								</div>
								<p class="text-base-content/70 text-sm">{cert.issuer}</p>
								<p class="text-sm">
									<span class="text-base-content/70">Since </span>
									{formatDate(cert.date)}
									<span class="text-base-content/70">({yearsFrom(cert.date)} years)</span>
								</p>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="alert">
					<span>No certifications listed yet.</span>
				</div>
			{/if}
		</div>

		<!-- Portfolio Section -->
		<div class="mb-8">
			<h3 class="mb-4 text-xl font-semibold">Portfolio</h3>
			{#if user.portfolio && user.portfolio.length > 0}
				<div class="grid grid-cols-1 gap-6">
					{#each user.portfolio as item}
						<div class="card bg-base-200">
							<div class="card-body p-4">
								<h4 class="card-title">{item.title}</h4>
								<p class="text-base-content/70 text-sm">{formatDate(item.date)}</p>
								<p class="my-2">{item.description}</p>
								{#if item.images && item.images.length > 0}
									<div class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
										{#each item.images as image}
											<div class="bg-base-300 flex h-40 items-center justify-center rounded-lg">
												<span class="text-base-content/50">Image Placeholder</span>
											</div>
										{/each}
									</div>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="alert">
					<span>No portfolio items added yet.</span>
				</div>
			{/if}
		</div>

		<!-- Reviews Section -->
		<div class="mb-8">
			<h3 class="mb-4 text-xl font-semibold">Reviews</h3>
			{#if user.reviews && user.reviews.length > 0}
				<div class="space-y-4">
					{#each user.reviews as review}
						<div class="card bg-base-200">
							<div class="card-body p-4">
								<div class="flex items-start justify-between">
									<div class="flex items-center gap-2">
										<div class="avatar placeholder">
											<div class="bg-neutral text-neutral-content w-8 rounded-full">
												{#if review.from?.name}
													<span>{review.from.name.charAt(0)}</span>
												{:else}
													<span>?</span>
												{/if}
											</div>
										</div>
										<div>
											<p class="font-medium">{review.from?.name ?? 'Anonymous'}</p>
											<p class="text-base-content/70 text-xs">{formatDate(review.date)}</p>
										</div>
									</div>
									<div class="rating rating-sm">
										{#each Array(5) as _, i}
											<input
												type="radio"
												class="mask mask-star-2 bg-orange-400"
												checked={i + 1 === review.rating}
												disabled
											/>
										{/each}
									</div>
								</div>
								<p class="mt-2">{review.text}</p>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="alert">
					<span>No reviews yet.</span>
				</div>
			{/if}
		</div>
	{/if}
</div>
