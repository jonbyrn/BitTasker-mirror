<script lang="ts">
	import { mockUser } from '$lib/utils/consts';
	let { data } = $props();
	const { user: userData } = $derived(data);

	const user = $derived(mockUser);

	// Edit mode state
	let isEditMode = $state(false);

	// Form states
	let editName = $state(user.name);
	let editBio = $state(user.bio);
	let editLocation = $state(user.location);
	let editSkills = $state([...user.skills]);
	let newSkillName = $state('');
	let newSkillLevel = $state(3);

	// New portfolio item
	let newPortfolioTitle = $state('');
	let newPortfolioDescription = $state('');
	let newPortfolioImages = $state<File[]>([]);

	// Toggle edit mode
	function toggleEditMode() {
		if (isEditMode) {
			// If leaving edit mode, reset form to current user data
			editName = user.name;
			editBio = user.bio;
			editLocation = user.location;
			editSkills = [...user.skills];
		}
		isEditMode = !isEditMode;
	}

	// Add a new skill
	function addSkill() {
		if (newSkillName.trim()) {
			editSkills = [
				...editSkills,
				{
					name: newSkillName.trim(),
					level: newSkillLevel,
					verified: false
				}
			];
			newSkillName = '';
			newSkillLevel = 3;
		}
	}

	// Remove a skill
	function removeSkill(index: number) {
		editSkills = editSkills.filter((_, i) => i !== index);
	}

	// Handle image upload for portfolio
	function handleImageUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		if (input.files) {
			for (let i = 0; i < input.files.length; i++) {
				newPortfolioImages = [...newPortfolioImages, input.files[i]];
			}
		}
	}

	// Add a new portfolio item
	function addPortfolioItem() {
		if (newPortfolioTitle.trim() && newPortfolioDescription.trim()) {
			// In a real implementation, we would upload images and get URLs back
			const mockImageUrls = newPortfolioImages.map(() => '/path/to/mock-image.jpg');

			user.portfolio = [
				{
					id: `port${user.portfolio.length + 1}`,
					title: newPortfolioTitle,
					description: newPortfolioDescription,
					images: mockImageUrls,
					date: new Date().toISOString().split('T')[0]
				},
				...user.portfolio
			];

			// Reset form
			newPortfolioTitle = '';
			newPortfolioDescription = '';
			newPortfolioImages = [];
		}
	}

	// Save profile changes
	function saveProfile() {
		// In a real implementation, this would send data to an API or Nostr
		// user = {
		// 	...user,
		// 	name: editName,
		// 	bio: editBio,
		// 	location: editLocation,
		// 	skills: editSkills
		// };

		isEditMode = false;
	}

	// Format date
	function formatDate(dateString: string) {
		const date = new Date(dateString);
		return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
	}

	// Calculate years from date
	function yearsFrom(dateString: string) {
		const then = new Date(dateString);
		const now = new Date();
		return now.getFullYear() - then.getFullYear();
	}
</script>

