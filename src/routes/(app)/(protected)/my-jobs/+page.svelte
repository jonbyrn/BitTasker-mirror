<script lang="ts">
	import { resolve } from '$app/paths';
	import { t } from 'svelte-i18n';
	import { authState } from '$lib/stores/auth.store';
</script>

<div class="mx-auto flex w-full max-w-lg flex-col gap-3 px-4 py-6" data-testid="my-jobs">
	<h1 class="text-2xl font-bold">{$t('my_jobs.title')}</h1>
	{#if !$authState.isAuthenticated}
		<a
			class="btn btn-primary min-h-14 text-lg"
			href={resolve('/auth/login')}
			data-testid="my-jobs-signin"
		>
			{$t('my_jobs.sign_in')}
		</a>
	{:else}
		<a
			class="btn btn-lg btn-secondary min-h-16 justify-start text-lg"
			href={resolve('/hiring/my-tasks')}
			data-testid="my-jobs-posted"
		>
			{$t('my_jobs.posted')}
		</a>
		<a
			class="btn btn-lg btn-secondary min-h-16 justify-start text-lg"
			href={resolve('/earning/bids')}
			data-testid="my-jobs-doing"
		>
			{$t('my_jobs.doing')}
		</a>
	{/if}
</div>
