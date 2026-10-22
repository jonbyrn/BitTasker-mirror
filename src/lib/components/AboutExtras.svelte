<script lang="ts">
	import { resolve } from '$app/paths';
	import { t } from 'svelte-i18n';
	import IconFacebook from '~icons/mdi/facebook';
	import IconInstagram from '~icons/mdi/instagram';
	import IconYoutube from '~icons/mdi/youtube';
	import IconLinkedin from '~icons/mdi/linkedin';
	import IconReddit from '~icons/mdi/reddit';
	import IconMusicNoteEighth from '~icons/mdi/music-note-eighth';
	import IconPlay from '~icons/mdi/play';
	import IconGithub from '~icons/mdi/github';
	import IconTelegram from '~icons/mdi/telegram';
	import IconWhatsapp from '~icons/mdi/whatsapp';

	const iconClass = 'h-8 w-8';
</script>

<section class="mx-auto my-16 max-w-4xl px-8" data-testid="about-extras">
	<p class="text-base-content/80 mb-10 text-center text-lg">{$t('footer.company_description')}</p>

	<div class="grid grid-cols-1 gap-8 md:grid-cols-2">
		<div>
			<h3 class="mb-3 text-xl font-bold">{$t('footer.for_taskers')}</h3>
			<ul class="space-y-2">
				<li><a class="link" href={resolve('/create-task')}>{$t('footer.post_task')}</a></li>
				<li><a class="link" href={resolve('/tasker-fees')}>{$t('footer.tasker_fees')}</a></li>
				<li><a class="link" href={resolve('/secure-payments')}>{$t('footer.escrow')}</a></li>
				<li><a class="link" href={resolve('/faq')}>{$t('footer.faq')}</a></li>
			</ul>
		</div>
		<div>
			<h3 class="mb-3 text-xl font-bold">{$t('footer.for_taskees')}</h3>
			<ul class="space-y-2">
				<li><a class="link" href={resolve('/start-earning')}>{$t('footer.start_earning')}</a></li>
				<li>
					<a class="link" href={resolve('/community-guidelines')}
						>{$t('footer.community_guidelines')}</a
					>
				</li>
				<li><a class="link" href={resolve('/taskee-fees')}>{$t('footer.taskee_fees')}</a></li>
				<li>
					<a class="link" href={resolve('/tasker-principles')}>{$t('footer.tasker_principles')}</a>
				</li>
				<li><a class="link" href={resolve('/faq')}>{$t('footer.tasker_faq')}</a></li>
			</ul>
		</div>
	</div>

	<div class="mt-10">
		<h3 class="mb-3 text-xl font-bold">{$t('footer.company')}</h3>
		<ul class="space-y-2">
			<li><a class="link" href={resolve('/security')}>{$t('footer.security')}</a></li>
			<li><a class="link" href={resolve('/careers')}>{$t('footer.careers')}</a></li>
			<li><a class="link" href={resolve('/press')}>{$t('footer.press')}</a></li>
		</ul>
	</div>

	<div class="mt-10">
		<h3 class="mb-3 text-xl font-bold">{$t('footer.learn_topics')}</h3>
		<ul class="space-y-2">
			<li>
				<a
					class="link"
					href={resolve('/(company)/learn/[...slug]', { slug: 'wallet/best-bitcoin-wallet' })}
					>{$t('footer.learn_wallet_guide')}</a
				>
			</li>
			<li>
				<a
					class="link"
					href={resolve('/(company)/learn/[...slug]', { slug: 'wallet/ledger-vs-trezor' })}
					>{$t('footer.learn_ledger_vs_trezor')}</a
				>
			</li>
			<li>
				<a
					class="link"
					href={resolve('/(company)/learn/[...slug]', { slug: 'freelancing/upwork-alternatives' })}
					>{$t('footer.learn_upwork_alternatives')}</a
				>
			</li>
			<li>
				<a
					class="link"
					href={resolve('/(company)/learn/[...slug]', { slug: 'bitcoin/lightning-network' })}
					>{$t('footer.learn_lightning')}</a
				>
			</li>
			<li>
				<a
					class="link"
					href={resolve('/(company)/learn/[...slug]', { slug: 'security/is-bittasker-safe' })}
					>{$t('footer.learn_is_safe')}</a
				>
			</li>
		</ul>
	</div>

	<div class="mt-10 flex flex-wrap justify-center gap-x-5 gap-y-4" data-testid="about-social">
		<a
			class="hover:text-primary"
			href="https://primal.net/BitTasker"
			target="_blank"
			rel="noopener noreferrer"
			aria-label="Primal"
		>
			<svg
				width="28"
				height="28"
				viewBox="0 0 36 36"
				fill="currentColor"
				class={iconClass}
				aria-hidden="true"
			>
				<path
					d="m 21.8684,35.583 c -1.2461,0.2729 -2.5405,0.4167 -3.8685,0.4167 -3.645,0 -7.0369,-1.0834 -9.87134,-2.9457 C 7.42496,32.0476 7.10927,31.4935 6.87899,31.0894 6.76489,30.8892 6.67176,30.7257 6.5628,30.5623 5.48908,28.8355 4.9273,26.6174 4.80479,24.0113 4.42532,15.9363 9.3328,10.7798 14.3461,9.93346 c 3.178,-0.53651 5.7035,0.00682 7.6405,1.04274 -1.7125,-0.4764 -3.754,-0.505 -6.0813,0.1612 -5.6417,1.8184 -7.52244,7.3478 -6.71634,13.4711 1.40684,7.6726 8.92974,10.4226 12.67944,10.9745 z"
				/>
			</svg>
		</a>
		<a
			class="hover:text-primary"
			href="https://twitter.com/BitTaskerdotcom"
			target="_blank"
			rel="noopener noreferrer"
			aria-label={$t('footer.social.twitter_aria')}
		>
			<svg
				width="28"
				height="28"
				viewBox="0 0 24 24"
				fill="currentColor"
				class={iconClass}
				aria-hidden="true"
			>
				<path
					d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
				/>
			</svg>
		</a>
		<a
			class="hover:text-primary"
			href="https://chat.whatsapp.com/GorZMOrVhOb0KDX6dpKLZ2"
			target="_blank"
			rel="noopener noreferrer"
			aria-label={$t('footer.social.whatsapp_aria')}><IconWhatsapp class={iconClass} /></a
		>
		<a
			class="hover:text-primary"
			href="https://t.me/+Y1VVB5B1Z6Q5OGQ1"
			target="_blank"
			rel="noopener noreferrer"
			aria-label={$t('footer.social.telegram_aria')}><IconTelegram class={iconClass} /></a
		>
		<a
			class="hover:text-primary"
			href="https://www.facebook.com/BitTaskerdotcom/"
			target="_blank"
			rel="noopener noreferrer"
			aria-label={$t('footer.social.facebook_aria')}><IconFacebook class={iconClass} /></a
		>
		<a
			class="hover:text-primary"
			href="https://instagram.com/bittasker"
			target="_blank"
			rel="noopener noreferrer"
			aria-label={$t('footer.social.instagram_aria')}><IconInstagram class={iconClass} /></a
		>
		<a
			class="hover:text-primary"
			href="https://www.youtube.com/@BitTasker"
			target="_blank"
			rel="noopener noreferrer"
			aria-label={$t('footer.social.youtube_aria')}><IconYoutube class={iconClass} /></a
		>
		<a
			class="hover:text-primary"
			href="https://www.linkedin.com/company/bittasker/"
			target="_blank"
			rel="noopener noreferrer"
			aria-label={$t('footer.social.linkedin_aria')}><IconLinkedin class={iconClass} /></a
		>
		<a
			class="hover:text-primary"
			href="https://reddit.com/u/BitTasker"
			target="_blank"
			rel="noopener noreferrer"
			aria-label={$t('footer.social.reddit_aria')}><IconReddit class={iconClass} /></a
		>
		<a
			class="hover:text-primary"
			href="https://www.tiktok.com/@bittasker"
			target="_blank"
			rel="noopener noreferrer"
			aria-label={$t('footer.social.tiktok_aria')}><IconMusicNoteEighth class={iconClass} /></a
		>
		<a
			class="hover:text-primary"
			href="https://rumble.com/c/c-7742441"
			target="_blank"
			rel="noopener noreferrer"
			aria-label={$t('footer.social.rumble_aria')}><IconPlay class={iconClass} /></a
		>
		<a
			class="hover:text-primary"
			href="https://github.com/BitTasker"
			target="_blank"
			rel="noopener noreferrer"
			aria-label={$t('footer.social.github_aria')}><IconGithub class={iconClass} /></a
		>
	</div>
</section>
