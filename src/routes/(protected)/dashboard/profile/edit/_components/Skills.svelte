<script lang="ts">
	import type { Skill, SkillCertification } from '$lib/types/profile.d';
	import { t } from '$lib/stores/i18n.store';
	import { onMount, onDestroy } from 'svelte';
	import { appStore } from '$lib/stores/app.store';
	import {
		publishSkillsUpdate,
		uploadCertification,
		subscribeToProfileUpdates,
		deleteNostrEvent
	} from '$lib/nostr/profile';
	import Uploader from '$lib/components/Uploader.svelte';
	import DatePicker from '$lib/components/date/DatePicker.svelte';

	let { onComplete } = $props<{ onComplete: (completed: boolean) => void }>();

	// Local state
	let skills = $state<Skill[]>([]);
	let certifications = $state<{ [key: string]: SkillCertification }>({});
	let newSkillName = $state('');
	let newSkillLevel = $state(3);
	let isLoading = $state(false);
	let error = $state('');
	let selectedSkill = $state<Skill | null>(null);
	let isAddingCertificate = $state(false);
	let isEditingCertificate = $state(false);
	let editingCertificationId = $state<string | null>(null);
	let isInitialLoading = $state(false);
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
		cleanup = await subscribeToProfileUpdates(
			(event) => {
				try {
					isInitialLoading = true;
					if (event.kind === 30000 && event.tags.find((t) => t[0] === 'd' && t[1] === 'skills')) {
						// Handle skills update
						const skillsData = JSON.parse(event.content);
						if (Array.isArray(skillsData)) {
							skills = skillsData.map((skill) => ({
								...skill,
								id: skill.id
							}));
						}
					} else if (
						event.kind === 1063 &&
						event.tags.find((t) => t[0] === 'd' && t[1] === 'certification')
					) {
						// Handle certification
						const certData = JSON.parse(event.content);
						const skillId = event.tags.find((t) => t[0] === 'skill')?.[1];
						if (!skillId) return;

						certifications[event.id] = {
							eventId: event.id,
							skillId,
							name: certData.name,
							issuer: certData.issuer,
							date: certData.date,
							fileUrl: certData.fileUrl,
							verified: false
						};
					}
				} catch (err) {
					console.error('Failed to process event:', err);
				} finally {
					isInitialLoading = false;
				}
			},
			{
				30000: { d: 'skills' },
				1063: { d: 'certification' }
			}
		);
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
		isLoading = true;
		if (!newSkillName.trim()) return;

		const newSkill: Skill = {
			name: newSkillName.trim(),
			level: newSkillLevel,
			verificationStatus: 'unverified',
			endorsements: 0,
			certifications: [],
			id: crypto.randomUUID()
		};

		skills = [newSkill, ...skills];
		newSkillName = '';
		newSkillLevel = 3;
		handleSubmit();
	}

	// Remove skill
	async function removeSkill(index: number) {
		const skill = skills[index];

		// Delete all certifications for this skill
		const skillCerts = Object.values(certifications).filter((cert) => cert.skillId === skill.id);
		for (const cert of skillCerts) {
			await deleteNostrEvent(cert.eventId, '1063');
			delete certifications[cert.eventId];
		}

		skills = skills.filter((_, i) => i !== index);
		handleSubmit();
	}

	// Update skill level
	function updateSkillLevel(index: number, level: number) {
		skills = skills.map((skill, i) => (i === index ? { ...skill, level } : skill));
		handleSubmit();
	}

	// Handle certification file upload
	function handleCertificationUpload(files: File[]) {
		if (!files.length) return;
		certification.file = files[0];
	}

	// Add certification to skill
	async function addCertification() {
		try {
			if (!selectedSkill || !selectedSkill.id) {
				error = 'Skill not found';
				return;
			}

			if (
				!certification.name ||
				!certification.issuer ||
				!certification.date ||
				!certification.file
			) {
				error = 'Please fill in all certification fields';
				return;
			}

			isLoading = true;

			const skillIndex = skills.findIndex((skill) => skill.id === selectedSkill?.id);
			if (skillIndex === -1) {
				error = 'Skill not found';
				return;
			}

			// Upload certification file and create Nostr event
			const certId = await uploadCertification({
				skillId: selectedSkill.id,
				name: certification.name,
				issuer: certification.issuer,
				date: certification.date,
				file: certification.file
			});

			skills[skillIndex].certifications.push(certId);
			handleSubmit();

			// Reset form
			certification = {
				name: '',
				issuer: '',
				date: '',
				file: null
			};
			selectedSkill = null;
			isAddingCertificate = false;
			appStore.showSuccessToast('Certification added successfully!');
		} catch (err) {
			console.error('Failed to add certification:', err);
			error = err instanceof Error ? err.message : 'Failed to add certification';
			appStore.showErrorToast(error);
		} finally {
			isLoading = false;
		}
	}

	// Save all changes
	async function handleSubmit() {
		try {
			isLoading = true;
			error = '';

			// Publish skills update
			await publishSkillsUpdate(skills);

			appStore.showSuccessToast('Skills updated successfully!');
		} catch (err) {
			console.error('Failed to save skills:', err);
			error = err instanceof Error ? err.message : 'Failed to save skills';
		} finally {
			isLoading = false;
		}
	}

	// Remove certification
	async function removeCertification(certId: string) {
		try {
			const cert = certifications[certId];
			if (!cert) {
				throw new Error('Certification not found');
			}

			// Delete the certification event
			await deleteNostrEvent(cert.eventId, '1063');

			// Remove from local state
			delete certifications[certId];

			skills = skills.map((skill) => ({
				...skill,
				certifications: skill.certifications.filter((id) => id !== certId)
			}));

			appStore.showSuccessToast('Certification removed successfully!');
		} catch (err) {
			console.error('Failed to remove certification:', err);
			error = err instanceof Error ? err.message : 'Failed to remove certification';
			appStore.showErrorToast(error);
		}
	}
