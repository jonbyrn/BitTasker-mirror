<script lang="ts">
	import { t } from 'svelte-i18n';
	import { publishSkillsUpdate } from '$lib/nostr/profile';
	import { appStore } from '$lib/stores/app.store';
	import { user } from '$lib/stores/user.store';
	import type { Skill } from '$lib/types/profile.d';
	import { sectionFailed, sectionSaved, type SectionSaveResult } from './section-save';

	let {
		onComplete = (_completed: boolean, _fromSave?: boolean) => {},
		showSave = true
	}: {
		onComplete?: (completed: boolean, fromSave?: boolean) => void;
		showSave?: boolean;
	} = $props();

	let skills = $state<string[]>([]);
	let draft = $state('');
	let isSaving = $state(false);
	let errorMessage = $state('');
	let skillsDirty = $state(false);
	let seeded = $state(false);

	// Seed from the loaded profile when available.
	$effect(() => {
		if (seeded || skillsDirty) return;
		const existing = ($user as { skills?: Array<{ name: string } | string> })?.skills;
		if (!existing) return;
		seeded = true;
		if (skills.length === 0) {
			skills = existing.map((s) => (typeof s === 'string' ? s : s.name)).filter(Boolean);
		}
	});

	function addSkill(): void {
		const value = draft.trim();
		if (!value || skills.includes(value)) return;
		skillsDirty = true;
		skills = [...skills, value];
		draft = '';
		onComplete(skills.length > 0, false);
	}

	function removeSkill(index: number): void {
		skillsDirty = true;
		skills = skills.filter((_, i) => i !== index);
		onComplete(skills.length > 0, false);
	}

	export async function save(): Promise<SectionSaveResult> {
		if (!skillsDirty) return sectionSaved();
		isSaving = true;
		errorMessage = '';
		try {
			const payload: Skill[] = skills.map((name) => ({ name, level: 1 }) as Skill);
			await publishSkillsUpdate(payload);
			skillsDirty = false;
			appStore.showSuccessToast($t('profile.page.sections.skills'));
			onComplete(true, true);
			return sectionSaved();
		} catch (error) {
			const failed = sectionFailed(error, 'Failed to save skills');
			errorMessage = failed.error;
			appStore.showErrorToast(errorMessage);
			return failed;
		} finally {
			isSaving = false;
		}
	}
</script>

<form
	data-testid="skills-form"
	onsubmit={(e) => {
		e.preventDefault();
		void save();
	}}
>
	<div class="space-y-3">
		<div class="join w-full">
			<input
				class="input input-bordered join-item flex-1"
				placeholder={$t('profile.page.skills.add_placeholder', { default: 'Add a skill' })}
				bind:value={draft}
				data-testid="skill-input"
			/>
			<button
				type="button"
				class="btn btn-outline join-item"
				onclick={addSkill}
				data-testid="add-skill"
			>
				{$t('common.add', { default: 'Add' })}
			</button>
		</div>

		{#if skills.length > 0}
			<div class="flex flex-wrap gap-2" data-testid="skills-list">
				{#each skills as skill, i (skill)}
					<span class="badge badge-outline gap-1">
						{skill}
						<button
							type="button"
							class="btn btn-ghost btn-xs btn-circle"
							aria-label={$t('common.remove', { default: 'Remove' })}
							onclick={() => removeSkill(i)}>×</button
						>
					</span>
				{/each}
			</div>
		{/if}

		{#if errorMessage}
			<div class="alert alert-error text-sm" role="alert">{errorMessage}</div>
		{/if}

		{#if showSave}
			<button type="submit" class="btn btn-primary" disabled={isSaving} data-testid="save-skills">
				{#if isSaving}<span class="loading loading-spinner loading-sm"></span>{/if}
				{$t('common.save', { default: 'Save' })}
			</button>
		{/if}
	</div>
</form>
