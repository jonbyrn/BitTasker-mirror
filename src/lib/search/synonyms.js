/** Shared by Typesense and the in-memory search used in tests. */
export const SEARCH_SYNONYMS = [
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

export const SEARCH_COLLECTIONS = ['tasks', 'services', 'profiles'];

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