</script>

{#if isInitialLoading}
	<div class="space-y-6">
		<!-- Add New Skill Skeleton -->
		<div class="grid gap-4">
			<div class="form-control">
				<div class="bg-base-300 h-4 w-24 animate-pulse rounded"></div>
				<div class="bg-base-300 mt-2 h-12 w-full animate-pulse rounded"></div>
			</div>

			<div class="form-control">
				<div class="flex justify-between">
					<div class="bg-base-300 h-4 w-32 animate-pulse rounded"></div>
					<div class="bg-base-300 h-4 w-36 animate-pulse rounded"></div>
				</div>
				<div class="bg-base-300 mt-2 h-8 w-full animate-pulse rounded"></div>
				<div class="mt-2 flex w-full justify-between px-2">
					{#each Array(5) as _}
						<div class="bg-base-300 h-3 w-3 animate-pulse rounded"></div>
					{/each}
				</div>
			</div>

			<div class="form-control">
				<div class="bg-base-300 h-10 w-full animate-pulse rounded"></div>
			</div>
		</div>

		<!-- Skills List Skeleton -->
		<div class="space-y-4">
			<div class="bg-base-300 h-6 w-32 animate-pulse rounded"></div>

			<div class="grid grid-cols-1 gap-4">
				{#each Array(2) as _}
					<div class="card border-base-content rounded-2xl border shadow-sm">
						<div class="card-body p-4">
							<div class="flex items-start justify-between">
								<div class="bg-base-300 h-6 w-48 animate-pulse rounded"></div>
								<div class="bg-base-300 h-6 w-6 animate-pulse rounded-full"></div>
							</div>

							<div class="mt-2 flex items-center gap-2">
								<div class="bg-base-300 h-4 w-20 animate-pulse rounded"></div>
								<div class="flex gap-1">
									{#each Array(5) as _}
										<div class="bg-base-300 h-4 w-4 animate-pulse rounded-full"></div>
									{/each}
								</div>
							</div>

							<div class="mt-2 flex items-center gap-2">
								<div class="bg-base-300 h-6 w-20 animate-pulse rounded-full"></div>
								<div class="bg-base-300 h-6 w-24 animate-pulse rounded-full"></div>
							</div>

							<div class="mt-2 flex items-center gap-2">
								<div class="bg-base-300 h-4 w-32 animate-pulse rounded"></div>
								<div class="bg-base-300 h-6 w-16 animate-pulse rounded"></div>
							</div>
						</div>
					</div>
				{/each}
			</div>
		</div>
	</div>
{:else}
	<div class="space-y-6">
		<!-- Add New Skill -->
		<div class="grid gap-4">
			<div class="form-control">
				<label class="label" for="newSkillName">
					<span class="label-text font-medium">{$t('profile.skills.skill_name')}</span>
				</label>
				<input
					type="text"
					id="newSkillName"
					bind:value={newSkillName}
					class="input input-bordered w-full"
					placeholder={$t('profile.skills.skill_name_placeholder')}
				/>
			</div>

			<div class="form-control">
				<label class="label" for="newSkillLevel">
					<span class="label-text font-medium">{$t('profile.skills.proficiency')}</span>
					<span class="label-text-alt">1 = {$t('profile.skills.proficiency_beginner')}, 5 = {$t('profile.skills.proficiency_expert')}</span>
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
					{#if isLoading}
						<span class="loading loading-spinner"></span>
					{/if}
					{$t('profile.skills.add_skill')}
				</button>
			</div>
		</div>

		<!-- Skills List -->
		{#if skills.length > 0}
			<div class="space-y-4">
				<h3 class="text-lg font-medium">{$t('profile.skills.title')}</h3>

				<div class="grid grid-cols-1 gap-4">
					{#each skills as skill, i}
						<div class="card border-base-content rounded-2xl border shadow-sm">
							<div class="card-body p-4">
								<div class="flex items-start justify-between">
									<h3 class="card-title">{skill.name}</h3>
									<button
										aria-label={$t('profile.skills.delete_confirm')}
										class="btn btn-circle btn-accent btn-xs"
										onclick={() => removeSkill(i)}
										disabled={isLoading}
									>
										✕
									</button>
								</div>

								<!-- Skill Level -->
								<div class="flex items-center gap-2">
									<label class="pr-2 text-sm font-medium" for={`rating-${i}`}>{$t('profile.skills.proficiency')}</label>
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
										{$t('profile.skills.certifications')} ({skill.certifications.length})
									</span>
									<button
										class="btn btn-ghost btn-outline btn-xs"
										onclick={() => {
											selectedSkill = skill;
											isAddingCertificate = true;
										}}
									>
										{$t('profile.skills.add_certification')}
									</button>
								</div>

								<!-- Add Certificate Form -->
								{#if isAddingCertificate && selectedSkill?.id === skill.id}
									<form method="dialog" class="bg-base-200 space-y-4 rounded-xl px-2 py-4">
										<!-- Certification Name -->
										<div class="form-control">
											<label class="label" for="certificationName">
												<span class="label-text">{$t('profile.skills.cert_name')}</span>
											</label>
											<input
												type="text"
												id="certificationName"
												bind:value={certification.name}
												class="input input-bordered w-full"
												placeholder={$t('profile.skills.cert_name_placeholder')}
												required
											/>
										</div>

										<!-- Issuing Organization -->
										<div class="form-control">
											<label class="label" for="certificationIssuer">
												<span class="label-text">{$t('profile.skills.cert_issuer')}</span>
											</label>
											<input
												type="text"
												id="certificationIssuer"
												bind:value={certification.issuer}
												class="input input-bordered w-full"
												placeholder={$t('profile.skills.cert_issuer_placeholder')}
												required
											/>
										</div>

										<!-- Issue Date -->
										<div class="form-control">
											<DatePicker
												label={$t('profile.skills.cert_date')}
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
												<span class="label-text">{$t('profile.skills.cert_upload')}</span>
											</label>
											<Uploader
												id="certificationFile"
												label={$t('profile.skills.cert_upload')}
												maxFiles={1}
												className="w-full"
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
												{$t('profile.skills.add_certification')}
											</button>
											<button
												class="btn btn-ghost btn-sm btn-outline"
												onclick={() => (isAddingCertificate = false)}>{$t('common.close')}</button
											>
										</div>
									</form>
								{/if}

								<!-- Certifications List -->
								{#if skill.certifications.length > 0}
									<div class="mt-2 space-y-2">
										{#each skill.certifications as certId}
											{@const cert = certifications[certId]}
											{#if cert}
												<div
													class="bg-base-200 flex flex-row items-center justify-between rounded-lg p-2 text-xs"
												>
													<div>
														<div class="font-medium">{cert.name}</div>
														<div class="text-base-content/70">
															{cert.issuer} • {new Date(cert.date).toLocaleDateString()}
														</div>
													</div>
													<button
														class="btn btn-ghost btn-xs btn-circle btn-outline text-error/75"
														onclick={() => removeCertification(cert.eventId)}
													>
														✕
													</button>
												</div>
											{/if}
										{/each}
									</div>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</div>
		{:else}
			<div class="alert alert-outline">
				<span>{$t('profile.skills.no_skills')}</span>
			</div>
		{/if}

		<!-- Error Message -->
		{#if error}
			<div class="alert alert-error">
				<span>{error}</span>
			</div>
		{/if}
	</div>

	<!-- Success Toast -->
	<div id="skills-toast-success" class="toast toast-end" style="display: none;">
		<div class="alert alert-success">
			<span>{$t('profile.skills.save_success')}</span>
		</div>
	</div>
{/if}
