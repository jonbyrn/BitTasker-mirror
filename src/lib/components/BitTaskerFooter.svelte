<script lang="ts">
	import { t } from 'svelte-i18n';
	// Social media icon imports
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

	const iconClass = 'h-8 w-8 transition-colors duration-300 ease-in-out lg:h-6 lg:w-6';
</script>

<footer class="bg-base-300 text-base-content/70 pb-safe py-12 lg:pb-12">
	<div class="container mx-auto px-4">
		<div class="grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-8 lg:grid-cols-4 lg:gap-8">
			<!-- Company Info -->
			<div class="px-4 md:col-span-3 md:px-6 lg:col-span-1 lg:px-0">
				<h4 class="text-base-content mb-4 text-lg font-bold">{$t('footer.company_name')}</h4>
				<p class="mb-4">{$t('footer.company_description')}</p>

				<!-- App Store Badges -->
				<div class="mb-6 flex flex-wrap items-center justify-center gap-3 md:justify-start">
					<!-- Google Play Store -->
					<a
						href="https://play.google.com/store/apps/details?id=com.bittasker.app"
						target="_blank"
						rel="noopener noreferrer"
						class="inline-block transition-opacity hover:opacity-80"
						aria-label={$t('footer.google_play_aria')}
					>
						<img src="/google-play-badge.svg" alt="Get it on Google Play" class="h-12" />
					</a>
					<!-- Zapstore -->
					<a
						href="https://zapstore.dev/apps/naddr1qvzqqqr7pvpzpdxcukch9yuvrpytr66vwlqfe0j2e4nuhdch79r52zmqh9s6tuxcqqgkxmmd9e3xjar5v9ekketj9eshquqj9fac3"
						target="_blank"
						rel="noopener noreferrer"
						class="inline-block transition-opacity hover:opacity-80"
						aria-label={$t('footer.zapstore_aria')}
					>
						<img src="/zapstore-badge.svg" alt="Get it on Zapstore" class="h-12" />
					</a>
				</div>

				<!-- Social: wrap + gap for mobile whitespace; same icon sizes as before -->
				<div class="flex flex-wrap justify-center gap-x-6 gap-y-4 lg:justify-start lg:gap-x-4">
					<a
						href="https://primal.net/BitTasker"
						class="hover:text-primary text-lg transition-colors duration-300 ease-in-out"
						aria-label="Primal"
						target="_blank"
						rel="noopener noreferrer"
					>
						<svg
							width="24"
							height="24"
							viewBox="0 0 36 36"
							fill="currentColor"
							class="{iconClass} text-base-content hover:text-primary"
						>
							<path
								d="m 21.8684,35.583 c -1.2461,0.2729 -2.5405,0.4167 -3.8685,0.4167 -3.645,0 -7.0369,-1.0834 -9.87134,-2.9457 C 7.42496,32.0476 7.10927,31.4935 6.87899,31.0894 6.76489,30.8892 6.67176,30.7257 6.5628,30.5623 5.48908,28.8355 4.9273,26.6174 4.80479,24.0113 4.42532,15.9363 9.3328,10.7798 14.3461,9.93346 c 3.178,-0.53651 5.7035,0.00682 7.6405,1.04274 -1.7125,-0.4764 -3.754,-0.505 -6.0813,0.1612 -5.6417,1.8184 -7.52244,7.3478 -6.71634,13.4711 1.40684,7.6726 8.92974,10.4226 12.67944,10.9745 z"
							/>
							<path
								d="M 5.79919,31.235 C 4.74978,29.3716 3.79946,26.5912 3.68071,24.0649 3.27786,15.4924 8.51664,9.77741 14.1585,8.82493 21.8491,7.52657 26.1246,12.0794 27.5985,15.4587 27.6602,15.4171 27.6852,15.3348 27.6527,15.264 25.2293,9.99435 20.2169,6.37564 14.4271,6.37564 7.85277,6.37564 1.98661,11.0916 0,18.1005 0.028214,23.2941 2.25599,27.9669 5.79919,31.235 Z"
							/>
							<path
								d="m 28.1246,32.8843 c -1.2983,0.8849 -2.7184,1.6044 -4.23,2.1281 -0.7258,-0.1264 -1.5299,-0.2838 -2.0961,-0.3946 -0.2683,-0.0525 -0.4833,-0.0946 -0.611,-0.118 -3.424,-0.6254 -9.546,-2.8317 -10.8872,-10.0664 -0.3789,-2.909 -0.1075,-5.5868 0.8536,-7.7109 0.9468,-2.0926 2.5809,-3.6968 5.0729,-4.5067 2.8964,-0.7891 5.2966,-0.398 7.0795,0.5595 -0.4389,-0.0925 -0.8925,-0.141 -1.3567,-0.141 -3.8577,0 -6.9851,3.3506 -6.9851,7.4839 0,1.6504 0.4987,3.1761 1.3433,4.4134 0,0 2.4179,4.5673 9,4.1591 5.8689,-0.364 8.9166,-5.6283 9.2798,-7.5728 0.1888,-1.0105 0.2875,-2.0527 0.2875,-3.118 0,-9.31974 -7.5551,-16.87491 -16.8749,-16.87491 -7.0523,0 -13.09415,4.32607 -15.61666,10.46921 -0.85203,1.11 -1.585694,2.3405 -2.176875,3.6711 C 1.52404,6.62202 8.98879,0 18.0002,0 c 9.9411,0 17.9999,8.05884 17.9999,17.9999 0,6.187 -3.1215,11.6445 -7.8755,14.8844 z"
							/>
						</svg>
					</a>
					<a
						href="https://twitter.com/BitTaskerdotcom"
						class="hover:text-primary text-lg transition-colors duration-300 ease-in-out"
						target="_blank"
						rel="noopener noreferrer"
						aria-label={$t('footer.social.twitter_aria')}
					>
						<svg
							width="24"
							height="24"
							viewBox="0 0 24 24"
							fill="currentColor"
							xmlns="http://www.w3.org/2000/svg"
							class={iconClass}
						>
							<path
								d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
							/>
						</svg>
					</a>
					<a
						href="https://chat.whatsapp.com/GorZMOrVhOb0KDX6dpKLZ2"
						class="hover:text-primary text-lg transition-colors duration-300 ease-in-out"
						target="_blank"
						rel="noopener noreferrer"
						aria-label={$t('footer.social.whatsapp_aria')}
					>
						<IconWhatsapp class={iconClass} />
					</a>
					<a
						href="https://t.me/+Y1VVB5B1Z6Q5OGQ1"
						class="hover:text-primary text-lg transition-colors duration-300 ease-in-out"
						target="_blank"
						rel="noopener noreferrer"
						aria-label={$t('footer.social.telegram_aria')}
					>
						<IconTelegram class={iconClass} />
					</a>
					<a
						href="https://www.facebook.com/BitTaskerdotcom/"
						class="hover:text-primary text-lg transition-colors duration-300 ease-in-out"
						target="_blank"
						rel="noopener noreferrer"
						aria-label={$t('footer.social.facebook_aria')}
					>
						<IconFacebook class={iconClass} />
					</a>
					<a
						href="https://instagram.com/bittasker"
						class="hover:text-primary text-lg transition-colors duration-300 ease-in-out"
						target="_blank"
						rel="noopener noreferrer"
						aria-label={$t('footer.social.instagram_aria')}
					>
						<IconInstagram class={iconClass} />
					</a>
					<a
						href="https://www.youtube.com/@BitTasker"
						class="hover:text-primary text-lg transition-colors duration-300 ease-in-out"
						target="_blank"
						rel="noopener noreferrer"
						aria-label={$t('footer.social.youtube_aria')}
					>
						<IconYoutube class={iconClass} />
					</a>
					<a
						href="https://www.linkedin.com/company/bittasker/"
						class="hover:text-primary text-lg transition-colors duration-300 ease-in-out"
						target="_blank"
						rel="noopener noreferrer"
						aria-label={$t('footer.social.linkedin_aria')}
					>
						<IconLinkedin class={iconClass} />
					</a>
					<a
						href="https://reddit.com/u/BitTasker"
						class="hover:text-primary text-lg transition-colors duration-300 ease-in-out"
						target="_blank"
						rel="noopener noreferrer"
						aria-label={$t('footer.social.reddit_aria')}
					>
						<IconReddit class={iconClass} />
					</a>
					<a
						href="https://www.tiktok.com/@bittasker"
						class="hover:text-primary text-lg transition-colors duration-300 ease-in-out"
						target="_blank"
						rel="noopener noreferrer"
						aria-label={$t('footer.social.tiktok_aria')}
					>
						<IconMusicNoteEighth class={iconClass} />
					</a>
					<a
						href="https://rumble.com/c/c-7742441"
						class="hover:text-primary text-lg transition-colors duration-300 ease-in-out"
						target="_blank"
						rel="noopener noreferrer"
						aria-label={$t('footer.social.rumble_aria')}
					>
						<IconPlay class={iconClass} />
					</a>
					<a
						href="https://github.com/BitTasker"
						class="hover:text-primary text-lg transition-colors duration-300 ease-in-out"
						target="_blank"
						rel="noopener noreferrer"
						aria-label={$t('footer.social.github_aria')}
					>
						<IconGithub class={iconClass} />
					</a>
				</div>
			</div>

			<!-- For Taskers -->
			<div class="px-4 md:px-6 lg:px-0">
				<h4 class="text-base-content mb-4 text-lg font-bold">{$t('footer.for_taskers')}</h4>
				<ul class="space-y-2">
					<li>
						<a
							href="/tasker-fees"
							class="hover:text-primary transition-colors duration-300 ease-in-out"
							>{$t('footer.tasker_fees')}</a
						>
					</li>
					<li>
						<a
							href="/secure-payments"
							class="hover:text-primary transition-colors duration-300 ease-in-out"
							>{$t('footer.escrow')}</a
						>
					</li>
					<li>
						<a href="/faq" class="hover:text-primary transition-colors duration-300 ease-in-out"
							>{$t('footer.faq')}</a
						>
					</li>
				</ul>
			</div>

			<!-- For Taskees -->
			<div class="px-4 md:px-6 lg:px-0">
				<h4 class="text-base-content mb-4 text-lg font-bold">{$t('footer.for_taskees')}</h4>
				<ul class="space-y-2">
					<li>
						<a href="/tasks" class="hover:text-primary transition-colors duration-300 ease-in-out">
							{$t('footer.start_earning')}
						</a>
					</li>
					<li>
						<a
							href="/community-guidelines"
							class="hover:text-primary transition-colors duration-300 ease-in-out"
							>{$t('footer.community_guidelines')}</a
						>
					</li>
					<li>
						<a
							href="/taskee-fees"
							class="hover:text-primary transition-colors duration-300 ease-in-out"
							>{$t('footer.taskee_fees')}</a
						>
					</li>
					<li>
						<a
							href="/tasker-principles"
							class="hover:text-primary transition-colors duration-300 ease-in-out"
							>{$t('footer.tasker_principles')}</a
						>
					</li>
					<li>
						<a href="/faq" class="hover:text-primary transition-colors duration-300 ease-in-out"
							>{$t('footer.tasker_faq')}</a
						>
					</li>
				</ul>
			</div>

			<!-- Company -->
			<div class="px-4 md:px-6 lg:px-0">
				<h4 class="text-base-content mb-4 text-lg font-bold">{$t('footer.company')}</h4>
				<ul class="space-y-2">
					<li>
						<a href="/about" class="hover:text-primary transition-colors duration-300 ease-in-out"
							>{$t('footer.about_us')}</a
						>
					</li>
					<li>
						<a
							href="/security"
							class="hover:text-primary transition-colors duration-300 ease-in-out"
							>{$t('footer.security')}</a
						>
					</li>
					<li>
						<a href="/careers" class="hover:text-primary transition-colors duration-300 ease-in-out"
							>{$t('footer.careers')}</a
						>
					</li>
					<li>
						<a href="/press" class="hover:text-primary transition-colors duration-300 ease-in-out"
							>{$t('footer.press')}</a
						>
					</li>
					<li>
						<a href="/terms" class="hover:text-primary transition-colors duration-300 ease-in-out"
							>{$t('footer.terms')}</a
						>
					</li>
					<li>
						<a href="/privacy" class="hover:text-primary transition-colors duration-300 ease-in-out"
							>{$t('footer.privacy')}</a
						>
					</li>
					<li>
						<a href="/contact" class="hover:text-primary transition-colors duration-300 ease-in-out"
							>{$t('footer.contact')}</a
						>
					</li>
				</ul>
			</div>
		</div>

		<!-- Popular Learn Topics -->
		<div class="border-base-content/10 mt-8 border-t pt-8">
			<h4 class="text-base-content mb-4 text-lg font-bold">{$t('footer.learn_topics')}</h4>
			<div class="flex flex-wrap gap-x-4 gap-y-2">
				<a
					href="/learn/wallet/best-bitcoin-wallet/"
					class="hover:text-primary text-sm transition-colors">{$t('footer.learn_wallet_guide')}</a
				>
				<span class="text-base-content/30">·</span>
				<a
					href="/learn/wallet/ledger-vs-trezor/"
					class="hover:text-primary text-sm transition-colors"
					>{$t('footer.learn_ledger_vs_trezor')}</a
				>
				<span class="text-base-content/30">·</span>
				<a
					href="/learn/freelancing/upwork-alternatives/"
					class="hover:text-primary text-sm transition-colors"
					>{$t('footer.learn_upwork_alternatives')}</a
				>
				<span class="text-base-content/30">·</span>
				<a
					href="/learn/bitcoin/lightning-network/"
					class="hover:text-primary text-sm transition-colors">{$t('footer.learn_lightning')}</a
				>
				<span class="text-base-content/30">·</span>
				<a
					href="/learn/security/is-bittasker-safe/"
					class="hover:text-primary text-sm transition-colors">{$t('footer.learn_is_safe')}</a
				>
			</div>
		</div>

		<div class="border-base-content/10 mt-12 border-t pt-8 pb-6 text-center">
			<p>
				© {new Date().getFullYear()}
				{$t('footer.company_name')}. {$t('footer.copyright')}
			</p>
			<p class="mt-2 text-sm">
				{$t('footer.made_with')}
				<svg
					class="mx-1 inline-block h-4 w-4"
					fill="currentColor"
					viewBox="0 0 24 24"
					style="color: #ef4444;"
				>
					<path
						d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
					/>
				</svg>
				{$t('footer.and')}
				<svg class="mx-1 inline-block h-4 w-4" viewBox="0 0 512 512" style="color: #F7931B;">
					<path
						d="M362.199,243.996c24.913-12.74,40.767-35.39,37.088-73.044    c-4.814-51.526-47.131-68.796-103.188-73.607V26.001H252.5v69.362c-11.325,0-22.932,0.283-34.539,0.564V26.001h-43.6v71.344    c-16.029,0.484-34.698,0.248-87.479,0v46.43c34.423-0.609,52.483-2.821,56.623,19.251V358.37    c-2.629,17.515-16.643,14.991-47.846,14.438l-8.775,51.809c79.495,0,87.479,0.284,87.479,0.284v61.099h43.601v-60.25    c11.888,0.285,23.498,0.285,34.539,0.285v59.965h43.599V424.9c73.043-3.964,121.871-22.366,128.384-91.16    C429.579,278.535,403.531,253.903,362.199,243.996z M218.811,146.889c24.631,0,101.639-7.643,101.639,43.599    c0,48.979-77.007,43.315-101.639,43.315V146.889z M218.811,373.093v-95.691c29.445,0,119.608-8.209,119.608,47.847    C338.418,379.321,248.255,373.093,218.811,373.093L218.811,373.093z"
						fill="currentColor"
					/>
				</svg>
				{$t('footer.in_el_salvador')}
			</p>
		</div>
	</div>
</footer>
