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

	const playUrl = 'https://play.google.com/store/apps/details?id=com.bittasker.app';
	const zapUrl =
		'https://zapstore.dev/apps/naddr1qvzqqqr7pvpzpdxcukch9yuvrpytr66vwlqfe0j2e4nuhdch79r52zmqh9s6tuxcqqgkxmmd9e3xjar5v9ekketj9eshquqj9fac3';
</script>

<footer class="site-footer" data-testid="site-footer">
	<div class="site-footer__inner">
		<div class="site-footer__columns">
			<section class="site-footer__brand">
				<h2 class="site-footer__heading">{$t('footer.company_name')}</h2>
				<p class="site-footer__blurb">{$t('footer.company_description')}</p>
				<div class="site-footer__badges">
					<a
						href={playUrl}
						target="_blank"
						rel="noopener noreferrer"
						aria-label={$t('footer.google_play_aria')}
					>
						<img
							src="/google-play-badge.svg"
							alt={$t('footer.google_play_aria')}
							width="162"
							height="48"
						/>
					</a>
					<a
						href={zapUrl}
						target="_blank"
						rel="noopener noreferrer"
						aria-label={$t('footer.zapstore_aria')}
					>
						<img
							src="/zapstore-badge.svg"
							alt={$t('footer.zapstore_aria')}
							width="160"
							height="48"
						/>
					</a>
				</div>
				<nav class="site-footer__social" aria-label={$t('footer.social_label')}>
					<a
						href="https://primal.net/BitTasker"
						data-social="nostr"
						target="_blank"
						rel="noopener noreferrer"
						aria-label={$t('footer.social.nostr_aria')}
					>
						<svg viewBox="0 0 36 36" fill="currentColor" aria-hidden="true">
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
						href="https://x.com/BitTaskerdotcom"
						data-social="x"
						target="_blank"
						rel="noopener noreferrer"
						aria-label={$t('footer.social.twitter_aria')}
					>
						<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
							<path
								d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
							/>
						</svg>
					</a>
					<a
						href="https://chat.whatsapp.com/GorZMOrVhOb0KDX6dpKLZ2"
						data-social="whatsapp"
						target="_blank"
						rel="noopener noreferrer"
						aria-label={$t('footer.social.whatsapp_aria')}
					>
						<IconWhatsapp />
					</a>
					<a
						href="https://t.me/+Y1VVB5B1Z6Q5OGQ1"
						data-social="telegram"
						target="_blank"
						rel="noopener noreferrer"
						aria-label={$t('footer.social.telegram_aria')}
					>
						<IconTelegram />
					</a>
					<a
						href="https://www.facebook.com/BitTaskerdotcom/"
						data-social="facebook"
						target="_blank"
						rel="noopener noreferrer"
						aria-label={$t('footer.social.facebook_aria')}
					>
						<IconFacebook />
					</a>
					<a
						href="https://instagram.com/bittasker"
						data-social="instagram"
						target="_blank"
						rel="noopener noreferrer"
						aria-label={$t('footer.social.instagram_aria')}
					>
						<IconInstagram />
					</a>
					<a
						href="https://www.youtube.com/@BitTasker"
						data-social="youtube"
						target="_blank"
						rel="noopener noreferrer"
						aria-label={$t('footer.social.youtube_aria')}
					>
						<IconYoutube />
					</a>
					<a
						href="https://www.linkedin.com/company/bittasker/"
						data-social="linkedin"
						target="_blank"
						rel="noopener noreferrer"
						aria-label={$t('footer.social.linkedin_aria')}
					>
						<IconLinkedin />
					</a>
					<a
						href="https://reddit.com/u/BitTasker"
						data-social="reddit"
						target="_blank"
						rel="noopener noreferrer"
						aria-label={$t('footer.social.reddit_aria')}
					>
						<IconReddit />
					</a>
					<a
						href="https://www.tiktok.com/@bittasker"
						data-social="tiktok"
						target="_blank"
						rel="noopener noreferrer"
						aria-label={$t('footer.social.tiktok_aria')}
					>
						<IconMusicNoteEighth />
					</a>
					<a
						href="https://rumble.com/c/c-7742441"
						data-social="rumble"
						target="_blank"
						rel="noopener noreferrer"
						aria-label={$t('footer.social.rumble_aria')}
					>
						<IconPlay />
					</a>
					<a
						href="https://github.com/BitTasker"
						data-social="github"
						target="_blank"
						rel="noopener noreferrer"
						aria-label={$t('footer.social.github_aria')}
					>
						<IconGithub />
					</a>
				</nav>
			</section>

			<nav class="site-footer__col" aria-label={$t('footer.for_taskers')}>
				<h2 class="site-footer__heading">{$t('footer.for_taskers')}</h2>
				<ul class="site-footer__links">
					<li>
						<a href={resolve('/tasker-fees')}>{$t('footer.tasker_fees')}</a>
					</li>
					<li>
						<a href={resolve('/secure-payments')}>{$t('footer.escrow')}</a>
					</li>
					<li>
						<a href={resolve('/faq')}>{$t('footer.faq')}</a>
					</li>
				</ul>
			</nav>

			<nav class="site-footer__col" aria-label={$t('footer.for_taskees')}>
				<h2 class="site-footer__heading">{$t('footer.for_taskees')}</h2>
				<ul class="site-footer__links">
					<li>
						<a href={resolve('/tasks')}>{$t('footer.start_earning')}</a>
					</li>
					<li>
						<a href={resolve('/community-guidelines')}>{$t('footer.community_guidelines')}</a>
					</li>
					<li>
						<a href={resolve('/taskee-fees')}>{$t('footer.taskee_fees')}</a>
					</li>
					<li>
						<a href={resolve('/tasker-principles')}>{$t('footer.tasker_principles')}</a>
					</li>
					<li>
						<a href={resolve('/faq')}>{$t('footer.tasker_faq')}</a>
					</li>
				</ul>
			</nav>

			<nav class="site-footer__col" aria-label={$t('footer.company')}>
				<h2 class="site-footer__heading">{$t('footer.company')}</h2>
				<ul class="site-footer__links">
					<li><a href={resolve('/about')}>{$t('footer.about_us')}</a></li>
					<li><a href={resolve('/security')}>{$t('footer.security')}</a></li>
					<li><a href={resolve('/careers')}>{$t('footer.careers')}</a></li>
					<li><a href={resolve('/press')}>{$t('footer.press')}</a></li>
					<li><a href={resolve('/terms')}>{$t('footer.terms')}</a></li>
					<li><a href={resolve('/privacy')}>{$t('footer.privacy')}</a></li>
					<li><a href={resolve('/contact')}>{$t('footer.contact')}</a></li>
				</ul>
			</nav>
		</div>

		<div class="site-footer__legal">
			<p>{$t('footer.copyright_notice')}</p>
			<p class="site-footer__made">
				{$t('footer.made_with')}
				<svg class="site-footer__heart" viewBox="0 0 24 24" aria-hidden="true">
					<path
						fill="currentColor"
						d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
					/>
				</svg>
				{$t('footer.and')}
				<svg class="site-footer__bitcoin" viewBox="0 0 512 512" aria-hidden="true">
					<path
						fill="currentColor"
						d="M362.199,243.996c24.913-12.74,40.767-35.39,37.088-73.044c-4.814-51.526-47.131-68.796-103.188-73.607V26.001H252.5v69.362c-11.325,0-22.932,0.283-34.539,0.564V26.001h-43.6v71.344c-16.029,0.484-34.698,0.248-87.479,0v46.43c34.423-0.609,52.483-2.821,56.623,19.251V358.37c-2.629,17.515-16.643,14.991-47.846,14.438l-8.775,51.809c79.495,0,87.479,0.284,87.479,0.284v61.099h43.601v-60.25c11.888,0.285,23.498,0.285,34.539,0.285v59.965h43.599V424.9c73.043-3.964,121.871-22.366,128.384-91.16C429.579,278.535,403.531,253.903,362.199,243.996z M218.811,146.889c24.631,0,101.639-7.643,101.639,43.599c0,48.979-77.007,43.315-101.639,43.315V146.889z M218.811,373.093v-95.691c29.445,0,119.608-8.209,119.608,47.847C338.418,379.321,248.255,373.093,218.811,373.093z"
					/>
				</svg>
				{$t('footer.in_el_salvador')}
			</p>
		</div>
	</div>
