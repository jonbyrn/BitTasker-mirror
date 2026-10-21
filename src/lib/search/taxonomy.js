/**
 * Categories modelled on Airtasker's menu: a short in-person list and a short
 * remote list. Each category has subcategories, including Other.
 * legacyCategoryIds point at TASK_CATEGORIES so older tasks still classify.
 */

/**
 * @typedef {{ id: string, name: string, nameEs: string, skills: string[], keywords: string[] }} SearchSubcategory
 * @typedef {{
 *   id: string,
 *   name: string,
 *   nameEs: string,
 *   mode: 'local' | 'remote',
 *   icon: string,
 *   legacyCategoryIds: string[],
 *   hintLegacyIds?: string[],
 *   subcategories: SearchSubcategory[]
 * }} SearchCategory
 */

/**
 * @param {string} id
 * @param {string} name
 * @param {string} nameEs
 * @param {string[]} skills
 * @param {string[]} keywords
 * @returns {SearchSubcategory}
 */
function sub(id, name, nameEs, skills, keywords) {
	return { id, name, nameEs, skills, keywords };
}

/** @returns {SearchSubcategory} */
function other() {
	return sub('other', 'Other', 'Otro', [], []);
}

/** @type {SearchCategory[]} */
export const SEARCH_CATEGORIES = [
	{
		id: 'cleaning',
		name: 'Cleaning',
		nameEs: 'Limpieza',
		mode: 'local',
		icon: 'broom',
		legacyCategoryIds: ['1'],
		subcategories: [
			sub(
				'home',
				'Home cleaning',
				'Hogar',
				['House cleaning', 'Deep cleaning'],
				['clean', 'cleaning', 'limpieza', 'maid', 'housekeeping']
			),
			sub(
				'lease',
				'End of lease',
				'Fin de contrato',
				['Deep cleaning'],
				['end of lease', 'bond clean', 'move out']
			),
			sub('office', 'Office', 'Oficina', ['Office cleaning'], ['office clean', 'commercial clean']),
			sub('laundry', 'Laundry', 'Lavandería', ['Laundry'], ['laundry', 'ironing', 'lavanderia']),
			sub('carpet', 'Carpet', 'Alfombras', ['Carpet cleaning'], ['carpet', 'rug', 'alfombra']),
			other()
		]
	},
	{
		id: 'removals',
		name: 'Removals and delivery',
		nameEs: 'Mudanzas y entregas',
		mode: 'local',
		icon: 'truck',
		legacyCategoryIds: ['3'],
		hintLegacyIds: ['23', '31'],
		subcategories: [
			sub(
				'house',
				'House move',
				'Mudanza',
				['Moving', 'Packing'],
				['removal', 'removals', 'moving', 'mover', 'mudanza']
			),
			sub(
				'item',
				'Single item',
				'Un objeto',
				['Furniture delivery'],
				['single item', 'pickup', 'pick up']
			),
			sub(
				'furniture',
				'Furniture',
				'Muebles',
				['Furniture delivery'],
				['sofa', 'fridge', 'mattress', 'furniture']
			),
			sub(
				'courier',
				'Courier',
				'Mensajería',
				['Courier'],
				['courier', 'delivery', 'entrega', 'mensajeria']
			),
			sub('rubbish', 'Rubbish', 'Basura', ['Junk removal'], ['rubbish', 'junk', 'trash', 'basura']),
			other()
		]
	},
	{
		id: 'handyman',
		name: 'Handyman',
		nameEs: 'Manitas',
		mode: 'local',
		icon: 'hammer',
		legacyCategoryIds: ['2'],
		hintLegacyIds: ['4'],
		subcategories: [
			sub(
				'repairs',
				'Repairs',
				'Reparaciones',
				['Handyman', 'Home repairs'],
				['handyman', 'repair', 'reparacion', 'fix']
			),
			sub(
				'install',
				'Installations',
				'Instalaciones',
				['Home repairs'],
				['install', 'installation', 'instalar']
			),
			sub(
				'mounting',
				'Mounting',
				'Colgar',
				['Home repairs'],
				['mount', 'hang', 'picture', 'tv wall']
			),
			sub(
				'maintenance',
				'Maintenance',
				'Mantenimiento',
				['Home repairs'],
				['maintenance', 'mantenimiento']
			),
			other()
		]
	},
	{
		id: 'assembly',
		name: 'Assembly',
		nameEs: 'Armado',
		mode: 'local',
		icon: 'screwdriver',
		legacyCategoryIds: ['21'],
		subcategories: [
			sub(
				'furniture',
				'Furniture',
				'Muebles',
				['Furniture assembly'],
				['assemble', 'assembly', 'furniture', 'armar']
			),
			sub('flatpack', 'Flatpack', 'Kit', ['Furniture assembly'], ['flatpack', 'ikea', 'flat pack']),
			sub(
				'equipment',
				'Equipment',
				'Equipos',
				['Appliance installation'],
				['equipment', 'appliance']
			),
			other()
		]
	},
	{
		id: 'gardening',
		name: 'Gardening',
		nameEs: 'Jardinería',
		mode: 'local',
		icon: 'flower',
		legacyCategoryIds: ['5'],
		subcategories: [
			sub('lawn', 'Lawn', 'Césped', ['Lawn care'], ['lawn', 'mow', 'cesped', 'grass']),
			sub('weeding', 'Weeding', 'Maleza', ['Lawn care'], ['weed', 'weeding', 'maleza']),
			sub(
				'landscaping',
				'Landscaping',
				'Paisajismo',
				['Landscaping', 'Garden design'],
				['landscap', 'garden', 'jardin']
			),
			sub('plants', 'Plants', 'Plantas', ['Garden design'], ['plant', 'hedge', 'tree']),
			other()
		]
	},
	{
		id: 'plumbing',
		name: 'Plumbing',
		nameEs: 'Plomería',
		mode: 'local',
		icon: 'pipe',
		legacyCategoryIds: [],
		hintLegacyIds: ['4'],
		subcategories: [
			sub(
				'leaks',
				'Leaks',
				'Fugas',
				['Plumbing'],
				['leak', 'plumb', 'plomero', 'plomeria', 'fuga']
			),
			sub(
				'install',
				'Installations',
				'Instalaciones',
				['Plumbing'],
				['tap', 'faucet', 'toilet', 'sink']
			),
			sub('drains', 'Drains', 'Desagües', ['Plumbing'], ['drain', 'blocked', 'desague']),
			other()
		]
	},
	{
		id: 'electrical',
		name: 'Electrical',
		nameEs: 'Electricidad',
		mode: 'local',
		icon: 'flash',
		legacyCategoryIds: [],
		hintLegacyIds: ['4'],
		subcategories: [
			sub(
				'lighting',
				'Lighting',
				'Luces',
				['Electrical work'],
				['light', 'lighting', 'lamp', 'luz']
			),
			sub(
				'outlets',
				'Outlets',
				'Enchufes',
				['Electrical work'],
				['outlet', 'socket', 'power point', 'enchufe']
			),
			sub(
				'install',
				'Installations',
				'Instalaciones',
				['Electrical work'],
				['electric', 'electrician', 'wiring', 'electricidad']
			),
			other()
		]
	},
	{
		id: 'painting',
		name: 'Painting',
		nameEs: 'Pintura',
		mode: 'local',
		icon: 'paint',
		legacyCategoryIds: [],
		hintLegacyIds: ['4'],
		subcategories: [
			sub('interior', 'Interior', 'Interior', ['Painting'], ['interior paint', 'indoor paint']),
			sub('exterior', 'Exterior', 'Exterior', ['Painting'], ['exterior paint', 'outdoor paint']),
			sub(
				'touchups',
				'Touch-ups',
				'Retoques',
				['Painting'],
				['paint', 'painting', 'pintura', 'touch up']
			),
			other()
		]
	},
	{
		id: 'pets',
		name: 'Pet care',
		nameEs: 'Mascotas',
		mode: 'local',
		icon: 'paw',
		legacyCategoryIds: ['8'],
		subcategories: [
			sub('walking', 'Dog walking', 'Paseo', ['Dog walking'], ['dog walk', 'walking', 'paseo']),
			sub(
				'sitting',
				'Sitting',
				'Cuidado',
				['Pet sitting'],
				['pet sit', 'sitting', 'mascota', 'pet care']
			),
			sub('grooming', 'Grooming', 'Peluquería', ['Pet grooming'], ['groom', 'grooming']),
			other()
		]
	},
	{
		id: 'beauty',
		name: 'Beauty',
		nameEs: 'Belleza',
		mode: 'local',
		icon: 'face',
		legacyCategoryIds: ['7'],
		subcategories: [
			sub(
				'hair',
				'Hair',
				'Cabello',
				['Hair styling'],
				['hair', 'haircut', 'cabello', 'peluqueria']
			),
			sub('nails', 'Nails', 'Uñas', ['Makeup'], ['nails', 'manicure', 'unas']),
			sub('makeup', 'Makeup', 'Maquillaje', ['Makeup'], ['makeup', 'maquillaje', 'beauty']),
			other()
		]
	},
	{
		id: 'automotive',
		name: 'Automotive',
		nameEs: 'Autos',
		mode: 'local',
		icon: 'car',
		legacyCategoryIds: ['6'],
		subcategories: [
			sub(
				'detailing',
				'Detailing',
				'Detallado',
				['Car detailing'],
				['detail', 'detailing', 'car wash']
			),
			sub(
				'mechanic',
				'Mechanic',
				'Mecánico',
				['Car repair', 'Mobile mechanic'],
				['mechanic', 'car repair', 'auto', 'automotive']
			),
			sub('battery', 'Battery', 'Batería', ['Car repair'], ['battery', 'jump start', 'bateria']),
			other()
		]
	},
	{
		id: 'events',
		name: 'Events and photography',
		nameEs: 'Eventos y fotos',
		mode: 'local',
		icon: 'camera',
		legacyCategoryIds: ['9'],
		hintLegacyIds: ['13'],
		subcategories: [
			sub(
				'events',
				'Events',
				'Eventos',
				['Event planning'],
				['event', 'wedding', 'party', 'evento']
			),
			sub(
				'photo',
				'Photography',
				'Fotos',
				['Photography'],
				['photo', 'photography', 'foto', 'fotografia']
			),
			sub('video', 'Video', 'Video', ['Videography'], ['video', 'videography', 'film']),
			other()
		]
	},
	{
		id: 'admin',
		name: 'Admin and virtual assistant',
		nameEs: 'Admin y asistente',
		mode: 'remote',
		icon: 'clipboard',
		legacyCategoryIds: ['35'],
		hintLegacyIds: ['16', '10', '15'],
		subcategories: [
			sub('inbox', 'Inbox', 'Correo', ['Virtual assistant'], ['inbox', 'email', 'correo']),
			sub(
				'scheduling',
				'Scheduling',
				'Agenda',
				['Scheduling', 'Virtual assistant'],
				['schedul', 'calendar', 'agenda']
			),
			sub('data', 'Data entry', 'Datos', ['Data entry'], ['data entry', 'spreadsheet', 'datos']),
			sub(
				'research',
				'Research',
				'Investigación',
				['Virtual assistant'],
				['research', 'investigacion', 'admin', 'assistant', 'asistente']
			),
			other()
		]
	},
	{
		id: 'computers',
		name: 'Computers and IT',
		nameEs: 'Computadoras y TI',
		mode: 'remote',
		icon: 'laptop',
		legacyCategoryIds: ['12'],
		subcategories: [
			sub(
				'setup',
				'Setup',
				'Configuración',
				['Tech support'],
				['setup', 'install windows', 'configuracion']
			),
			sub(
				'repair',
				'Repair',
				'Reparación',
				['Computer repair'],
				['computer repair', 'laptop', 'virus']
			),
			sub(
				'support',
				'Support',
				'Soporte',
				['Tech support'],
				['it support', 'tech support', 'helpdesk', 'soporte']
			),
			sub(
				'security',
				'Security',
				'Seguridad',
				['Cybersecurity'],
				['cybersecurity', 'security', 'seguridad']
			),
			other()
		]
	},
	{
		id: 'development',
		name: 'Web and app development',
		nameEs: 'Web y apps',
		mode: 'remote',
		icon: 'code',
		legacyCategoryIds: ['30'],
		subcategories: [
			sub(
				'website',
				'Website',
				'Sitio web',
				['Web development'],
				['website', 'web development', 'frontend', 'backend', 'svelte']
			),
			sub(
				'app',
				'App',
				'App',
				['App development', 'API integration'],
				['app', 'mobile', 'ios', 'android']
			),
			sub(
				'fixes',
				'Fixes',
				'Arreglos',
				['Web development'],
				['bug', 'developer', 'desarrollador', 'programming', 'wordpress']
			),
			other()
		]
	},
	{
		id: 'design',
		name: 'Design',
		nameEs: 'Diseño',
		mode: 'remote',
		icon: 'palette',
		legacyCategoryIds: [],
		hintLegacyIds: ['13'],
		subcategories: [
			sub('logo', 'Logo', 'Logo', ['Logo design', 'Graphic design'], ['logo', 'brand', 'branding']),
			sub(
				'graphics',
				'Graphics',
				'Gráficos',
				['Graphic design'],
				['graphic', 'poster', 'grafico', 'diseño', 'diseno']
			),
			sub('ui', 'UI', 'Interfaz', ['UI design'], ['ui', 'ux', 'figma', 'interface']),
			other()
		]
	},
	{
		id: 'marketing',
		name: 'Marketing',
		nameEs: 'Marketing',
		mode: 'remote',
		icon: 'bullhorn',
		legacyCategoryIds: ['18'],
		subcategories: [
			sub(
				'social',
				'Social',
				'Redes',
				['Social media', 'Content creation'],
				['social', 'instagram', 'contenido']
			),
			sub(
				'ads',
				'Ads',
				'Anuncios',
				['Brand strategy'],
				['ads', 'advertising', 'anuncio', 'campaign']
			),
			sub('seo', 'SEO', 'SEO', ['Content creation'], ['seo', 'marketing']),
			other()
		]
	},
	{
		id: 'writing',
		name: 'Writing and translation',
		nameEs: 'Redacción y traducción',
		mode: 'remote',
		icon: 'pencil',
		legacyCategoryIds: ['33'],
		hintLegacyIds: ['34'],
		subcategories: [
			sub(
				'writing',
				'Writing',
				'Redacción',
				[
					'Copywriting',
					'Summarizing',
					'Technical writing',
					'Creative writing',
					'Blog writing',
					'Resume writing'
				],
				['writing', 'writer', 'copy', 'blog', 'redaccion', 'redacción', 'summar']
			),
			sub(
				'editing',
				'Editing',
				'Edición',
				['Editing', 'Proofreading'],
				['edit', 'proofread', 'edicion', 'grammar']
			),
			sub(
				'translation',
				'Translation',
				'Traducción',
				['Translation', 'Localization', 'Subtitling', 'Interpretation'],
				['translation', 'translate', 'translator', 'traduccion', 'traducción']
			),
			other()
		]
	},
	{
		id: 'tutoring',
		name: 'Tutoring and lessons',
		nameEs: 'Clases',
		mode: 'remote',
		icon: 'school',
		legacyCategoryIds: ['11'],
		hintLegacyIds: ['36'],
		subcategories: [
			sub('school', 'School', 'Escuela', ['Tutoring'], ['tutor', 'homework', 'school', 'escuela']),
			sub(
				'languages',
				'Languages',
				'Idiomas',
				['Language teaching'],
				['language', 'english lesson', 'idioma']
			),
			sub('music', 'Music', 'Música', ['Music lessons'], ['music', 'piano', 'guitar', 'musica']),
			other()
		]
	},
	{
		id: 'bitcoin',
		name: 'Bitcoin and Nostr',
		nameEs: 'Bitcoin y Nostr',
		mode: 'remote',
		icon: 'bitcoin',
		legacyCategoryIds: ['37'],
		subcategories: [
			sub('wallet', 'Wallet', 'Billetera', ['Bitcoin'], ['wallet', 'billetera', 'bitcoin', 'btc']),
			sub('lightning', 'Lightning', 'Lightning', ['Lightning'], ['lightning', 'sats', 'satoshi']),
			sub('nostr', 'Nostr', 'Nostr', ['Nostr'], ['nostr', 'relay', 'nip']),
			other()
		]
	},
	{
		id: 'ai',
		name: 'AI agents',
		nameEs: 'Agentes de IA',
		mode: 'remote',
		icon: 'robot',
		legacyCategoryIds: ['38'],
		subcategories: [
			sub('agents', 'Agents', 'Agentes', ['AI agents'], ['ai agent', 'agente', 'agent']),
			sub('prompts', 'Prompts', 'Prompts', ['Prompt writing'], ['prompt', 'chatgpt', 'llm']),
			sub(
				'automation',
				'Automation',
				'Automatización',
				['AI agents'],
				['automation', 'automatizacion', 'gpt', 'inteligencia artificial']
			),
			other()
		]
	}
];

