import { SEARCH_CATEGORIES, fold } from './taxonomy.js';

/** Shared by Typesense and the in-memory search used in tests. */
const BASE_SYNONYMS = [
	{
		id: 'dev-developer',
		synonyms: ['dev', 'developer', 'desarrollador', 'desarrollo', 'programming', 'programador']
	},
	{
		id: 'logo-design',
		synonyms: ['logo', 'design', 'diseno', 'diseño', 'designer', 'disenador', 'diseñador']
	},
	{
		id: 'writing',
		synonyms: ['writing', 'writer', 'redaccion', 'redacción', 'copywriting', 'copy']
	},
	{
		id: 'translation',
		synonyms: ['translation', 'translate', 'traduccion', 'traducción', 'translator', 'traductor']
	},
	{
		id: 'cleaning',
		synonyms: ['cleaning', 'clean', 'limpieza', 'cleaner']
	},
	{
		id: 'tutoring',
		synonyms: ['tutoring', 'tutor', 'clases', 'teacher', 'profesor', 'lesson']
	},
	{
		id: 'bitcoin',
		synonyms: ['bitcoin', 'btc', 'sats', 'satoshi', 'satoshis', 'lightning']
	},
	{
		id: 'nostr',
		synonyms: ['nostr', 'relay']
	},
	{
		id: 'ai-agent',
		synonyms: ['ai', 'agent', 'agente', 'llm', 'chatgpt']
	},
	{
		id: 'virtual-assistant',
		synonyms: ['va', 'assistant', 'asistente', 'admin']
	}
];

/** English and Spanish names for the same category, when that pair is not already a synonym. */
export function labelSynonyms(categories = SEARCH_CATEGORIES) {
	const used = new Set();
	for (const group of BASE_SYNONYMS) {
		for (const word of group.synonyms) used.add(fold(word));
	}
	/** @type {{ id: string, synonyms: string[] }[]} */
	const groups = [];
	/** @param {string} id @param {string[]} words */
	const add = (id, words) => {
		const synonyms = [];
		const seen = new Set();
		for (const word of words) {
			const clean = String(word || '').trim();
			const key = fold(clean);
			if (clean.length < 2 || !key || seen.has(key)) continue;
			seen.add(key);
			synonyms.push(clean);
		}
		if (synonyms.length < 2 || synonyms.some((word) => used.has(fold(word)))) return;
		for (const word of synonyms) used.add(fold(word));
		groups.push({ id, synonyms });
	};
	for (const category of categories) {
		add(`label-${category.id}`, [category.name, category.nameEs]);
		for (const subcategory of category.subcategories || []) {
			if (subcategory.id === 'other') continue;
			add(`label-${category.id}-${subcategory.id}`, [subcategory.name, subcategory.nameEs]);
		}
	}
	return groups;
}

export const SEARCH_SYNONYMS = [...BASE_SYNONYMS, ...labelSynonyms()];

export const SEARCH_COLLECTIONS = ['tasks', 'services', 'profiles', 'shifts', 'listings'];

export const QUERY_BY = [
	'title',
	'title_es',
	'description',
	'description_es',
	'skills',
	'category',
	'subcategory',
	'location'
].join(',');
