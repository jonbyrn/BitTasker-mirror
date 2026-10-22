<script lang="ts">
	import { resolve } from '$app/paths';
	import { LOGGED_OUT_MENU_SECTIONS } from '$lib/utils/constants/menu.constants';

	let { t }: { t: (key: string) => string } = $props();

	let open = $state(false);

	function close() {
		open = false;
	}

	function toggle() {
		open = !open;
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') close();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<button
	type="button"
	class="btn btn-ghost btn-circle btn-sm public-menu-button shrink-0 lg:hidden"
	aria-label={open ? t('navbar.close_menu') : t('navbar.menu')}
	aria-expanded={open}
	aria-controls="public-mobile-menu"
	data-testid="public-mobile-menu"
	onclick={toggle}
>
	<span class="flex h-5 w-5 flex-col items-center justify-center" aria-hidden="true">
		<span
			class={[
				'bg-primary block h-0.5 w-4 transition-transform duration-200',
				open && 'translate-y-[5px] rotate-45'
			]}
		></span>
		<span class={['bg-primary my-0.5 block h-0.5 w-4', open && 'opacity-0']}></span>
		<span
			class={[
				'bg-primary block h-0.5 w-4 transition-transform duration-200',
				open && '-translate-y-[5px] -rotate-45'
			]}
		></span>
	</span>
</button>

{#if open}
	<div class="lg:hidden">
		<button
			type="button"
			class="fixed inset-0 z-40 bg-black/40"
			aria-label={t('navbar.close_menu')}
			data-testid="public-mobile-backdrop"
			onclick={close}
		></button>
		<div
			id="public-mobile-menu"
			role="dialog"
			aria-modal="true"
			aria-label={t('navbar.menu')}
			tabindex="-1"
			data-testid="public-mobile-sheet"
			class="public-mobile-sheet font-poppins bg-base-100 border-base-300 fixed inset-x-0 top-16 z-50 max-h-[calc(100dvh-4rem)] overflow-y-auto rounded-b-2xl border-b px-4 pt-3 pb-6 shadow-lg"
		>
			<nav class="flex flex-col gap-1" aria-label={t('navbar.menu')}>
				{#each LOGGED_OUT_MENU_SECTIONS as section (section.id)}
					{#if section.id === 'how-it-works'}
						<a
							href={resolve('/how-it-works')}
							class="font-poppins text-base-content hover:text-primary rounded-lg px-2 py-3 text-base font-semibold"
							data-testid="sheet-how-it-works"
							onclick={close}
						>
							{t(section.label)}
						</a>
					{:else}
						<p
							class="font-poppins text-base-content/70 mt-3 px-2 text-xs font-bold tracking-wide uppercase"
						>
							{t(section.label)}
						</p>
						{#each section.items as item (item.label)}
							<a
								href={resolve((item.href || '/') as '/')}
								class="text-base-content hover:bg-base-200 hover:text-primary flex items-center gap-2 rounded-lg px-2 py-2.5"
								onclick={close}
							>
								<item.icon class="text-primary shrink-0" />
								<span>{t(item.label)}</span>
							</a>
						{/each}
					{/if}
				{/each}
			</nav>
			<div class="mt-4 flex gap-2">
				<a
					href={resolve('/auth/login')}
					class="btn btn-secondary min-w-0 flex-1 whitespace-nowrap"
					data-testid="sheet-login"
					onclick={close}
				>
					{t('navbar.login')}
				</a>
				<a
					href={resolve('/auth/signup')}
					class="btn btn-primary min-w-0 flex-1 whitespace-nowrap"
					data-testid="sheet-signup"
					onclick={close}
				>
					{t('navbar.signup')}
				</a>
			</div>
		</div>
	</div>
{/if}