/** @param {string} value */
export function fold(value) {
	return String(value || '')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.trim();
}

/** @param {string} categoryId */
export function categoryById(categoryId) {
	return SEARCH_CATEGORIES.find((category) => category.id === categoryId);
}

/** @param {'local' | 'remote'} mode */
export function categoriesFor(mode) {
	return SEARCH_CATEGORIES.filter((category) => category.mode === mode);
}

/** @param {string} categoryId @param {string} [language] */
export function labelFor(categoryId, language = 'en') {
	const category = categoryById(categoryId);
	if (!category) return categoryId;
	return language.startsWith('es') ? category.nameEs : category.name;
}

/** @param {string} categoryId @param {string} subcategoryId @param {string} [language] */
export function subcategoryLabel(categoryId, subcategoryId, language = 'en') {
	const subcategory = categoryById(categoryId)?.subcategories.find(
		(item) => item.id === subcategoryId
	);
	if (!subcategory) return subcategoryId;
	return language.startsWith('es') ? subcategory.nameEs : subcategory.name;
}

/** @param {string} categoryId */
export function skillsForCategory(categoryId) {
	const category = categoryById(categoryId);
	if (!category) return [];
	const skills = category.subcategories.flatMap((subcategory) => subcategory.skills);
	return [...new Set(skills)];
}