</footer>

<style>
	.site-footer {
		box-sizing: border-box;
		background: var(--color-base-300);
		color: color-mix(in oklab, var(--color-base-content) 70%, transparent);
		padding: 48px 0 0;
		font-size: 16px;
		line-height: 26px;
	}

	.site-footer__inner {
		box-sizing: border-box;
		width: 100%;
		margin: 0 auto;
		padding-inline: 16px;
	}

	.site-footer__columns {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		align-items: start;
		gap: 40px;
	}

	.site-footer__brand,
	.site-footer__col {
		box-sizing: border-box;
		padding-inline: 16px;
	}

	.site-footer__heading {
		margin: 0 0 16px;
		color: var(--color-base-content);
		font-family: 'Poppins', ui-sans-serif, system-ui, sans-serif;
		font-size: 20px;
		font-weight: 500;
		line-height: 30px;
		text-align: left;
	}

	.site-footer__blurb {
		margin: 0 0 16px;
		font-size: 16px;
		line-height: 26px;
		text-align: left;
	}

	.site-footer__badges {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 12px;
		margin: 0 0 24px;
	}

	.site-footer__badges img {
		display: block;
		flex: 0 0 auto;
		width: 162px;
		height: 48px;
		max-width: none;
		object-fit: fill;
	}

	.site-footer__badges a:last-child img {
		width: 160px;
	}

	.site-footer__social {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		column-gap: 24px;
		row-gap: 16px;
		margin: 0;
	}

	.site-footer__social a {
		display: flex;
		box-sizing: border-box;
		width: 44px;
		height: 44px;
		min-width: 44px;
		min-height: 44px;
		align-items: center;
		justify-content: center;
		color: inherit;
	}

	.site-footer__social a :global(svg) {
		width: 24px;
		height: 24px;
	}

	.site-footer__social a:hover,
	.site-footer__links a:hover {
		color: #f7931a;
	}

	.site-footer__links {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin: 0;
		padding: 0;
		list-style: none;
		text-align: left;
	}

	.site-footer__links a {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		font-size: 16px;
		line-height: 26px;
		text-decoration: none;
	}

	.site-footer__legal {
		margin-top: 48px;
		border-top: 1px solid color-mix(in oklab, var(--color-base-content) 10%, transparent);
		padding: 32px 0 24px;
		text-align: center;
	}

	.site-footer__legal p {
		margin: 0;
		font-size: 16px;
		font-weight: 400;
		line-height: 26px;
	}

	.site-footer__made {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.site-footer__legal .site-footer__made {
		margin-top: 8px;
		font-size: 14px;
		line-height: 20px;
	}

	.site-footer__heart,
	.site-footer__bitcoin {
		width: 16px;
		height: 16px;
		margin: 0 4px;
		flex: 0 0 auto;
	}

	.site-footer__heart {
		color: #ef4444;
	}

	.site-footer__bitcoin {
		color: #f7931a;
	}

	@media (min-width: 768px) {
		.site-footer__heading {
			font-size: 24px;
			line-height: 36px;
		}

		.site-footer__columns {
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: 32px;
		}

		.site-footer__brand {
			grid-column: 1 / -1;
			padding-inline: 24px;
		}

		.site-footer__col {
			padding-inline: 24px;
		}

		.site-footer__badges {
			justify-content: flex-start;
		}
	}

	@media (min-width: 1024px) {
		.site-footer__columns {
			grid-template-columns: repeat(4, minmax(0, 1fr));
			gap: 32px;
		}

		.site-footer__brand,
		.site-footer__col {
			padding-inline: 0;
		}

		.site-footer__brand {
			grid-column: auto;
		}

		.site-footer__social {
			justify-content: flex-start;
			column-gap: 16px;
			row-gap: 16px;
		}

		.site-footer__social a {
			width: 44px;
			height: 44px;
			min-width: 44px;
			min-height: 44px;
		}
	}
</style>
