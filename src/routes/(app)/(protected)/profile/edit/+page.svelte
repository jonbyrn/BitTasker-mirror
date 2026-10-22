<script lang="ts">
	import { t } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { appStore } from '$lib/stores/app.store';
	import PersonalInfo from '$lib/components/profile/edit/PersonalInfo.svelte';
	import Skills from '$lib/components/profile/edit/Skills.svelte';
	import Portfolio from '$lib/components/profile/edit/Portfolio.svelte';
	import VideoIntro from '$lib/components/profile/edit/VideoIntro.svelte';
	import Availability from '$lib/components/profile/edit/Availability.svelte';
	import type { SectionSaveResult } from '$lib/components/profile/edit/section-save';

	let completedSections = $state({
		personalInfo: false,
		// location: false,
		skills: false,
		portfolio: false,
		videoIntro: false,
		availability: false
		// aiAssistant: false
	});

	let isCollapsed = $state({
		personalInfo: false,
		// location: false,
		skills: true,
		portfolio: true,
		videoIntro: true,
		availability: true
		// aiAssistant: false
	});

	onMount(() => {
		const hash = window.location.hash.replace('#', '');
		if (hash === 'profile-about') isCollapsed.personalInfo = false;
		if (hash === 'profile-skills') isCollapsed.skills = false;
		if (!hash) return;
		requestAnimationFrame(() => {
			document.getElementById(hash)?.scrollIntoView({ block: 'start' });
		});
	});

	type SectionEditor = { save: () => Promise<SectionSaveResult> };

	let personalInfoComponent = $state<SectionEditor | undefined>();
	let skillsComponent = $state<SectionEditor | undefined>();
	let portfolioComponent = $state<SectionEditor | undefined>();
	let videoIntroComponent = $state<SectionEditor | undefined>();
	let availabilityComponent = $state<SectionEditor | undefined>();

	// Global save state
	let isSaving = $state(false);
	let saveError = $state('');

	// Section completion handlers
	function handleSectionComplete(
		section: keyof typeof completedSections,
		completed: boolean,
		fromSave?: boolean
	) {
		completedSections[section] = completed;
		// Show toast only when save occurs, not on every completion change
		if (fromSave) {
			appStore.showSuccessToast($t('profile.page.profile_updated'));
		}
	}

	// Calculate overall progress
	let progress = $derived(
		(Object.values(completedSections).filter(Boolean).length /
			Object.keys(completedSections).length) *
			100
	);

	// Save the sections the person changed, then leave. Signing reuses the open session.
	async function saveAllAndExit() {
		isSaving = true;
		saveError = '';

		try {
			const editors = [
				personalInfoComponent,
				skillsComponent,
				portfolioComponent,
				videoIntroComponent,
				availabilityComponent
			];
			for (const editor of editors) {
				if (!editor) continue;
				const result = await editor.save();
				if (!result.ok) {
					saveError = result.error;
					return;
				}
			}

			await goto(resolve('/profile'));
		} catch (error) {
			console.error('Error saving profile:', error);
			saveError = error instanceof Error ? error.message : 'Failed to save profile';
		} finally {
			isSaving = false;
		}
	}
</script>

{#snippet cardTitle(title: string, section: keyof typeof isCollapsed)}
	<div
		role="button"
		tabindex="0"
		aria-label="Toggle {title}"
		class="flex items-center justify-between"
		onclick={() => (isCollapsed[section] = !isCollapsed[section])}
		onkeydown={() => {}}
	>
		<h3 class="card-title">
			<span class="relative mr-3 flex size-3">
				<span
					class="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 {completedSections[
						section
					]
						? 'bg-success'
						: 'bg-error'}"
				></span>
				<span
					class="relative inline-flex size-3 rounded-full {completedSections[section]
						? 'bg-success'
						: 'bg-error'}"
				></span>
			</span>
			<span>
				{title}
			</span>
		</h3>
		<button
			aria-label={$t('profile.page.collapse')}
			class="btn btn-sm btn-ghost btn-circle"
			onclick={(event) => {
				event.stopPropagation();
				isCollapsed[section] = !isCollapsed[section];
			}}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="20"
				height="20"
				viewBox="0 0 24 24"
				class="{isCollapsed[section] ? 'rotate-0' : 'rotate-180'} transition-all duration-150"
			>
				<path
					fill="#fff"
					d="M7 16H5v-2h2v-2h2v-2h2V8h2v2h2v2h2v2h2v2h-2v-2h-2v-2h-2v-2h-2v2H9v2H7z"
				/>
			</svg>
		</button>
	</div>
{/snippet}

