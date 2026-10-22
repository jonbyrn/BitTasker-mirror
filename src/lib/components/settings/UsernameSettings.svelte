<script lang="ts">
	import { t } from 'svelte-i18n';
	import authService from '$lib/api/services/auth.service';
	import { isAuthServiceUnavailable } from '$lib/utils/helpers/auth-unavailable';
	import { appStore } from '$lib/stores/app.store';
	import { user } from '$lib/stores/user.store';
	import {
		cachedProfileUsername,
		isGeneratedAccountName,
		readChosenUsername,
		rememberChosenUsername,
		usernameInputValue
	} from '$lib/utils/helpers/account-username';
	import { normalizeSimpleUsername, simpleUsernameIssue } from '$lib/utils/helpers/simpleUsername';

	let username = $state('');
	let touched = $state(false);
	let saving = $state(false);
	let errorMessage = $state('');

	const generatedName = $derived(
		isGeneratedAccountName($user.username) ? ($user.username?.trim() ?? '') : ''
	);

	$effect(() => {
		if (touched) return;
		const next = usernameInputValue({
			store: $user.username,
			cached: cachedProfileUsername(),
			chosen: readChosenUsername()
		});
		if (!next) return;
		username = next;
	});

	function setUsername(event: Event): void {
		touched = true;
		username = event.currentTarget instanceof HTMLInputElement ? event.currentTarget.value : '';
		errorMessage = '';
	}

	async function saveUsername(): Promise<void> {
		const name = normalizeSimpleUsername(username);
		const issue = simpleUsernameIssue(name);
		errorMessage = '';
		if (issue) {
			errorMessage = $t(`settings.username.errors.${issue}`);
			return;
		}
		saving = true;
		try {
			const current = ($user.username ?? '').trim().toLowerCase();
			if (name !== current) {
				const available = await Promise.race([
					authService.checkUsernameAvailability(name),
					new Promise<boolean>((_, reject) =>
						setTimeout(() => reject(new Error('username check timed out')), 4000)
					)
				]);
				if (!available) {
					errorMessage = $t('settings.username.errors.already_taken');
					return;
				}
			}
			rememberChosenUsername(name);
			user.updateProfile({ username: name });
			username = name;
			appStore.showSuccessToast($t('settings.username.saved'));
		} catch (err) {
			errorMessage = isAuthServiceUnavailable(err)
				? $t('settings.username.errors.service_unavailable')
				: $t('settings.username.errors.check_failed');
		} finally {
			saving = false;
		}
	}
</script>

<form
	class="border-base-300 bg-base-100 mb-4 rounded-2xl border p-4"
	data-testid="settings-username"
	novalidate
	onsubmit={(event) => {
		event.preventDefault();
		void saveUsername();
	}}
>
	<h4 class="text-sm font-semibold">{$t('settings.username.title')}</h4>
	<p class="text-base-content/60 mt-1 text-xs">{$t('settings.username.description')}</p>
	{#if generatedName}
		<p class="text-warning mt-2 text-xs" data-testid="settings-username-generated">
			{$t('settings.username.generated', { values: { name: generatedName } })}
		</p>
	{/if}
	<label class="mt-3 block">
		<span class="label-text mb-1 block text-sm">{$t('settings.username.label')}</span>
		<input
			class="input input-bordered w-full"
			value={username}
			oninput={setUsername}
			placeholder={$t('settings.username.placeholder')}
			autocapitalize="off"
			autocorrect="off"
			spellcheck="false"
			data-testid="settings-username-input"
		/>
	</label>
	<p class="text-base-content/60 mt-1 text-xs">{$t('settings.username.help')}</p>
	{#if errorMessage}
		<p class="text-error mt-2 text-sm" role="alert" data-testid="settings-username-error">
			{errorMessage}
		</p>
	{/if}
	<button
		type="button"
		class="btn btn-primary mt-3"
		disabled={saving}
		data-testid="settings-username-save"
		onclick={() => void saveUsername()}
	>
		{#if saving}<span class="loading loading-spinner loading-sm"></span>{/if}
		{$t('settings.username.save')}
	</button>
</form>
