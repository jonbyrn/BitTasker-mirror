<script lang="ts">
	import type { NostrProfile, NostrProfileLanguage } from '$lib/types/profile.d';
	import { t, locale } from 'svelte-i18n';
	import { onMount, onDestroy } from 'svelte';
	import { subscribeToProfileUpdates, publishProfileMetadata } from '$lib/nostr/profile';
	import KINDS from '$lib/utils/constants/kinds';
	import { clickOutside } from '$lib/utils/clickOutside';

	let { onComplete } = $props<{
		onComplete: (completed: boolean, fromSave?: boolean) => void;
	}>();

	// Local state
	let languages = $state<NostrProfileLanguage[]>([]);
	let isLoading = $state(false);
	let isInitialLoading = $state(false);
	let error = $state('');
	let searchQuery = $state('');
	let isDropdownOpen = $state(false);
	let existingMetadata = $state<NostrProfile>({});
	let cleanup: (() => void) | null = null;

	// Proficiency levels
	const PROFICIENCY_LEVELS = [
		{ value: 'native', key: 'common.profile.edit.proficiency.native' },
		{ value: 'fluent', key: 'common.profile.edit.proficiency.fluent' },
		{ value: 'conversational', key: 'common.profile.edit.proficiency.conversational' },
		{ value: 'basic', key: 'common.profile.edit.proficiency.basic' }
	];

	// Proficiency sort order
	const proficiencyOrder: Record<string, number> = {
		native: 0,
		fluent: 1,
		conversational: 2,
		basic: 3
	};

	// Comprehensive ISO 639-1 language codes
	const ISO_639_1_CODES = [
		'aa',
		'ab',
		'af',
		'am',
		'ar',
		'as',
		'ay',
		'az',
		'ba',
		'be',
		'bg',
		'bh',
		'bi',
		'bn',
		'bo',
		'br',
		'ca',
		'co',
		'cs',
		'cy',
		'da',
		'de',
		'dz',
		'el',
		'en',
		'eo',
		'es',
		'et',
		'eu',
		'fa',
		'fi',
		'fj',
		'fo',
		'fr',
		'fy',
		'ga',
		'gd',
		'gl',
		'gn',
		'gu',
		'gv',
		'ha',
		'he',
		'hi',
		'hr',
		'ht',
		'hu',
		'hy',
		'ia',
		'id',
		'ie',
		'ig',
		'ii',
		'ik',
		'is',
		'it',
		'iu',
		'ja',
		'jv',
		'ka',
		'kk',
		'kl',
		'km',
		'kn',
		'ko',
		'ks',
		'ku',
		'kw',
		'ky',
		'la',
		'lb',
		'ln',
		'lo',
		'lt',
		'lv',
		'mg',
		'mi',
		'mk',
		'ml',
		'mn',
		'mr',
		'ms',
		'mt',
		'my',
		'na',
		'nb',
		'nd',
		'ne',
		'nl',
		'nn',
		'no',
		'nr',
		'ny',
		'oc',
		'oj',
		'om',
		'or',
		'os',
		'pa',
		'pl',
		'ps',
		'pt',
		'qu',
		'rm',
		'rn',
		'ro',
		'ru',
		'rw',
		'sa',
		'sd',
		'se',
		'sg',
		'si',
		'sk',
		'sl',
		'sm',
		'sn',
		'so',
		'sq',
		'sr',
		'ss',
		'st',
		'su',
		'sv',
		'sw',
		'ta',
		'te',
		'tg',
		'th',
		'ti',
		'tk',
		'tl',
		'tn',
		'to',
		'tr',
		'ts',
		'tt',
		'ug',
		'uk',
		'ur',
		'uz',
		've',
		'vi',
		'vo',
		'wa',
		'wo',
		'xh',
		'yi',
		'yo',
		'za',
		'zh',
		'zu'
	];

	// Cache Intl.DisplayNames per locale (I6: avoid expensive re-instantiation)
	let langDisplayNamesCache: { locale: string; instance: Intl.DisplayNames } | null = null;
	function getLangDisplayNames(locale: string): Intl.DisplayNames {
		if (!langDisplayNamesCache || langDisplayNamesCache.locale !== locale) {
			langDisplayNamesCache = {
				locale,
				instance: new Intl.DisplayNames([locale], { type: 'language' })
			};
		}
		return langDisplayNamesCache.instance;
	}

	// Get language name from ISO 639-1 code using Intl.DisplayNames
	function getLanguageName(code: string): string {
		try {
			return getLangDisplayNames($locale || 'en').of(code) || code;
		} catch {
			return code;
		}
	}

	// Filter available languages by search, excluding already-added ones
	let filteredLanguages = $derived.by(() => {
		const existingCodes = new Set(languages.map((l) => l.code));
		const query = searchQuery.toLowerCase().trim();

		return ISO_639_1_CODES.filter((code) => !existingCodes.has(code))
			.filter((code) => {
				if (!query) return true;
				const name = getLanguageName(code).toLowerCase();
				return name.includes(query) || code.includes(query);
			})
			.slice(0, 15)
			.map((code) => ({
				code,
				name: getLanguageName(code)
			}));
	});

	// Languages sorted by proficiency (Native first, Basic last)
	let sortedLanguages = $derived(
		[...languages].sort(
			(a, b) => (proficiencyOrder[a.proficiency] ?? 4) - (proficiencyOrder[b.proficiency] ?? 4)
		)
	);

	// Badge class per proficiency level
	function proficiencyBadgeClass(proficiency: string): string {
		switch (proficiency) {
			case 'native':
				return 'badge-primary';
			case 'fluent':
				return 'badge-secondary';
			case 'conversational':
				return 'badge-info badge-outline';
			case 'basic':
				return 'badge-ghost';
			default:
				return 'badge-ghost';
		}
	}

	// Subscribe to profile metadata updates (kind 0)
	let isSaving = false;

	onMount(async () => {
		cleanup = await subscribeToProfileUpdates(
			(event) => {
				// Skip updates during save to prevent feedback loop (I1)
				if (isSaving) return;
				try {
					isInitialLoading = true;
					if (event.kind === KINDS.PROFILE_METADATA) {
						const metadata = JSON.parse(event.content);
						existingMetadata = { ...existingMetadata, ...metadata };
						if (Array.isArray(metadata.languages)) {
							languages = metadata.languages;
						}
					}
				} catch (err) {
					console.error('Failed to process languages update:', err);
				} finally {
					isInitialLoading = false;
				}
			},
			{ 0: null }
		);
	});

	// Cleanup subscription on component destroy
	onDestroy(() => {
		if (cleanup) cleanup();
	});

	// Track form completion
	$effect(() => {
		onComplete(languages.length > 0);
	});

	// Debounced save to prevent relay flooding on rapid changes
	let saveTimeout: ReturnType<typeof setTimeout> | null = null;
	function debouncedSave() {
		if (saveTimeout) clearTimeout(saveTimeout);
		saveTimeout = setTimeout(() => {
			handleSubmit();
		}, 500);
	}

	// Add a language to the list
	function addLanguage(code: string) {
		if (languages.some((l) => l.code === code)) return;
		languages = [...languages, { code, proficiency: 'conversational' }];
		searchQuery = '';
		isDropdownOpen = false;
		debouncedSave();
	}

	// Remove a language from the list
	function removeLanguage(code: string) {
		languages = languages.filter((l) => l.code !== code);
		debouncedSave();
	}

	// Update proficiency level for a language
	function updateProficiency(code: string, proficiency: string) {
		languages = languages.map((l) => (l.code === code ? { ...l, proficiency } : l));
		debouncedSave();
	}

	// Save all changes to profile metadata
	// Language names translated at read-time via Intl.DisplayNames (no API call)
	// Proficiency labels translated at read-time via existing i18n keys
	async function handleSubmit() {
		const snapshot = [...languages];
		isSaving = true;
		try {
			isLoading = true;
			error = '';

			// Build profile data — publishProfileMetadata merges with existing
			const profileData: NostrProfile = {
				languages
			};

			await publishProfileMetadata(profileData, existingMetadata);

			// Notify completion change from save (triggers toast in parent)
			onComplete(languages.length > 0, true);
		} catch (err) {
			console.error('Failed to save languages:', err);
			error = err instanceof Error ? err.message : $t('common.profile.edit.failed_to_save');
			// Rollback on failure
			languages = snapshot;
		} finally {
			isLoading = false;
			isSaving = false;
		}
	}