<!-- Mismas dimensiones que Mi Panel -->
<div class="mx-auto h-full max-w-6xl px-2 py-6 md:px-0 md:py-0">
	<div class="mb-4">
		<div class="flex items-center justify-between">
			<div>
				<h3 class="">{$t('profile.page.edit_profile')}</h3>
				<p class="text-base-content/70">{$t('profile.page.completion_desc')}</p>
			</div>
		</div>
	</div>

	<!-- Progress Bar -->
	<div class="bg-base-100 border-base-content/50 sticky top-1 z-10 mt-4 mb-4 rounded-xl border p-4">
		<div class="mb-1 flex justify-between">
			<span class="text-sm font-medium">{$t('profile.page.completion')}</span>
			<span class="text-sm font-medium">{Math.round(progress)}%</span>
		</div>
		<div class="bg-base-200 h-2.5 w-full rounded-full">
			<div
				class="bg-primary h-2.5 rounded-full transition-all duration-500 ease-in-out"
				style="width: {progress}%"
			></div>
		</div>
	</div>

	<!-- Profile Sections -->
	<div class="space-y-4">
		<!-- Personal Information -->
		<div class="card bg-base-100 rounded-xl shadow-lg" id="profile-about">
			<div class="card-body p-4">
				{@render cardTitle?.($t('profile.page.sections.personal_info'), 'personalInfo')}
				<div
					class="overflow-hidden transition-[max-height] duration-300 ease-in-out"
					style:max-height={isCollapsed.personalInfo ? '0' : '200rem'}
				>
					<PersonalInfo
						showSave={false}
						bind:this={personalInfoComponent}
						onComplete={(completed, fromSave) =>
							handleSectionComplete('personalInfo', completed, fromSave)}
					/>
				</div>
			</div>
		</div>

		<!-- Skills -->
		<div class="card bg-base-100 rounded-xl shadow-lg" id="profile-skills">
			<div class="card-body p-4">
				{@render cardTitle?.($t('profile.page.sections.skills'), 'skills')}
				<div
					class="overflow-hidden transition-[max-height] duration-300 ease-in-out"
					style:max-height={isCollapsed.skills ? '0' : '200rem'}
				>
					<Skills
						showSave={false}
						bind:this={skillsComponent}
						onComplete={(completed, fromSave) =>
							handleSectionComplete('skills', completed, fromSave)}
					/>
				</div>
			</div>
		</div>

		<!-- Portfolio -->
		<div class="card bg-base-100 rounded-xl shadow-lg">
			<div class="card-body p-4">
				{@render cardTitle?.($t('profile.page.sections.portfolio'), 'portfolio')}
				<div
					class="overflow-hidden transition-[max-height] duration-300 ease-in-out"
					style:max-height={isCollapsed.portfolio ? '0' : '200rem'}
				>
					<Portfolio
						showSave={false}
						bind:this={portfolioComponent}
						onComplete={(completed, fromSave) =>
							handleSectionComplete('portfolio', completed, fromSave)}
					/>
				</div>
			</div>
		</div>

		<!-- Video Introduction -->
		<div class="card bg-base-100 rounded-xl shadow-lg">
			<div class="card-body p-4">
				{@render cardTitle?.($t('profile.page.sections.video'), 'videoIntro')}
				<div
					class="overflow-hidden transition-[max-height] duration-300 ease-in-out"
					style:max-height={isCollapsed.videoIntro ? '0' : '200rem'}
				>
					<VideoIntro
						showSave={false}
						bind:this={videoIntroComponent}
						onComplete={(completed, fromSave) =>
							handleSectionComplete('videoIntro', completed, fromSave)}
					/>
				</div>
			</div>
		</div>

		<!-- Availability Calendar -->
		<div class="card bg-base-100 rounded-xl shadow-lg">
			<div class="card-body p-4">
				{@render cardTitle?.($t('profile.page.sections.availability'), 'availability')}
				<div
					class="overflow-hidden transition-[max-height] duration-300 ease-in-out"
					style:max-height={isCollapsed.availability ? '0' : '200rem'}
				>
					<Availability
						showSave={false}
						bind:this={availabilityComponent}
						onComplete={(completed, fromSave) =>
							handleSectionComplete('availability', completed, fromSave)}
					/>
				</div>
			</div>
		</div>

		<!-- AI Assistant -->
		<!-- <div class="card bg-base-100 rounded-xl shadow-lg">
				<div class="card-body p-4">
					<h2 class="card-title">AI Assistant</h2>
					<AIAssistant
						{user}
						onComplete={(completed) => updateSectionCompletion('services', completed)}
					/>
				</div>
			</div> -->
	</div>

	<!-- Error Message -->
	{#if saveError}
		<div class="alert alert-error mt-4">
			<span>{saveError}</span>
		</div>
	{/if}

	<!-- Bottom Save Button -->
	<div class="mt-8 flex justify-center">
		<button
			type="button"
			class="btn btn-primary btn-lg"
			onclick={saveAllAndExit}
			disabled={isSaving}
			data-testid="profile-edit-save"
		>
			{#if isSaving}
				<span class="loading loading-spinner loading-sm"></span>
			{/if}
			{$t('common.save', { default: 'Save' })}
		</button>
	</div>
</div>
