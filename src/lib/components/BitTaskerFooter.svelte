<script lang="ts">
	import { resolve } from '$app/paths';
	import { t } from 'svelte-i18n';
</script>

<footer class="bg-base-300 text-base-content/70 pb-safe py-8 lg:pb-10">
	<div class="container mx-auto flex flex-col items-center gap-6 px-4 text-center">
		<nav
			class="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-base font-semibold"
			aria-label={$t('footer.company')}
		>
			<a class="hover:text-primary" href={resolve('/how-it-works')}>{$t('navbar.help')}</a>
			<a class="hover:text-primary" href={resolve('/about')}>{$t('navbar.about')}</a>
			<a class="hover:text-primary" href={resolve('/terms')}>{$t('footer.terms_short')}</a>
			<a class="hover:text-primary" href={resolve('/privacy')}>{$t('footer.privacy_short')}</a>
			<a class="hover:text-primary" href={resolve('/contact')}>{$t('footer.contact_short')}</a>
		</nav>

		<div class="flex flex-wrap items-center justify-center gap-3">
			<a
				href="https://play.google.com/store/apps/details?id=com.bittasker.app"
				target="_blank"
				rel="noopener noreferrer"
				class="inline-block transition-opacity hover:opacity-80"
				aria-label={$t('footer.google_play_aria')}
			>
				<img src="/google-play-badge.svg" alt={$t('footer.google_play_aria')} class="h-12" />
			</a>
			<a
				href="https://zapstore.dev/apps/naddr1qvzqqqr7pvpzpdxcukch9yuvrpytr66vwlqfe0j2e4nuhdch79r52zmqh9s6tuxcqqgkxmmd9e3xjar5v9ekketj9eshquqj9fac3"
				target="_blank"
				rel="noopener noreferrer"
				class="inline-block transition-opacity hover:opacity-80"
				aria-label={$t('footer.zapstore_aria')}
			>
				<img src="/zapstore-badge.svg" alt={$t('footer.zapstore_aria')} class="h-12" />
			</a>
		</div>

		<p>
			© {new Date().getFullYear()}
			{$t('footer.company_name')}. {$t('footer.copyright')}
		</p>
	</div>
</footer>
