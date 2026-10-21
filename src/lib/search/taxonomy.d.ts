export interface SearchSubcategory {
	id: string;
	name: string;
	nameEs: string;
	skills: string[];
	keywords: string[];
}

export interface SearchCategory {
	id: string;
	name: string;
	nameEs: string;
	mode: 'local' | 'remote';
	icon: string;
	legacyCategoryIds: string[];
	hintLegacyIds?: string[];
	fromPrice: number;
	priceUnit: 'project' | 'hour';
	subcategories: SearchSubcategory[];
}

export interface PopularService {
	id: string;
	name: string;
	nameEs: string;
	categoryId: string;
}

export const SEARCH_CATEGORIES: SearchCategory[];

export const POPULAR_SERVICES: PopularService[];

export function popularRowItems(language?: string): PopularService[];

export function priceLabel(amount: number, unit: 'project' | 'hour', language?: string): string;

export function serviceSuggestions(query: string, language?: string): PopularService[];

export function fold(value: string): string;

export function categoryById(categoryId: string): SearchCategory | undefined;

export function categoriesFor(mode: 'local' | 'remote'): SearchCategory[];

export function labelFor(categoryId: string, language?: string): string;

export function subcategoryLabel(
	categoryId: string,
	subcategoryId: string,
	language?: string
): string;

export function skillsForCategory(categoryId: string): string[];

export function allTaxonomySkills(): string[];

export function categoryCopy(language?: string): {
	needDone: string;
	helpWith: string;
	popular: string;
	suggested: string;
	typical: string;
	noMatches: string;
	offer: string;
	inPerson: string;
	remote: string;
	seeAll: string;
	pickType: string;
	pickCategory: string;
	pickSub: string;
	allTypes: string;
	tasks: string;
	services: string;
	empty: string;
	unknown: string;
	loading: string;
	slow: string;
	retry: string;
	suggestedCategory: string;
	acceptSuggestion: string;
	changeSuggestion: string;
};

export const TITLE_WEIGHT: number;

export function suggestCategory(input: {
	title?: string;
	description?: string;
	skills?: string[];
	categories?: Array<string | { id?: string; name?: string }>;
}): { category: string; subcategory: string; score: number; source: 'auto' | 'fallback' };

export function classifyListing(input: {
	title?: string;
	description?: string;
	skills?: string[];
	categories?: Array<string | { id?: string; name?: string }>;
	searchCategory?: string;
	searchSubcategory?: string;
}): { category: string; subcategory: string; source: 'chosen' | 'auto' | 'corrected' | 'fallback' };
