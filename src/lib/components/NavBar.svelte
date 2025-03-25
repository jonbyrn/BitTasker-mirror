<script lang="ts">
	import { darkMode } from '$lib/states/theme';
	import { t } from '$lib/states/i18n';
	import { setLocale } from '$lib/states/i18n';
	import type { Locales } from '$lib/states/i18n';

	const languages: { code: Locales; name: string }[] = [
		{ code: 'en', name: 'English' },
		{ code: 'es', name: 'Español' }
	];

	const handleLanguageChange = async (code: Locales) => {
		try {
			await setLocale(code);
		} catch (error) {
			console.error('Error changing language:', error);
		}
	};
</script>

<div class="navbar bg-base-100/80 absolute top-0 z-50 shadow-md backdrop-blur-2xl">
	<div class="navbar-start">
		<div class="dropdown">
			<div tabindex="0" role="button" class="btn btn-ghost lg:hidden">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-5 w-5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M4 6h16M4 12h8m-8 6h16"
					/>
				</svg>
			</div>
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<ul
				tabindex="0"
				class="menu menu-sm dropdown-content bg-base-100 rounded-box z-[1] mt-4 w-52 rounded-xl p-2 shadow"
			>
				<li><a href="/">{$t('navbar.home')}</a></li>
				<li>
					<a href="/how-it-works">{$t('navbar.how_it_works')}</a>
				</li>
				<li>
					<a href="/onboarding">Onboarding</a>
				</li>
				<li>
					<details class="dropdown">
						<summary>{$t('navbar.language')}</summary>
						<ul class="menu dropdown-content bg-base-100 rounded-box z-[1] w-52 p-2 shadow">
							{#each languages as { code, name }}
								<li>
									<button class="text-left" onclick={() => handleLanguageChange(code)}>
										{name}
									</button>
								</li>
							{/each}
						</ul>
					</details>
				</li>
				<li class="absolute top-0 right-0 m-2">
					<label class="swap swap-rotate">
						<!-- this hidden checkbox controls the state -->
						<input
							type="checkbox"
							class="hidden"
							checked={$darkMode}
							onchange={() => ($darkMode = !$darkMode)}
						/>

						<!-- sun icon -->
						<svg
							class="swap-on h-5 w-5 fill-current"
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
						>
							<path
								d="M5.64,17l-.71.71a1,1,0,0,0,0,1.41,1,1,0,0,0,1.41,0l.71-.71A1,1,0,0,0,5.64,17ZM5,12a1,1,0,0,0-1-1H3a1,1,0,0,0,0,2H4A1,1,0,0,0,5,12Zm7-7a1,1,0,0,0,1-1V3a1,1,0,0,0-2,0V4A1,1,0,0,0,12,5ZM5.64,7.05a1,1,0,0,0,.7.29,1,1,0,0,0,.71-.29,1,1,0,0,0,0-1.41l-.71-.71A1,1,0,0,0,4.93,6.34Zm12,.29a1,1,0,0,0,.7-.29l.71-.71a1,1,0,1,0-1.41-1.41L17,5.64a1,1,0,0,0,0,1.41A1,1,0,0,0,17.66,7.34ZM21,11H20a1,1,0,0,0,0,2h1a1,1,0,0,0,0-2Zm-9,8a1,1,0,0,0-1,1v1a1,1,0,0,0,2,0V20A1,1,0,0,0,12,19ZM18.36,17A1,1,0,0,0,17,18.36l.71.71a1,1,0,0,0,1.41,0,1,1,0,0,0,0-1.41ZM12,6.5A5.5,5.5,0,1,0,17.5,12,5.51,5.51,0,0,0,12,6.5Zm0,9A3.5,3.5,0,1,1,15.5,12,3.5,3.5,0,0,1,12,15.5Z"
							/>
						</svg>

						<!-- moon icon -->
						<svg
							class="swap-off h-5 w-5 fill-current"
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
						>
							<path
								d="M21.64,13a1,1,0,0,0-1.05-.14,8.05,8.05,0,0,1-3.37.73A8.15,8.15,0,0,1,9.08,5.49a8.59,8.59,0,0,1,.25-2A1,1,0,0,0,8,2.36,10.14,10.14,0,1,0,22,14.05,1,1,0,0,0,21.64,13Zm-9.5,6.69A8.14,8.14,0,0,1,7.08,5.22v.27A10.15,10.15,0,0,0,17.22,15.63a9.79,9.79,0,0,0,2.1-.22A8.11,8.11,0,0,1,12.14,19.73Z"
							/>
						</svg>
					</label>
				</li>
			</ul>
		</div>
		<a href="/" class="btn btn-ghost text-xl">Bittasker</a>
	</div>
	<div class="navbar-center hidden lg:flex">
		<ul class="menu menu-horizontal px-1">
			<li><a href="/">{$t('navbar.home')}</a></li>
			<li>
				<a href="/how-it-works">{$t('navbar.how_it_works')}</a>
			</li>
			<li>
				<a href="/onboarding">Onboarding</a>
			</li>
			<li>
				<details class="dropdown">
					<summary>{$t('navbar.language')}</summary>
					<ul class="menu dropdown-content bg-base-100 rounded-box z-[1] w-52 p-2 shadow">
						{#each languages as { code, name }}
							<li>
								<button class="text-left" onclick={() => handleLanguageChange(code)}>
									{name}
								</button>
							</li>
						{/each}
					</ul>
				</details>
			</li>
		</ul>
	</div>
	<div class="navbar-end">
		<label class="swap swap-rotate h-0 w-0 overflow-hidden pr-4 lg:h-auto lg:w-auto">
			<!-- this hidden checkbox controls the state -->
			<input
				type="checkbox"
				class="hidden"
				checked={$darkMode}
				onchange={() => ($darkMode = !$darkMode)}
			/>

			<!-- sun icon -->
			<svg
				class="swap-on h-7 w-7 fill-current"
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 24 24"
			>
				<path
					d="M5.64,17l-.71.71a1,1,0,0,0,0,1.41,1,1,0,0,0,1.41,0l.71-.71A1,1,0,0,0,5.64,17ZM5,12a1,1,0,0,0-1-1H3a1,1,0,0,0,0,2H4A1,1,0,0,0,5,12Zm7-7a1,1,0,0,0,1-1V3a1,1,0,0,0-2,0V4A1,1,0,0,0,12,5ZM5.64,7.05a1,1,0,0,0,.7.29,1,1,0,0,0,.71-.29,1,1,0,0,0,0-1.41l-.71-.71A1,1,0,0,0,4.93,6.34Zm12,.29a1,1,0,0,0,.7-.29l.71-.71a1,1,0,1,0-1.41-1.41L17,5.64a1,1,0,0,0,0,1.41A1,1,0,0,0,17.66,7.34ZM21,11H20a1,1,0,0,0,0,2h1a1,1,0,0,0,0-2Zm-9,8a1,1,0,0,0-1,1v1a1,1,0,0,0,2,0V20A1,1,0,0,0,12,19ZM18.36,17A1,1,0,0,0,17,18.36l.71.71a1,1,0,0,0,1.41,0,1,1,0,0,0,0-1.41ZM12,6.5A5.5,5.5,0,1,0,17.5,12,5.51,5.51,0,0,0,12,6.5Zm0,9A3.5,3.5,0,1,1,15.5,12,3.5,3.5,0,0,1,12,15.5Z"
				/>
			</svg>

			<!-- moon icon -->
			<svg
				class="swap-off h-7 w-7 fill-current"
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 24 24"
			>
				<path
					d="M21.64,13a1,1,0,0,0-1.05-.14,8.05,8.05,0,0,1-3.37.73A8.15,8.15,0,0,1,9.08,5.49a8.59,8.59,0,0,1,.25-2A1,1,0,0,0,8,2.36,10.14,10.14,0,1,0,22,14.05,1,1,0,0,0,21.64,13Zm-9.5,6.69A8.14,8.14,0,0,1,7.08,5.22v.27A10.15,10.15,0,0,0,17.22,15.63a9.79,9.79,0,0,0,2.1-.22A8.11,8.11,0,0,1,12.14,19.73Z"
				/>
			</svg>
		</label>

		<a href="/auth" class="btn btn-primary">{$t('navbar.start_now')}</a>
	</div>
</div>