export function allTaxonomySkills() {
	const skills = SEARCH_CATEGORIES.flatMap((category) =>
		category.subcategories.flatMap((subcategory) => subcategory.skills)
	);
	return [...new Set(skills)];
}

/** @param {string} [language] */
export function categoryCopy(language = 'en') {
	if (String(language).startsWith('es')) {
		return {
			needDone: '¿Qué necesitas?',
			offer: '¿Qué vas a hacer?',
			inPerson: 'En persona',
			remote: 'A distancia',
			seeAll: 'Todas las categorías',
			pickType: 'En persona o a distancia',
			pickCategory: 'Elige una categoría',
			pickSub: 'Elige un tipo',
			allTypes: 'Todos',
			tasks: 'Tareas',
			services: 'Servicios',
			empty: 'Todavía no hay nada en esta categoría.',
			unknown: 'Esa categoría no está en la lista.',
			loading: 'Cargando…'
		};
	}
	return {
		needDone: 'What do you need done?',
		offer: 'What will you do?',
		inPerson: 'In person',
		remote: 'Remote',
		seeAll: 'All categories',
		pickType: 'In person or remote',
		pickCategory: 'Pick a category',
		pickSub: 'Pick a type',
		allTypes: 'All',
		tasks: 'Tasks',
		services: 'Services',
		empty: 'Nothing in this category yet.',
		unknown: 'That category is not listed.',
		loading: 'Loading…'
	};
}

