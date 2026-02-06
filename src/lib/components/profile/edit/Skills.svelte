<script lang="ts">
	import type { Skill, SkillCertification } from '$lib/types/profile.d';
	import { t, locale } from 'svelte-i18n';
	import { onMount, onDestroy } from 'svelte';
	import { appStore } from '$lib/stores/app.store';
	import {
		publishSkillsUpdate,
		uploadCertification,
		subscribeToProfileUpdates,
		deleteNostrEvent
	} from '$lib/nostr/profile';
	import Uploader from '$lib/components/Uploader.svelte';
	import DateInput from '$lib/components/date/DateInput.svelte';
	import KINDS from '$lib/utils/constants/kinds';
	import { ensureAbsoluteVerificationUrl } from '$lib/utils/helpers/verificationUrl';

	// Helper function to get translated skill name
	function getTranslatedSkillName(skill: Skill): string {
		const currentLang = $locale || 'en';
		const originalName = skill.name || '';
		
		// If no translations, return original
		if (!skill.translations) {
			return originalName;
		}

		// If current language is source language, return original
		if (skill.translations.sourceLanguage === currentLang) {
			return originalName;
		}

		// Get translation for current language
		const translation = skill.translations.translations[currentLang];
		if (translation) {
			return translation.name || originalName;
		}

		// Fallback to original
		return originalName;
	}


	let { onComplete, onRegisterSave } = $props<{
		onComplete: (completed: boolean, fromSave?: boolean) => void;
		onRegisterSave?: (saveFn: () => Promise<void>) => void;
	}>();

	// Local state
	let skills = $state<Skill[]>([]);
	let certifications = $state<{ [key: string]: SkillCertification }>({});
	let newSkillName = $state('');
	let newSkillLevel = $state(3);
	let isLoading = $state(false);
	let error = $state('');
	let selectedSkill = $state<Skill | null>(null);
	let isAddingCertificate = $state(false);
	let isInitialLoading = $state(false);
	let cleanup: (() => void) | null = null;
	let certification = $state<{
		name: string;
		issuer: string;
		date: string;
		file: File | null;
		verificationUrl: string;
	}>({
		name: '',
		issuer: '',
		date: '',
		file: null,
		verificationUrl: ''
	});

	// Register save handler for "Save all and exit"
	onMount(() => {
		onRegisterSave?.(() => handleSubmit());
	});

	// Subscribe to skills updates
	onMount(async () => {
		cleanup = await subscribeToProfileUpdates(
			(event) => {
				try {
					isInitialLoading = true;
					if (event.kind === KINDS.PROFILE_SKILLS && event.tags.find((t) => t[0] === 'd' && t[1] === 'skills')) {
						// Handle skills update
						const skillsData = JSON.parse(event.content);
						if (Array.isArray(skillsData)) {
							skills = skillsData.map((skill) => ({
								...skill,
								id: skill.id
							}));
						}
					} else if (
						event.kind === KINDS.FILE_METADATA &&
						event.tags.find((t) => t[0] === 'd' && t[1] === 'certification')
					) {
						// Handle certification (assign new object so list updates reactively)
						const certData = JSON.parse(event.content);
						const skillId = event.tags.find((t) => t[0] === 'skill')?.[1];
						if (!skillId) return;

						certifications = {
							...certifications,
							[event.id]: {
								eventId: event.id,
								skillId,
								name: certData.name,
								issuer: certData.issuer,
								date: certData.date,
								fileUrl: certData.fileUrl,
								verified: false,
								...(certData.verificationUrl && { verificationUrl: certData.verificationUrl })
							}
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
			await deleteNostrEvent(cert.eventId, KINDS.FILE_METADATA.toString());
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
		if (!selectedSkill?.id) {
			error = $t('profile.skills.skill_not_found');
			return;
		}
		if (
			!certification.name ||
			!certification.issuer ||
			!certification.date ||
			!certification.file
		) {
			error = $t('profile.skills.fill_certification_fields');
			return;
		}

		const skill = selectedSkill!;
		const skillIndex = skills.findIndex((s) => s.id === skill.id);
		if (skillIndex === -1) {
			error = $t('profile.skills.skill_not_found');
			return;
		}

		const verificationUrlTrimmed = certification.verificationUrl?.trim() || undefined;
		isLoading = true;
		try {
			const certId = await uploadCertification({
				skillId: skill.id,
				name: certification.name,
				issuer: certification.issuer,
				date: certification.date,
				file: certification.file,
				...(verificationUrlTrimmed && { verificationUrl: verificationUrlTrimmed })
			});

			skills[skillIndex].certifications.push(certId);
			certifications = {
				...certifications,
				[certId]: {
					eventId: certId,
					skillId: skill.id,
					name: certification.name,
					issuer: certification.issuer,
					date: certification.date,
					fileUrl: '',
					verified: false,
					...(verificationUrlTrimmed && { verificationUrl: verificationUrlTrimmed })
				}
			};
			handleSubmit();

			certification = { name: '', issuer: '', date: '', file: null, verificationUrl: '' };
			selectedSkill = null;
			isAddingCertificate = false;
			appStore.showSuccessToast($t('profile.skills.certification_added_success'));
		} catch (err) {
			console.error('Failed to add certification:', err);
			error = err instanceof Error ? err.message : $t('profile.skills.failed_to_add_certification');
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

			// Notify completion change from save (triggers toast in parent)
			onComplete(skills.length > 0, true);
		} catch (err) {
			console.error('Failed to save skills:', err);
			error = err instanceof Error ? err.message : $t('profile.skills.failed_to_save_skills');
		} finally {
			isLoading = false;
		}
	}

	// Remove certification
	async function removeCertification(certId: string) {
		const cert = certifications[certId];
		if (!cert) {
			error = $t('profile.skills.certification_not_found');
			appStore.showErrorToast(error);
			return;
		}
		try {
			await deleteNostrEvent(cert.eventId, KINDS.FILE_METADATA.toString());
			certifications = Object.fromEntries(
				Object.entries(certifications).filter(([id]) => id !== certId)
			);
			skills = skills.map((skill) => ({
				...skill,
				certifications: skill.certifications.filter((id) => id !== certId)
			}));
			appStore.showSuccessToast($t('profile.skills.certification_removed_success'));
		} catch (err) {
			console.error('Failed to remove certification:', err);
			error = err instanceof Error ? err.message : $t('profile.skills.failed_to_remove_certification');
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
		<p class="text-base-content/70 text-sm">
			{$t('profile.skills.certifications_hint')}
		</p>
		<!-- Add New Skill -->
		<div class=" gap-4">
			<div class="form-control py-2">
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

			<div class="form-control py-2">
				<label class="label line-clamp-2 md:line-clamp-1" for="newSkillLevel">
					<span class="label-text font-medium">{$t('profile.skills.proficiency')}</span>
					<span class="label-text-alt block md:flex"
						>1 = {$t('profile.skills.proficiency_beginner')}, 5 = {$t(
							'profile.skills.proficiency_expert'
						)}</span
					>
				</label>
				<input
					type="range"
					id="newSkillLevel"
					bind:value={newSkillLevel}
					min="1"
					max="5"
					class="range range-primary range-xs w-full"
				/>
				<div class="flex w-full justify-between text-xs">
					<span>1</span>
					<span>2</span>
					<span>3</span>
					<span>4</span>
					<span>5</span>
				</div>
			</div>

			<div class="flex justify-end">
				<button
					class="btn btn-primary"
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
									<h3 class="card-title">{getTranslatedSkillName(skill)}</h3>
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
									<label class="pr-2 text-sm font-medium" for={`rating-${i}`}
										>{$t('profile.skills.proficiency')}</label
									>
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
											<DateInput
												value={certification.date ? new Date(certification.date) : null}
												onChange={(date: Date | null) => {
													certification.date = date ? date.toISOString() : '';
												}}
												minDate={undefined}
												type="single"
												labelKey="profile.skills.cert_date"
												placeholderKey="common.airdatepicker.select_date"
												maxDate={new Date()}
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

										<!-- Verification URL (e.g. Simple Proof / blockchain proof link) -->
										<div class="form-control">
											<label class="label" for="certificationVerificationUrl">
												<span class="label-text">{$t('profile.skills.verification_url')}</span>
												<span class="label-text-alt">{$t('profile.skills.verification_url_optional')}</span>
											</label>
											<input
												type="url"
												id="certificationVerificationUrl"
												bind:value={certification.verificationUrl}
												class="input input-bordered w-full"
												placeholder={$t('profile.skills.verification_url_placeholder')}
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
													class="bg-base-200 flex flex-row items-center justify-between gap-2 rounded-lg p-2 text-xs"
												>
													<div class="min-w-0 flex-1">
														<div class="font-medium">{cert.name}</div>
														<div class="text-base-content/70">
															{cert.issuer} • {new Date(cert.date).toLocaleDateString()}
														</div>
														{#if cert.verificationUrl}
															<a
																href={ensureAbsoluteVerificationUrl(cert.verificationUrl)}
																target="_blank"
																rel="noopener noreferrer"
																class="link link-primary link-hover mt-1 inline-block text-xs"
															>
																{$t('profile.skills.verify_certification')}
															</a>
														{/if}
													</div>
													<button
														class="btn btn-ghost btn-xs btn-circle btn-outline text-error/75 shrink-0"
														aria-label={$t('common.remove')}
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
			<div class="alert alert-outline alert-error">
				<span>{error}</span>
			</div>
		{/if}
	</div>

	<!-- Success Toast -->
	<div id="skills-toast-success" class="toast toast-end" style="display: none;">
		<div class="alert alert-outline alert-success">
			<span>{$t('profile.skills.save_success')}</span>
		</div>
	</div>
{/if}