</script>

{#if isInitialLoading}
	<div class="space-y-6">
		<!-- Search Input Skeleton -->
		<div class="form-control">
			<div class="bg-base-300 h-4 w-32 animate-pulse rounded"></div>
			<div class="bg-base-300 mt-2 h-12 w-full animate-pulse rounded"></div>
		</div>

		<!-- Languages List Skeleton -->
		<div class="space-y-3">
			<div class="bg-base-300 h-6 w-28 animate-pulse rounded"></div>
			{#each Array(3) as _, i (i)}
				<div
					class="border-base-content/10 flex min-h-[44px] items-center gap-3 rounded-xl border p-3"
				>
					<div class="bg-base-300 h-6 w-24 animate-pulse rounded-full"></div>
					<div class="bg-base-300 h-8 flex-1 animate-pulse rounded"></div>
					<div class="bg-base-300 h-6 w-6 animate-pulse rounded-full"></div>
				</div>
			{/each}
		</div>
	</div>
{:else}
	<div class="space-y-6">
		<!-- Add Language Search -->
		<div class="form-control py-2">
			<label class="label" for="languageSearch">
				<span class="label-text font-medium">{$t('common.profile.edit.add_language')}</span>
			</label>
			<div class="relative" use:clickOutside={{ callback: () => (isDropdownOpen = false) }}>
				<input
					type="text"
					id="languageSearch"
					bind:value={searchQuery}
					class="input input-bordered w-full"
					placeholder={$t('common.profile.edit.add_language')}
					onfocus={() => (isDropdownOpen = true)}
					oninput={() => (isDropdownOpen = true)}
					disabled={isLoading}
				/>
				{#if isDropdownOpen && searchQuery.trim().length > 0}
					<ul
						class="bg-base-100 rounded-box absolute z-10 mt-1 max-h-60 w-full overflow-y-auto shadow-lg"
					>
						{#if filteredLanguages.length > 0}
							{#each filteredLanguages as lang (lang.code)}
								<li>
									<button
										class="hover:bg-base-200 flex w-full items-center gap-3 p-3 text-left"
										onclick={() => addLanguage(lang.code)}
									>
										<span class="text-base-content/40 w-8 text-center text-xs font-medium uppercase"
											>{lang.code}</span
										>
										<span>{lang.name}</span>
									</button>
								</li>
							{/each}
						{:else}
							<li class="text-base-content/50 p-3 text-sm">
								{$t('common.profile.edit.no_languages_found')}
							</li>
						{/if}
					</ul>
				{/if}
			</div>
		</div>

		<!-- Languages List -->
		{#if sortedLanguages.length > 0}
			<div class="space-y-4">
				<h3 class="text-lg font-medium">{$t('common.profile.edit.languages')}</h3>

				<div class="space-y-3">
					{#each sortedLanguages as lang (lang.code)}
						<div
							class="border-base-content/10 flex min-h-[44px] items-center gap-3 rounded-xl border p-3"
						>
							<!-- Language badge -->
							<span class="badge badge-lg {proficiencyBadgeClass(lang.proficiency)}">
								{getLanguageName(lang.code)}
							</span>

							<!-- Proficiency selector -->
							<select
								class="select select-bordered select-sm flex-1"
								value={lang.proficiency}
								onchange={(e) => updateProficiency(lang.code, e.currentTarget.value)}
								disabled={isLoading}
							>
								{#each PROFICIENCY_LEVELS as level (level.value)}
									<option value={level.value}>{$t(level.key)}</option>
								{/each}
							</select>

							<!-- Remove button -->
							<button
								aria-label={$t('common.profile.edit.remove_language')}
								class="btn btn-circle btn-accent btn-sm"
								onclick={() => removeLanguage(lang.code)}
								disabled={isLoading}
							>
								✕
							</button>
						</div>
					{/each}
				</div>
			</div>
		{:else}
			<div class="alert alert-outline">
				<span>{$t('common.profile.edit.no_languages')}</span>
			</div>
		{/if}

		<!-- Loading indicator -->
		{#if isLoading}
			<div class="flex justify-center">
				<span class="loading loading-spinner"></span>
			</div>
		{/if}

		<!-- Error Message -->
		{#if error}
			<div class="alert alert-outline alert-error">
				<span>{error}</span>
			</div>
		{/if}
	</div>
{/if}
