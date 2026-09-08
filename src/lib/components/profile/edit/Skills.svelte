<script lang="ts">
	import { t } from 'svelte-i18n';
	import { publishSkillsUpdate } from '$lib/nostr/profile';
	import { appStore } from '$lib/stores/app.store';
	import { user } from '$lib/stores/user.store';
	import type { Skill } from '$lib/types/profile.d';

	let {
		onComplete = (_completed: boolean, _fromSave?: boolean) => {}
	}: {
		onComplete?: (completed: boolean, fromSave?: boolean) => void;
	} = $props();

	let skills = $state<string[]>([]);
	let draft = $state('');
	let isSaving = $state(false);
	let errorMessage = $state('');

	// Seed from the loaded profile when available.
	$effect(() => {
		const existing = ($user as { skills?: Array<{ name: string } | string> })?.skills;
		if (existing && skills.length === 0) {
			skills = existing.map((s) => (typeof s === 'string' ? s : s.name)).filter(Boolean);
		}
	});

	function addSkill(): void {
		const value = draft.trim();
		if (!value || skills.includes(value)) return;
		skills = [...skills, value];
		draft = '';
		onComplete(skills.length > 0, false);
	}

	function removeSkill(index: number): void {
		skills = skills.filter((_, i) => i !== index);
		onComplete(skills.length > 0, false);
	}

	async function handleSubmit(): Promise<void> {
		isSaving = true;
		errorMessage = '';
		try {
			const payload: Skill[] = skills.map((name) => ({ name, level: 1 }) as Skill);
			await publishSkillsUpdate(payload);
			appStore.showSuccessToast($t('profile.page.sections.skills'));
			onComplete(true, true);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Failed to save skills';
			appStore.showErrorToast(errorMessage);
		} finally {
			isSaving = false;
		}
	}
</script>

<form
	data-testid="skills-form"
	onsubmit={(e) => {
		e.preventDefault();
		void handleSubmit();
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

		<button type="submit" class="btn btn-primary" disabled={isSaving} data-testid="save-skills">
			{#if isSaving}<span class="loading loading-spinner loading-sm"></span>{/if}
			{$t('common.save', { default: 'Save' })}
		</button>
	</div>
</form>