/**
 * @param {string} text
 * @param {string} keyword
 */
function textHas(text, keyword) {
	const needle = fold(keyword);
	if (!needle) return false;
	if (needle.length <= 3) {
		return text.split(/[^a-z0-9]+/).includes(needle);
	}
	return text.includes(needle);
}

/**
 * @param {SearchCategory} category
 * @param {string[]} categoryIds
 */
function legacyBoost(category, categoryIds) {
	if (category.legacyCategoryIds.some((id) => categoryIds.includes(String(id)))) return 5;
	if ((category.hintLegacyIds || []).some((id) => categoryIds.includes(String(id)))) return 2;
	return 0;
}

/**
 * Pick a category for items that were saved before this menu existed.
 * An explicit searchCategory on the event wins. "Other" is only used when chosen.
 *
 * @param {{
 *   title?: string,
 *   description?: string,
 *   skills?: string[],
 *   categories?: Array<string | { id?: string, name?: string }>,
 *   searchCategory?: string,
 *   searchSubcategory?: string
 * }} input
 */
export function classifyListing(input) {
	const chosen = input.searchCategory ? categoryById(input.searchCategory) : undefined;
	if (chosen) {
		const subcategory =
			chosen.subcategories.find((item) => item.id === input.searchSubcategory) ||
			chosen.subcategories[0];
		return {
			category: chosen.id,
			subcategory: subcategory?.id || '',
			source: 'chosen'
		};
	}

	const categoryIds = (input.categories || [])
		.map((category) => (typeof category === 'string' ? category : category?.id || ''))
		.filter(Boolean)
		.map(String);
	const categoryNames = (input.categories || [])
		.map((category) => (typeof category === 'string' ? category : category?.name || ''))
		.filter(Boolean);
	const text = fold(
		[input.title, input.description, ...(input.skills || []), ...categoryNames].join(' ')
	);

	/** @type {{ category: string, subcategory: string, score: number } | null} */
	let best = null;
	for (const category of SEARCH_CATEGORIES) {
		const boost = legacyBoost(category, categoryIds);
		for (const subcategory of category.subcategories) {
			if (subcategory.id === 'other') continue;
			let score = boost;
			for (const keyword of subcategory.keywords) {
				if (!textHas(text, keyword)) continue;
				score += fold(keyword).length >= 8 ? 2 : 1;
			}
			for (const skill of input.skills || []) {
				if (subcategory.skills.some((item) => fold(item) === fold(skill))) score += 2;
			}
			if (score > 0 && (!best || score > best.score)) {
				best = { category: category.id, subcategory: subcategory.id, score };
			}
		}
	}

	if (!best) return { category: '', subcategory: '', source: 'none' };
	return { category: best.category, subcategory: best.subcategory, source: 'auto' };
}
