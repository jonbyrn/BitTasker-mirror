<script lang="ts">
	import type { NostrProfile, NostrProfileLanguage } from '$lib/types/profile.d';
	import { t, locale } from 'svelte-i18n';
	import {
		getTranslatedProfileContent,
		getTranslatedSkillName
	} from '$lib/utils/profileTranslation';
	import { formatTime12Hour } from '$lib/utils/helpers/dateFormatter';

	let {
		profile,
		skills = [],
		languages = [],
		certifications = [],
		education = [],
		availability,
		isLoading = false
	}: {
		profile: NostrProfile | null;
		skills?: Array<string | { name: string; translations?: Record<string, unknown> }>;
		languages?: NostrProfileLanguage[];
		certifications?: Array<{ name: string; issuer: string; date: string; url?: string }>;
		education?: Array<{ institution: string; degree: string; year: string }>;
		availability?: {
			timeSlots?: Array<{ day: number; start: string; end: string }>;
			noticeHours?: number;
			maxBookingsPerDay?: number;
		};
		isLoading?: boolean;
	} = $props();

	const currentLocale = $derived($locale || 'en');

	// Translated about text
	const aboutText = $derived(
		getTranslatedProfileContent(profile, 'about', currentLocale, profile?.about || '')
	);

	// Show more/less state
	let showFullAbout = $state(false);
	const isAboutTruncated = $derived(aboutText.length > 300);
	const displayAboutText = $derived(
		isAboutTruncated && !showFullAbout ? aboutText.substring(0, 300) + '...' : aboutText
	);

	// Languages with display names and sorted by proficiency
	const proficiencyOrder = { native: 0, fluent: 1, conversational: 2, basic: 3 };

	// Cache Intl.DisplayNames per locale (I6: avoid expensive re-instantiation)
	let displayNamesCache: { locale: string; instance: Intl.DisplayNames } | null = null;
	function getDisplayNames(locale: string): Intl.DisplayNames {
		if (!displayNamesCache || displayNamesCache.locale !== locale) {
			displayNamesCache = {
				locale,
				instance: new Intl.DisplayNames([locale], { type: 'language' })
			};
		}
		return displayNamesCache.instance;
	}

	const translatedLanguages = $derived.by(() => {
		if (!languages.length) return [];

		try {
			const displayNames = getDisplayNames(currentLocale);

			return [...languages]
				.map((lang) => ({
					...lang,
					displayName: displayNames.of(lang.code) || lang.code,
					proficiencyLabel: getProficiencyLabel(lang.proficiency)
				}))
				.sort(
					(a, b) =>
						(proficiencyOrder[a.proficiency as keyof typeof proficiencyOrder] ?? 99) -
						(proficiencyOrder[b.proficiency as keyof typeof proficiencyOrder] ?? 99)
				);
		} catch {
			return languages.map((lang) => ({
				...lang,
				displayName: lang.code,
				proficiencyLabel: getProficiencyLabel(lang.proficiency)
			}));
		}
	});

	function getProficiencyLabel(proficiency: string): string {
		switch (proficiency) {
			case 'native':
				return $t('profile.edit.proficiency.native');
			case 'fluent':
				return $t('profile.edit.proficiency.fluent');
			case 'conversational':
				return $t('profile.edit.proficiency.conversational');
			case 'basic':
				return $t('profile.edit.proficiency.basic');
			default:
				return proficiency;
		}
	}

	function getProficiencyClass(proficiency: string): string {
		switch (proficiency) {
			case 'native':
				return 'badge badge-primary';
			case 'fluent':
				return 'badge badge-secondary';
			case 'conversational':
				return 'badge badge-info badge-outline';
			case 'basic':
				return 'badge badge-ghost';
			default:
				return 'badge badge-ghost';
		}
	}

	// Availability helper functions (same as ProfileInfoSection)
	function formatTimeSlot(start: string, end: string): string {
		return `${formatTime12Hour(start)} - ${formatTime12Hour(end)}`;
	}

	function getDaySchedule(
		timeSlots: Array<{ day: number; start: string; end: string }>,
		dayNumber: number
	) {
		const slot = timeSlots.find((slot) => slot.day === dayNumber);
		return slot
			? { available: true, hours: formatTimeSlot(slot.start, slot.end) }
			: { available: false };
	}

	let schedule = $derived.by(() => {
		if (!availability?.timeSlots) return {};
		const weekSchedule: Record<string, { available: boolean; hours?: string; label: string }> = {};
		const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
		dayKeys.forEach((dayKey, index) => {
			const scheduleData = getDaySchedule(availability.timeSlots!, index);
			weekSchedule[dayKey] = { ...scheduleData, label: $t(`days.${dayKey}`) };
		});
		return weekSchedule;
	});

	const availabilityDays = $derived(Object.values(schedule));
</script>

