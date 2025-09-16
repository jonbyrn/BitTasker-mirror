<script lang="ts">
	import { t } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import PersonalInfo from './_components/PersonalInfo.svelte';
	import Skills from './_components/Skills.svelte';
	import Portfolio from './_components/Portfolio.svelte';
	import VideoIntro from './_components/VideoIntro.svelte';
	import Availability from './_components/Availability.svelte';
	import StandardServices from './_components/StandardServices.svelte';

	let completedSections = $state({
		personalInfo: false,
		// location: false,
		skills: false,
		portfolio: false,
		videoIntro: false,
		availability: false,
		standardServices: false
		// aiAssistant: false
	});

	let isCollapsed = $state({
		personalInfo: false,
		// location: false,
		skills: true,
		portfolio: true,
		videoIntro: true,
		availability: true,
		standardServices: true
		// aiAssistant: false
	});

	// Component references for save functionality
	let personalInfoComponent: PersonalInfo;
	let skillsComponent: Skills;
	let portfolioComponent: Portfolio;
	let videoIntroComponent: VideoIntro;
	let availabilityComponent: Availability;
	let standardServicesComponent: StandardServices;

	// Global save state
	let isSaving = $state(false);
	let saveError = $state('');

	// Section completion handlers
	function handleSectionComplete(section: keyof typeof completedSections, completed: boolean) {
		completedSections[section] = completed;
	}

	// Calculate overall progress
	let progress = $derived(
		(Object.values(completedSections).filter(Boolean).length /
			Object.keys(completedSections).length) *
			100
	);

	// Save all and exit function
	async function saveAllAndExit() {
		isSaving = true;
		saveError = '';

		try {
			// Trigger save for all components by dispatching submit events
			const components = [
				personalInfoComponent,
				skillsComponent,
				portfolioComponent,
				videoIntroComponent,
				availabilityComponent,
				standardServicesComponent
			];

			// Find all forms in the components and submit them
			const forms = document.querySelectorAll('form');
			const submitPromises = Array.from(forms).map(form => {
				return new Promise<void>((resolve) => {
					const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
					form.dispatchEvent(submitEvent);
					// Give a small delay to allow the form submission to process
					setTimeout(resolve, 100);
				});
			});

			await Promise.all(submitPromises);

			// Wait a bit more for all saves to complete
			await new Promise(resolve => setTimeout(resolve, 1000));

			// Navigate back to profile view
			goto('/dashboard/profile');
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
		onclick={() => {
			if (isCollapsed[section]) {
				isCollapsed[section] = !isCollapsed[section];
			}
		}}
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

<div class="mx-auto max-w-7xl p-4">
	<div class="mb-4">
		<div class="flex items-center justify-between">
			<div>
				<h3 class="">{$t('profile.page.edit_profile')}</h3>
				<p class="text-base-content/70">{$t('profile.page.completion_desc')}</p>
			</div>
			<button 
				class="btn btn-primary" 
				onclick={saveAllAndExit}
				disabled={isSaving}
			>
				{#if isSaving}
					<span class="loading loading-spinner loading-sm"></span>
				{/if}
				Save all and Exit
			</button>
		</div>
	</div>

	<!-- Progress Bar -->
	<div class="bg-base-100 border-base-content/50 sticky top-1 z-10 mt-4 mb-4 rounded-xl border p-4">
		<div class="mb-1 flex justify-between">
			<span class="text-sm font-medium">{$t('profile.page.completion')}</span>
			<span class="text-sm font-medium">{Math.round(progress)}%</span>
		</div>
		<div class="bg-base-200 h-2.5 w-full rounded-full">
			<div class="bg-primary h-2.5 rounded-full" style="width: {progress}%"></div>
		</div>
	</div>

	<!-- Profile Sections -->
	<div class="space-y-4">
		<!-- Personal Information -->
		<div class="card bg-base-100 rounded-xl shadow-lg">
			<div class="card-body">
				{@render cardTitle($t('profile.page.sections.personal_info'), 'personalInfo')}
				<div class="overflow-hidden" style:height={isCollapsed.personalInfo ? '1px' : 'auto'}>
					<PersonalInfo
						bind:this={personalInfoComponent}
						onComplete={(completed) => handleSectionComplete('personalInfo', completed)}
					/>
				</div>
			</div>
		</div>

		<!-- Skills -->
		<div class="card bg-base-100 rounded-xl shadow-lg">
			<div class="card-body">
				{@render cardTitle($t('profile.page.sections.skills'), 'skills')}
				<div class="overflow-hidden" style:height={isCollapsed.skills ? '0' : 'auto'}>
					<Skills 
						bind:this={skillsComponent}
						onComplete={(completed) => handleSectionComplete('skills', completed)} 
					/>
				</div>
			</div>
		</div>

		<!-- Portfolio -->
		<div class="card bg-base-100 rounded-xl shadow-lg">
			<div class="card-body">
				{@render cardTitle($t('profile.page.sections.portfolio'), 'portfolio')}
				<div class="overflow-hidden" style:height={isCollapsed.portfolio ? '0' : 'auto'}>
					<Portfolio 
						bind:this={portfolioComponent}
						onComplete={(completed) => handleSectionComplete('portfolio', completed)} 
					/>
				</div>
			</div>
		</div>

		<!-- Video Introduction -->
		<div class="card bg-base-100 rounded-xl shadow-lg">
			<div class="card-body">
				{@render cardTitle($t('profile.page.sections.video'), 'videoIntro')}
				<div class="overflow-hidden" style:height={isCollapsed.videoIntro ? '0' : 'auto'}>
					<VideoIntro 
						bind:this={videoIntroComponent}
						onComplete={(completed) => handleSectionComplete('videoIntro', completed)} 
					/>
				</div>
			</div>
		</div>

		<!-- Availability Calendar -->
		<div class="card bg-base-100 rounded-xl shadow-lg">
			<div class="card-body">
				{@render cardTitle($t('profile.page.sections.availability'), 'availability')}
				<div class="overflow-hidden" style:height={isCollapsed.availability ? '0' : 'auto'}>
					<Availability
						bind:this={availabilityComponent}
						onComplete={(completed) => handleSectionComplete('availability', completed)}
					/>
				</div>
			</div>
		</div>

		<!-- Standard Services -->
		<div class="card bg-base-100 rounded-xl shadow-lg">
			<div class="card-body">
				{@render cardTitle($t('profile.page.sections.services'), 'standardServices')}
				<div class="overflow-hidden" style:height={isCollapsed.standardServices ? '0' : 'auto'}>
					<StandardServices
						bind:this={standardServicesComponent}
						onComplete={(completed) => handleSectionComplete('standardServices', completed)}
					/>
				</div>
			</div>
		</div>

		<!-- AI Assistant -->
		<!-- <div class="card bg-base-100 rounded-xl shadow-lg">
				<div class="card-body">
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
			class="btn btn-primary btn-lg" 
			onclick={saveAllAndExit}
			disabled={isSaving}
		>
			{#if isSaving}
				<span class="loading loading-spinner loading-sm"></span>
			{/if}
			Save all and Exit
		</button>
	</div>
</div>
