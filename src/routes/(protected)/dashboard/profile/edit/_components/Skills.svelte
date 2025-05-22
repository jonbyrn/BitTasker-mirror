<script lang="ts">
	import type { Skill } from '$lib/types/profile.d';
	import { onMount, onDestroy } from 'svelte';
	import { appStore } from '$lib/stores/app.store';
	import {
		subscribeToSkillsUpdates,
		publishSkillsUpdate,
		uploadCertification
	} from '$lib/nostr/profile';
	import Uploader from '$lib/components/Uploader.svelte';
	import DatePicker from '$lib/components/date/DatePicker.svelte';

	let { onComplete } = $props<{ onComplete: (completed: boolean) => void }>();

	// Local state
	let skills = $state<Skill[]>([]);
	let newSkillName = $state('');
	let newSkillLevel = $state(3);
	let isLoading = $state(false);
	let error = $state('');
	let selectedSkill = $state<Skill | null>(null);
	let hasUnsavedChanges = $state(false);
	let isAddingCertificate = $state(false);
	let cleanup: (() => void) | null = null;
	let certification = $state<{
		name: string;
		issuer: string;
		date: string;
		file: File | null;
	}>({
		name: '',
		issuer: '',
		date: '',
		file: null
	});

	// Subscribe to skills updates
	onMount(async () => {
		cleanup = await subscribeToSkillsUpdates((updatedSkills) => {
			skills = updatedSkills;
			console.log({ skills });
			hasUnsavedChanges = false;
		});
	});

	// Cleanup subscription on component destroy
	onDestroy(() => {
		if (cleanup) cleanup();
	});

	// Track form completion
	$effect(() => {
		onComplete(skills.length > 0);
	});

	// Add new skill
	function addSkill() {
		if (!newSkillName.trim()) return;

		const newSkill: Skill = {
			name: newSkillName.trim(),
			level: newSkillLevel,
			verificationStatus: 'unverified',
			endorsements: 0,
			certifications: []
		};

		skills = [...skills, newSkill];
		newSkillName = '';
		newSkillLevel = 3;
		hasUnsavedChanges = true;
	}

	// Remove skill
	function removeSkill(index: number) {
		skills = skills.filter((_, i) => i !== index);
		hasUnsavedChanges = true;
	}

	// Update skill level
	function updateSkillLevel(index: number, level: number) {
		skills = skills.map((skill, i) => (i === index ? { ...skill, level } : skill));
		hasUnsavedChanges = true;
	}

	// Handle certification file upload
	function handleCertificationUpload(files: File[]) {
		if (!files.length) return;
		certification.file = files[0];
	}

	// Add certification to skill
	async function addCertification() {
		try {
			if (
				!selectedSkill ||
				!certification.name ||
				!certification.issuer ||
				!certification.date ||
				!certification.file
			) {
				error = 'Please fill in all certification fields';
				return;
			}

			// Upload certification file and create Nostr event with all certification data
			const certResult = await uploadCertification({
				skillName: selectedSkill.name,
				name: certification.name,
				issuer: certification.issuer,
				date: certification.date,
				file: certification.file
			});

			// Update the selected skill with just the reference to the certification
			skills = skills.map((skill) =>
				skill === selectedSkill
					? {
							...skill,
							certifications: [...skill.certifications, certResult]
						}
					: skill
			);

			// Reset form
			certification = {
				name: '',
				issuer: '',
				date: '',
				file: null
			};
			selectedSkill = null;
			hasUnsavedChanges = true;
			isAddingCertificate = false;
		} catch (err) {
			console.error('Failed to add certification:', err);
			error = err instanceof Error ? err.message : 'Failed to add certification';
		}
	}

	// Save all changes
	async function handleSubmit() {
		try {
			isLoading = true;
			error = '';

			// Publish skills update
			await publishSkillsUpdate(skills);
			hasUnsavedChanges = false;

			appStore.showSuccessToast('Skills updated successfully!');
		} catch (err) {
			console.error('Failed to save skills:', err);
			error = err instanceof Error ? err.message : 'Failed to save skills';
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="space-y-6">
	<!-- Add New Skill -->
	<div class="grid gap-4">
		<div class="form-control">
			<label class="label" for="newSkillName">
				<span class="label-text font-medium">Skill Name</span>
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
			<label class="label" for="newSkillLevel">
				<span class="label-text font-medium">Proficiency Level</span>
				<span class="label-text-alt">1 = Beginner, 5 = Expert</span>
			</label>
			<input
				type="range"
				id="newSkillLevel"
				bind:value={newSkillLevel}
				min="1"
				max="5"
				class="range range-primary range-xs w-full"
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
			<button
				class="btn btn-primary w-full"
				onclick={addSkill}
				disabled={!newSkillName.trim() || isLoading}
			>
				Add Skill
			</button>
		</div>
	</div>

	<!-- Skills List -->
	{#if skills.length > 0}
		<div class="space-y-4">
			<h3 class="text-lg font-medium">Your Skills</h3>

			<div class="grid grid-cols-1 gap-4">
				{#each skills as skill, i}
					<div class="card border-base-content rounded-2xl border shadow-sm">
						<div class="card-body p-4">
							<div class="flex items-start justify-between">
								<h3 class="card-title">{skill.name}</h3>
								<button
									aria-label="Remove skill"
									class="btn btn-circle btn-accent btn-xs"
									onclick={() => removeSkill(i)}
									disabled={isLoading}
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="14"
										height="14"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<path d="M18 6 6 18"></path>
										<path d="m6 6 12 12"></path>
									</svg>
								</button>
							</div>

							<!-- Skill Level -->
							<div class="flex items-center gap-2">
								<label class="pr-2 text-sm font-medium" for={`rating-${i}`}>Proficiency</label>
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
							</div>

							<!-- Status and Endorsements -->
							<div class="mt-2 flex items-center gap-2">
								<span
									class="badge {skill.verificationStatus === 'verified'
										? 'badge-success'
										: skill.verificationStatus === 'pending'
											? 'badge-warning'
											: 'badge-ghost badge-outline'}"
								>
									{skill.verificationStatus}
								</span>
								<span class="badge badge-outline">
									{skill.endorsements} endorsement{skill.endorsements !== 1 ? 's' : ''}
								</span>
							</div>

							<!-- Certifications -->
							<div class="mt-2 flex items-center justify-start gap-2">
								<span class="text-sm font-medium">
									Certifications ({skill.certifications.length})
								</span>
								<button
									class="btn btn-ghost btn-outline btn-xs"
									onclick={() => {
										selectedSkill = skill;
										isAddingCertificate = true;
									}}
								>
									Add
								</button>
							</div>
							{#if isAddingCertificate}
								<form method="dialog" class="bg-base-200 space-y-4 rounded-xl px-2 py-4">
									<!-- Certification Name -->
									<div class="form-control">
										<label class="label" for="certificationName">
											<span class="label-text">Certification Name</span>
										</label>
										<input
											type="text"
											id="certificationName"
											bind:value={certification.name}
											class="input input-bordered w-full"
											placeholder="e.g. AWS Certified Developer"
											required
										/>
									</div>

									<!-- Issuing Organization -->
									<div class="form-control">
										<label class="label" for="certificationIssuer">
											<span class="label-text">Issuing Organization</span>
										</label>
										<input
											type="text"
											id="certificationIssuer"
											bind:value={certification.issuer}
											class="input input-bordered w-full"
											placeholder="e.g. Amazon Web Services"
											required
										/>
									</div>

									<!-- Issue Date -->
									<div class="form-control">
										<DatePicker
											label="Issue Date"
											value={certification.date}
											maxDate={new Date().toISOString()}
											onChange={(value: string) => {
												certification.date = value;
											}}
										/>
									</div>

									<!-- Certificate File -->
									<div class="form-control">
										<label class="label" for="certificationFile">
											<span class="label-text">Upload Certificate</span>
										</label>
										<Uploader
											id="certificationFile"
											label="Upload Certificate"
											maxFiles={1}
											customClass="w-full"
											files={certification.file ? [certification.file] : undefined}
											onChange={handleCertificationUpload}
										/>
									</div>

									<!-- Modal Actions -->
									<div class="modal-action">
										<button
											type="button"
											class="btn btn-primary btn-sm"
											onclick={addCertification}
											disabled={isLoading ||
												!certification.name ||
												!certification.issuer ||
												!certification.date ||
												!certification.file}
										>
											{#if isLoading}
												<span class="loading loading-spinner"></span>
											{/if}
											Add Certification
										</button>
										<button
											class="btn btn-ghost btn-sm btn-outline"
											onclick={() => (isAddingCertificate = false)}>Close</button
										>
									</div>
								</form>
							{/if}
							{#if skill.certifications.length > 0}
								<div class="mt-2 space-y-2">
									{#each skill.certifications as cert}
										<div class="bg-base-200 rounded-lg p-2 text-xs">
											<div class="font-medium">{cert.name}</div>
											<div class="text-base-content/70">
												{cert.issuer} • {new Date(cert.date).toLocaleDateString()}
											</div>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{:else}
		<div class="alert">
			<span>No skills added yet. Add some skills to showcase your expertise.</span>
		</div>
	{/if}

	<!-- Error Message -->
	{#if error}
		<div class="alert alert-error">
			<span>{error}</span>
		</div>
	{/if}

	<!-- Save Button -->
	{#if hasUnsavedChanges}
		<div class="flex justify-end">
			<button
				class="btn btn-primary"
				onclick={handleSubmit}
				disabled={isLoading || skills.length === 0}
			>
				{#if isLoading}
					<span class="loading loading-spinner"></span>
				{/if}
				Save Changes
			</button>
		</div>
	{/if}
</div>

<!-- Success Toast -->
<div id="skills-toast-success" class="toast toast-end" style="display: none;">
	<div class="alert alert-success">
		<span>Skills updated successfully!</span>
	</div>
</div>