<section id="about" aria-labelledby="about-heading" class="mb-8 scroll-mt-20">
	<h2 id="about-heading" class="text-base-content mb-4 text-xl font-bold">
		{$t('common.profile.about')}
	</h2>

	{#if isLoading}
		<div class="animate-pulse space-y-4">
			<div class="bg-base-300 h-4 w-full rounded"></div>
			<div class="bg-base-300 h-4 w-3/4 rounded"></div>
			<div class="bg-base-300 h-4 w-1/2 rounded"></div>
		</div>
	{:else}
		<!-- About text -->
		<div class="mb-6">
			{#if aboutText}
				<div class="text-base-content/80 prose max-w-none">
					<p class="whitespace-pre-line">{displayAboutText}</p>
				</div>
				{#if isAboutTruncated}
					<button
						class="btn btn-link btn-sm text-primary px-0"
						onclick={() => (showFullAbout = !showFullAbout)}
					>
						{showFullAbout ? $t('common.show_less') : $t('common.show_more')}
					</button>
				{/if}
			{:else}
				<p class="text-base-content/50 italic">{$t('common.profile.no_about')}</p>
			{/if}
		</div>

		<!-- Skills -->
		{#if skills.length}
			<div class="mb-6">
				<h3 class="text-base-content mb-3 text-lg font-semibold">
					{$t('common.profile.skills')}
				</h3>
				<div class="flex flex-wrap gap-2">
					{#each skills as skill (typeof skill === 'string' ? skill : skill.name)}
						<span class="badge badge-outline badge-lg">
							{getTranslatedSkillName(skill, currentLocale)}
						</span>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Languages -->
		{#if languages.length}
			<div class="mb-6">
				<h3 class="text-base-content mb-3 text-lg font-semibold">
					{$t('profile.languages')}
				</h3>
				<div class="flex flex-wrap gap-2">
					{#each translatedLanguages as lang (lang.code)}
						<div class="flex items-center gap-2">
							<span class="text-base-content/80">
								{lang.displayName}
							</span>
							<span class={getProficiencyClass(lang.proficiency)}>
								{lang.proficiencyLabel}
							</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Credentials (Education & Certifications) -->
		{#if certifications.length || education.length}
			<div class="mb-6">
				<h3 class="text-base-content mb-3 text-lg font-semibold">
					{$t('common.profile.credentials')}
				</h3>
				<div class="space-y-4">
					{#each education as edu (edu.institution)}
						<div class="flex items-start gap-3">
							<div class="bg-base-200 flex h-8 w-8 items-center justify-center rounded-full">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="text-primary h-4 w-4"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path d="M12 14l9-5-9-5-9 5 9 5z" />
									<path
										d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"
									/>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222"
									/>
								</svg>
							</div>
							<div>
								<p class="text-base-content font-medium">{edu.degree}</p>
								<p class="text-base-content/60 text-sm">{edu.institution} • {edu.year}</p>
							</div>
						</div>
					{/each}

					{#each certifications as cert (cert.name)}
						<div class="flex items-start gap-3">
							<div class="bg-base-200 flex h-8 w-8 items-center justify-center rounded-full">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="text-success h-4 w-4"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
									/>
								</svg>
							</div>
							<div>
								<p class="text-base-content font-medium">{cert.name}</p>
								<p class="text-base-content/60 text-sm">{cert.issuer} • {cert.date}</p>
								{#if cert.url && (cert.url.startsWith('https://') || cert.url.startsWith('http://'))}
									<a
										href={cert.url}
										target="_blank"
										rel="noopener noreferrer"
										class="link link-primary text-sm"
									>
										{$t('common.profile.view_certificate')}
									</a>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Availability (mobile only) -->
		<div class="mb-6 md:hidden">
			<h3 class="text-base-content mb-3 text-lg font-semibold">
				{$t('common.profile.availability')}
			</h3>

			{#if availability?.timeSlots?.length}
				<div class="bg-base-200 rounded-lg p-4">
					<div class="grid grid-cols-2 gap-2">
						{#each availabilityDays as day (day.name)}
							<div class="flex items-center justify-between">
								<span class="text-sm">{day.label}</span>
								{#if day.available}
									<span class="text-success text-sm">{day.hours}</span>
								{:else}
									<span class="text-error text-sm">{$t('common.profile.unavailable')}</span>
								{/if}
							</div>
						{/each}
					</div>
					{#if availability.maxBookingsPerDay}
						<p class="text-base-content/60 mt-2 text-xs">
							{$t('common.profile.max_bookings_per_day', {
								values: { count: availability.maxBookingsPerDay }
							})}
						</p>
					{/if}
				</div>
			{:else}
				<p class="text-base-content/50 italic">{$t('common.profile.availability_not_set')}</p>
			{/if}
		</div>
	{/if}
</section>