<div class="mx-auto max-w-5xl">
	<div class="bg-base-100 mb-6 rounded-lg p-6 shadow-lg">
		<!-- Profile Header -->
		<div class="mb-6 flex flex-col items-start justify-between md:flex-row md:items-center">
			<div class="mb-4 flex items-center gap-4 md:mb-0">
				<div class="avatar placeholder">
					<div class="bg-primary text-primary-content w-20 rounded-full">
						<span class="text-2xl">{userData?.name?.charAt(0)}</span>
					</div>
				</div>
				<div>
					<h2 class="text-2xl font-bold">{userData?.name ?? mockUser.name}</h2>
					<p class="text-base-content/70 flex items-center gap-2">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
							/>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
							/>
						</svg>
						{userData?.location ?? mockUser.location}
					</p>
				</div>
			</div>

			<div class="flex flex-wrap gap-2">
				<button class="btn btn-primary" onclick={toggleEditMode}>
					{isEditMode ? 'Cancel' : 'Edit Profile'}
				</button>
				{#if isEditMode}
					<button class="btn btn-primary" onclick={saveProfile}> Save Changes </button>
				{/if}
			</div>
		</div>

		<!-- Stats Cards -->
		<div class="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
			<div class="stats shadow">
				<div class="stat p-4">
					<div class="stat-title">Tasks Completed</div>
					<div class="stat-value text-xl">{user.stats.tasksCompleted}</div>
				</div>
			</div>
			<div class="stats shadow">
				<div class="stat p-4">
					<div class="stat-title">Rating</div>
					<div class="stat-value flex items-center text-xl">
						{user.stats.averageRating}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
							fill="currentColor"
							class="ml-1 h-5 w-5 text-yellow-500"
						>
							<path
								fill-rule="evenodd"
								d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z"
								clip-rule="evenodd"
							/>
						</svg>
					</div>
				</div>
			</div>
			<div class="stats shadow">
				<div class="stat p-4">
					<div class="stat-title">Response Rate</div>
					<div class="stat-value text-xl">{user.stats.responseRate}%</div>
				</div>
			</div>
			<div class="stats shadow">
				<div class="stat p-4">
					<div class="stat-title">On-Time Rate</div>
					<div class="stat-value text-xl">{user.stats.onTimeCompletion}%</div>
				</div>
			</div>
		</div>

		<!-- Profile Content -->
		<div class="flex flex-col gap-8 lg:flex-row">
			<!-- Left Column -->
			<div class="lg:w-2/3">
				{#if isEditMode}
					<!-- Edit Form -->
					<div class="mb-8">
						<h3 class="mb-4 text-xl font-semibold">Basic Information</h3>

						<div class="form-control mb-4">
							<label for="name" class="label">
								<span class="label-text">Name</span>
							</label>
							<input
								type="text"
								id="name"
								bind:value={editName}
								class="input input-bordered w-full"
							/>
						</div>

						<div class="form-control mb-4">
							<label for="bio" class="label">
								<span class="label-text">Bio</span>
							</label>
							<textarea
								id="bio"
								bind:value={editBio}
								class="textarea textarea-bordered h-32"
								placeholder="Tell clients about yourself and your experience"
							></textarea>
						</div>

						<div class="form-control mb-4">
							<label for="location" class="label">
								<span class="label-text">Location</span>
							</label>
							<input
								type="text"
								id="location"
								bind:value={editLocation}
								class="input input-bordered w-full"
							/>
						</div>
					</div>

					<!-- Skills Edit -->
					<div class="mb-8">
						<h3 class="mb-4 text-xl font-semibold">Skills</h3>

						<div class="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
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
							<div class="form-control flex items-end">
								<button class="btn btn-primary" onclick={addSkill}> Add Skill </button>
							</div>
						</div>

						<!-- Current Skills -->
						{#if editSkills.length > 0}
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
																onchange={() => {
																	const updatedSkills = editSkills.map((s, skillIndex) => {
																		if (i === skillIndex) {
																			return { ...s, level: j + 1 };
																		}
																		return s;
																	});
																	editSkills = updatedSkills;
																}}
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

					<!-- Portfolio Edit -->
					<div class="mb-8">
						<h3 class="mb-4 text-xl font-semibold">Add Portfolio Item</h3>

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

							{#if newPortfolioImages.length > 0}
								<div class="mt-2 flex flex-wrap gap-2">
									{#each newPortfolioImages as file}
										<div class="badge badge-lg">{file.name}</div>
									{/each}
								</div>
							{/if}
						</div>

						<button
							class="btn btn-primary"
							onclick={addPortfolioItem}
							disabled={!newPortfolioTitle.trim() || !newPortfolioDescription.trim()}
						>
							Add Portfolio Item
						</button>
					</div>
				{:else}
					<!-- Bio Section -->
					<div class="mb-8">
						<h3 class="mb-4 text-xl font-semibold">About</h3>
						<p class="whitespace-pre-line">{user.bio}</p>
					</div>

					<!-- Skills Section -->
					<div class="mb-8">
						<h3 class="mb-4 text-xl font-semibold">Skills</h3>

						{#if user.skills.length > 0}
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

						{#if user.certifications.length > 0}
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

						{#if user.portfolio.length > 0}
							<div class="grid grid-cols-1 gap-6">
								{#each user.portfolio as item}
									<div class="card bg-base-200">
										<div class="card-body p-4">
											<h4 class="card-title">{item.title}</h4>
											<p class="text-base-content/70 text-sm">{formatDate(item.date)}</p>
											<p class="my-2">{item.description}</p>

											{#if item.images.length > 0}
												<div class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
													{#each item.images as image}
														<div
															class="bg-base-300 flex h-40 items-center justify-center rounded-lg"
														>
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

						{#if user.reviews.length > 0}
							<div class="space-y-4">
								{#each user.reviews as review}
									<div class="card bg-base-200">
										<div class="card-body p-4">
											<div class="flex items-start justify-between">
												<div class="flex items-center gap-2">
													<div class="avatar placeholder">
														<div class="bg-neutral text-neutral-content w-8 rounded-full">
															<span>{review.from.name.charAt(0)}</span>
														</div>
													</div>
													<div>
														<p class="font-medium">{review.from.name}</p>
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

			<!-- Right Column -->
			<div class="lg:w-1/3">
				<!-- Availability Card -->
				<div class="card bg-base-200 mb-6">
					<div class="card-body">
						<h3 class="card-title text-lg">Availability</h3>

						<div class="mt-2">
							<p class="font-medium">Weekly Schedule</p>
							<div class="mt-2 space-y-2">
								{#each Object.entries(user.availability.schedule) as [day, schedule]}
									<div class="border-base-300 flex items-center justify-between border-b py-1">
										<span class="capitalize">{day}</span>
										<span>
											{#if schedule.available}
												{schedule.hours}
											{:else}
												<span class="text-base-content/50">Unavailable</span>
											{/if}
										</span>
									</div>
								{/each}
							</div>
						</div>

						<div class="mt-4">
							<p class="font-medium">Next Available</p>
							<p class="text-primary">{formatDate(user.availability.nextAvailable)}</p>
						</div>

						<div class="card-actions mt-4">
							<button class="btn btn-primary btn-block">Contact</button>
						</div>
					</div>
				</div>

				<!-- Cryptocurrency Info Card -->
				<div class="card bg-base-200 mb-6">
					<div class="card-body">
						<h3 class="card-title text-lg">Payment Methods</h3>

						<div class="mt-2 space-y-3">
							<div>
								<p class="font-medium">Bitcoin</p>
								<div class="mt-1 flex items-center gap-2">
									<div class="badge badge-primary">
										<svg
											class="h-4 w-4"
											viewBox="0 0 24 24"
											fill="currentColor"
											xmlns="http://www.w3.org/2000/svg"
										>
											<path
												d="M23.638 14.904c-1.602 6.43-8.113 10.34-14.542 8.736C2.67 22.05-1.244 15.525.362 9.105 1.962 2.67 8.475-1.243 14.9.358c6.43 1.605 10.342 8.115 8.738 14.548v-.002zm-6.35-4.613c.24-1.59-.974-2.45-2.64-3.03l.54-2.153-1.315-.33-.525 2.107c-.345-.087-.705-.167-1.064-.25l.526-2.127-1.32-.33-.54 2.165c-.285-.067-.565-.132-.84-.2l-1.815-.45-.35 1.407s.975.225.955.236c.535.136.63.486.615.766l-1.477 5.92c-.075.166-.24.406-.614.314.015.02-.96-.24-.96-.24l-.66 1.51 1.71.426.93.242-.54 2.19 1.32.327.54-2.17c.36.1.705.19 1.05.273l-.51 2.154 1.32.33.545-2.19c2.24.427 3.93.257 4.64-1.774.57-1.637-.03-2.58-1.217-3.196.854-.193 1.5-.76 1.68-1.93h.01zm-3.01 4.22c-.404 1.64-3.157.75-4.05.53l.72-2.9c.896.23 3.757.67 3.33 2.37zm.41-4.24c-.37 1.49-2.662.735-3.405.55l.654-2.64c.744.18 3.137.524 2.75 2.084v.006z"
											/>
										</svg>
									</div>
									<p class="truncate font-mono text-sm">{user.bitcoinAddress}</p>
								</div>
							</div>

							<div>
								<p class="font-medium">Lightning Address</p>
								<div class="mt-1 flex items-center gap-2">
									<div class="badge badge-warning">
										<svg
											class="h-4 w-4"
											viewBox="0 0 24 24"
											fill="currentColor"
											xmlns="http://www.w3.org/2000/svg"
										>
											<path
												d="M19.1 2.9l-14 14.1L8.5 24l3.4-7 7.1-7.1c.4-.4.4-1 0-1.4l-3.6-3.6c-.4-.4-1-.4-1.4 0zm-4.8 7.7c-.4.4-1 .4-1.4 0-.4-.4-.4-1 0-1.4.4-.4 1-.4 1.4 0 .4.4.4 1 0 1.4z"
											/>
										</svg>
									</div>
									<p class="font-mono text-sm">{user.lightningAddress}</p>
								</div>
							</div>

							<div>
								<p class="font-medium">Nostr</p>
								<div class="mt-1 flex items-center gap-2">
									<div class="badge badge-secondary">
										<svg
											class="h-4 w-4"
											viewBox="0 0 24 24"
											fill="currentColor"
											xmlns="http://www.w3.org/2000/svg"
										>
											<path
												d="M21.89 6.55c-1.98-3.08-5.79-4.82-9.52-4.41C8.47 2.54 4.9 5.33 3.71 9.25c-.82 2.7-.48 5.75 1.06 8.19 2.18 3.4 6.31 5.18 10.32 4.51 3.09-.51 5.78-2.46 7.2-5.22 1.69-3.28 1.45-7.25-.4-10.18zm-1.34 4.54c-.11.83-.52 1.72-1.11 2.33-.69.71-1.56 1.12-2.49 1.25-.66.09-1.4.05-2-.16-.87-.31-1.59-.83-2.3-1.32-.18-.12-.35-.25-.53-.37-.21-.14-.43-.27-.66-.39-.44-.23-.9-.42-1.35-.59-.45-.16-.92-.28-1.39-.29-.66-.01-1.37.17-1.77.7-.39.52-.38 1.13-.2 1.71.2.64.64 1.22 1.15 1.68.3.27.71.61.86.64-.14.27-.7.28-.97.28-.95 0-1.83-.43-2.45-1.2-.65-.82-.94-1.82-.8-2.84.13-.93.64-1.8 1.47-2.33.83-.53 1.87-.72 2.82-.52 1.35.28 2.64 1.15 3.94 1.76 1.14.53 2.33.91 3.58.59.58-.15 1.04-.43 1.42-.89.38-.46.62-1.03.68-1.64.13-.95-.19-1.72-.55-2.57.56 1.12.99 2.48.3 3.97z"
											/>
										</svg>
									</div>
									<p class="truncate font-mono text-sm">{user.nostrPublicKey}</p>
								</div>
							</div>
						</div>
					</div>
				</div>

				<!-- User Stats Card -->
				<div class="card bg-base-100 shadow-xl">
					<div class="card-body p-4">
						<h2 class="card-title text-lg">Your Stats</h2>
						<div class="divider my-2"></div>
						<div class="stats stats-vertical shadow">
							<div class="stat">
								<div class="stat-title">Tasks Completed</div>
								<div class="stat-value">12</div>
								<div class="stat-desc">↗︎ 4 (30%)</div>
							</div>

							<div class="stat">
								<div class="stat-title">Success Rate</div>
								<div class="stat-value">92%</div>
								<div class="stat-desc">↗︎ 6%</div>
							</div>

							<div class="stat">
								<div class="stat-title">Level</div>
								<div class="stat-value">3</div>
								<div class="stat-desc">Silver Member</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
