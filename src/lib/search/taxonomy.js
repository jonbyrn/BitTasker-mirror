/**
 * One menu for Airtasker-style categories and TaskRabbit-style services.
 * In-person and remote categories each have subcategories, including Other.
 * Popular services point at these categories, so furniture assembly, yard work,
 * and cleaning are not listed twice. fromPrice is a typical starting price in USD.
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
 *   fromPrice: number,
 *   priceUnit: 'project' | 'hour',
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
				['removal', 'removals', 'removalist', 'mudanza']
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
				[
					'courier',
					'delivery',
					'entrega',
					'mensajeria',
					'personal shopper',
					'shopper',
					'groceries',
					'grocery',
					'mandado',
					'viveres',
					'comestibles',
					'despensa',
					'abarrotes'
				]
			),
			sub('rubbish', 'Rubbish', 'Basura', ['Junk removal'], ['rubbish', 'junk', 'trash', 'basura']),
			other()
		]
	},
	{
		id: 'moving',
		name: 'Moving help',
		nameEs: 'Ayuda para mudanza',
		mode: 'local',
		icon: 'dolly',
		legacyCategoryIds: [],
		hintLegacyIds: ['3'],
		subcategories: [
			sub(
				'lifting',
				'Heavy lifting',
				'Carga pesada',
				['Moving'],
				['heavy lifting', 'heavy lift', 'lifting help']
			),
			sub(
				'help',
				'Help moving',
				'Ayuda',
				['Moving', 'Packing'],
				['moving help', 'help moving', 'ayuda para mudanza', 'moving']
			),
			sub('packing', 'Packing', 'Empaque', ['Packing'], ['packing', 'unpack', 'boxes', 'empaque']),
			sub(
				'rearrange',
				'Rearranging',
				'Reacomodo',
				['Moving'],
				['rearrange', 'rearranging', 'in-home move']
			),
			other()
		]
	},
	{
		id: 'handyman',
		name: 'Handyman',
		nameEs: 'Reparaciones',
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
				[
					'handyman',
					'repair',
					'reparacion',
					'fix',
					'refaccion',
					'acera',
					'hormigon',
					'concreto',
					'laundry machine',
					'washing machine',
					'lavadora',
					'mano de obra',
					'construccion',
					'construcción',
					'albanil',
					'albañil',
					'masonry'
				]
			),
			sub(
				'install',
				'Installations',
				'Instalaciones',
				['Home repairs'],
				['door', 'cabinet', 'drywall', 'caulk']
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
		id: 'mounting',
		name: 'Mounting and installation',
		nameEs: 'Montaje',
		mode: 'local',
		icon: 'television',
		legacyCategoryIds: [],
		hintLegacyIds: ['4'],
		subcategories: [
			sub(
				'tv',
				'TV mounting',
				'Montar TV',
				['TV mounting'],
				['tv mounting', 'mount a tv', 'mount tv', 'television']
			),
			sub(
				'art',
				'Art and shelves',
				'Cuadros y estantes',
				['Picture hanging'],
				['shelves', 'shelf', 'art', 'mirror', 'picture', 'hang']
			),
			sub(
				'blinds',
				'Blinds',
				'Persianas',
				['Blinds installation'],
				['blinds', 'curtains', 'persianas']
			),
			sub(
				'general',
				'General mounting',
				'Montaje general',
				['General mounting'],
				[
					'mounting',
					'wall mount',
					'install shelves',
					'camara',
					'cámaras',
					'camaras',
					'alarma',
					'alarmas',
					'cctv',
					'security camera'
				]
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
			sub('yard', 'Yard work', 'Jardín', ['Lawn care'], ['yard', 'yardwork', 'yard work', 'yarda']),
			sub('lawn', 'Lawn', 'Césped', ['Lawn care'], ['lawn', 'mow', 'cesped', 'grass']),
			sub('weeding', 'Weeding', 'Maleza', ['Lawn care'], ['weed', 'weeding', 'maleza']),
			sub(
				'landscaping',
				'Landscaping',
				'Paisajismo',
				['Landscaping', 'Garden design'],
				['landscap', 'garden', 'jardin']
			),
			sub(
				'plants',
				'Plants',
				'Plantas',
				['Garden design'],
				['plant', 'hedge', 'trees', 'tree trimming']
			),
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
				['leak', 'plumb', 'plomero', 'plomeria', 'fuga', 'tuberia', 'caneria']
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
				[
					'electric',
					'electrician',
					'electricista',
					'wiring',
					'electricidad',
					'luminaria',
					'luminarias',
					'tomas'
				]
			),
			sub(
				'cooling',
				'Air conditioning',
				'Aire acondicionado',
				['Air conditioning'],
				[
					'aire acondicionado',
					'aires acondicionados',
					'air conditioner',
					'air conditioning',
					'ac install',
					'instalacion de ac',
					'reparacion de ac',
					'mini split',
					'minisplit',
					'hvac'
				]
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
				['paint', 'painting', 'pintura', 'pintar', 'pintor', 'brocha', 'touch up']
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
				[
					'mechanic',
					'car repair',
					'auto',
					'automotive',
					'automovil',
					'vehiculo',
					'polarizado',
					'tyre',
					'tire',
					'llanta',
					'llantas'
				]
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
				[
					'photo',
					'photography',
					'foto',
					'fotografia',
					'fotografo',
					'fotografa',
					'photographer',
					'photoshoot',
					'retrato'
				]
			),
			sub(
				'video',
				'Video',
				'Video',
				['Videography'],
				['video', 'videography', 'film', 'video editing', 'video edit', 'dj']
			),
			other()
		]
	},
	{
		id: 'legal',
		name: 'Legal & business',
		nameEs: 'Legal y negocios',
		mode: 'local',
		icon: 'scale',
		legacyCategoryIds: ['40'],
		subcategories: [
			sub(
				'lawyers',
				'Lawyers',
				'Abogados',
				['Lawyer'],
				['lawyer', 'lawyers', 'abogado', 'abogada']
			),
			sub(
				'notaries',
				'Notaries',
				'Notarios',
				['Notary'],
				['notary', 'notaries', 'notario', 'notaria']
			),
			sub(
				'accountants',
				'Accountants',
				'Contadores',
				['Accountant'],
				['accountant', 'accountants', 'contador', 'contadores', 'contabilidad']
			),
			sub(
				'registration',
				'Business registration',
				'Registro de empresa',
				['Business registration'],
				['business registration', 'registro de empresa', 'registro mercantil']
			),
			other()
		]
	},
	{
		id: 'temp-staff',
		name: 'Temp staff',
		nameEs: 'Personal temporal',
		mode: 'local',
		icon: 'hardhat',
		legacyCategoryIds: ['39'],
		subcategories: [
			sub(
				'hospitality',
				'Hospitality',
				'Hostelería',
				['Hospitality'],
				[
					'hospitality',
					'hosteleria',
					'waiter',
					'recepcionista',
					'receptionist',
					'recepcion',
					'front desk',
					'personal temporal'
				]
			),
			sub('events', 'Events', 'Eventos', ['Event staff'], ['event staff', 'personal de eventos']),
			sub(
				'warehouse',
				'Warehouse and logistics',
				'Almacén',
				['Warehouse'],
				['warehouse', 'logistics', 'almacen']
			),
			sub('retail', 'Retail', 'Tienda', ['Retail'], ['retail', 'shop staff', 'tienda']),
			sub('admin', 'Admin', 'Admin', ['Admin support'], ['temp admin', 'office shift']),
			sub(
				'cleaning',
				'Cleaning',
				'Limpieza',
				['Cleaning shift'],
				['cleaning shift', 'turno de limpieza']
			),
			sub(
				'promo',
				'Promo',
				'Promoción',
				['Promo staff'],
				['promo', 'promocion', 'brand ambassador']
			),
			other()
		]
	},
	{
		id: 'other',
		name: 'Other',
		nameEs: 'Otro',
		mode: 'local',
		icon: 'dots',
		legacyCategoryIds: [],
		fromPrice: 5,
		priceUnit: 'project',
		subcategories: [other()]
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
				[
					'research',
					'investigacion',
					'admin',
					'assistant',
					'asistente',
					'sim card',
					'local tip',
					'regulatorio',
					'regulatory',
					'asuntos regulatorios',
					'compliance'
				]
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
				['computer repair', 'laptop', 'virus', 'computadora', 'computadoras', 'computador']
			),
			sub(
				'support',
				'Support',
				'Soporte',
				['Tech support'],
				[
					'it support',
					'tech support',
					'helpdesk',
					'soporte',
					'cloud support',
					'support engineer',
					'tech stack',
					'sovereign'
				]
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
				[
					'website',
					'web development',
					'frontend',
					'backend',
					'svelte',
					'pagina web',
					'web',
					'landing page',
					'landing'
				]
			),
			sub(
				'app',
				'App',
				'App',
				['App development', 'API integration'],
				['app', 'mobile', 'ios', 'android', 'api', 'apis', 'integracion de api']
			),
			sub(
				'fixes',
				'Fixes',
				'Arreglos',
				['Web development'],
				[
					'bug',
					'developer',
					'desarrollador',
					'programming',
					'wordpress',
					'mvp',
					'migracion',
					'migrar',
					'migrar base de datos',
					'ci/cd',
					'pipeline',
					'monitoreo',
					'monitoring',
					'pruebas automatizadas',
					'refactor',
					'nestjs',
					'react',
					'componente',
					'component',
					'tabla editable',
					'editable table'
				]
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
				[
					'graphic',
					'poster',
					'grafico',
					'diseño',
					'diseno',
					'design',
					'drawing',
					'drawings',
					'autocad',
					'thumbnail',
					'miniatura'
				]
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
				['social', 'instagram', 'contenido', 'twitter', 'on x']
			),
			sub(
				'ads',
				'Ads',
				'Anuncios',
				['Brand strategy'],
				['ads', 'advertising', 'anuncio', 'campaign']
			),
			sub(
				'seo',
				'SEO',
				'SEO',
				['Content creation'],
				[
					'seo',
					'optimizacion seo',
					'marketing',
					'tienda online',
					'ecommerce',
					'e-commerce',
					'comercio electronico'
				]
			),
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
				[
					'writing',
					'article writing',
					'writer',
					'copy',
					'blog',
					'redaccion',
					'redacción',
					'summar',
					'ecrire',
					'texte',
					'rediger'
				]
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
				[
					'translation',
					'translate',
					'translator',
					'traduccion',
					'traducción',
					'interpretation',
					'interpreter',
					'interpreting',
					'interpretacion',
					'interpretación',
					'interprete',
					'intérprete',
					'sapanish',
					'spanish interpretation'
				]
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
				[
					'automation',
					'automatizacion',
					'gpt',
					'inteligencia artificial',
					'ai translation',
					'telegram',
					'telegram bot'
				]
			),
			other()
		]
	}
];

/**
 * Typical starting prices in USD for El Salvador, not US or Australian rates.
 * Visits use published San Salvador "desde" prices: cleaning $15, plumbing $30,
 * electrical $35, painting $8, gardening $15, and a truck move $150.
 * Hourly work stays above the June 2025 commerce ordinary hour of $1.68.
 */
const TYPICAL_PRICES = {
	cleaning: { amount: 15, unit: 'project' },
	removals: { amount: 150, unit: 'project' },
	moving: { amount: 25, unit: 'project' },
	handyman: { amount: 8, unit: 'hour' },
	assembly: { amount: 15, unit: 'project' },
	mounting: { amount: 18, unit: 'project' },
	gardening: { amount: 15, unit: 'project' },
	plumbing: { amount: 30, unit: 'project' },
	electrical: { amount: 35, unit: 'project' },
	painting: { amount: 8, unit: 'hour' },
	pets: { amount: 4, unit: 'hour' },
	beauty: { amount: 12, unit: 'project' },
	automotive: { amount: 8, unit: 'hour' },
	events: { amount: 15, unit: 'hour' },
	legal: { amount: 25, unit: 'project' },
	'temp-staff': { amount: 3, unit: 'hour' },
	admin: { amount: 4, unit: 'hour' },
	computers: { amount: 10, unit: 'hour' },
	development: { amount: 12, unit: 'hour' },
	design: { amount: 8, unit: 'hour' },
	marketing: { amount: 6, unit: 'hour' },
	writing: { amount: 5, unit: 'hour' },
	tutoring: { amount: 8, unit: 'hour' },
	bitcoin: { amount: 10, unit: 'hour' },
	ai: { amount: 10, unit: 'hour' },
	other: { amount: 5, unit: 'project' }
};

for (const category of SEARCH_CATEGORIES) {
	const price = TYPICAL_PRICES[category.id];
	category.fromPrice = price.amount;
	category.priceUnit = price.unit;
}

/**
 * TaskRabbit-style popular services. Each one points at a category above.
 * @type {{ id: string, name: string, nameEs: string, categoryId: string }[]}
 */
/**
 * Popular chips that repeat a category already on the grid.
 * "Mounting" repeats "Mounting and installation". An exact name repeats too.
 * @param {string} [language]
 * @returns {PopularService[]}
 */
export function popularRowItems(language = 'en') {
	const spanish = String(language).startsWith('es');
	return POPULAR_SERVICES.filter((service) => {
		const category = SEARCH_CATEGORIES.find((item) => item.id === service.categoryId);
		if (!category) return false;
		const serviceName = fold(spanish ? service.nameEs : service.name);
		const categoryName = fold(spanish ? category.nameEs : category.name);
		if (!serviceName || !categoryName) return false;
		if (serviceName === categoryName) return false;
		if (categoryName.startsWith(`${serviceName} `)) return false;
		return true;
	});
}

export const POPULAR_SERVICES = [
	{
		id: 'furniture-assembly',
		name: 'Furniture assembly',
		nameEs: 'Armado de muebles',
		categoryId: 'assembly'
	},
	{ id: 'mounting', name: 'Mounting', nameEs: 'Montaje', categoryId: 'mounting' },
	{ id: 'moving-help', name: 'Moving help', nameEs: 'Ayuda para mudanza', categoryId: 'moving' },
	{ id: 'cleaning', name: 'Cleaning', nameEs: 'Limpieza', categoryId: 'cleaning' },
	{ id: 'handyman', name: 'Handyman', nameEs: 'Reparaciones', categoryId: 'handyman' },
	{ id: 'yard-work', name: 'Yard work', nameEs: 'Jardín', categoryId: 'gardening' }
];

/**
 * @param {number} amount
 * @param {'project' | 'hour'} unit
 * @param {string} [language]
 */
export function priceLabel(amount, unit, language = 'en') {
	const money = `$${amount}`;
	if (String(language).startsWith('es')) {
		return unit === 'hour' ? `Desde ${money}/h` : `Desde ${money}`;
	}
	return unit === 'hour' ? `From ${money}/hr` : `From ${money}`;
}

/**
 * Suggested services for the home-page search. An empty query shows the popular strip.
 * @param {string} query
 * @param {string} [language]
 */
export function serviceSuggestions(query, language = 'en') {
	const needle = fold(query);
	/** @type {{ id: string, name: string, nameEs: string, categoryId: string }[]} */
	const items = [];
	const seen = new Set();
	const push = (item) => {
		const key = `${item.categoryId}:${fold(language.startsWith('es') ? item.nameEs : item.name)}`;
		if (seen.has(key)) return;
		seen.add(key);
		items.push(item);
	};
	for (const service of POPULAR_SERVICES) push(service);
	if (!needle) return items;
	for (const category of SEARCH_CATEGORIES) {
		push({
			id: category.id,
			name: category.name,
			nameEs: category.nameEs,
			categoryId: category.id
		});
		for (const subcategory of category.subcategories) {
			if (subcategory.id === 'other') continue;
			push({
				id: `${category.id}-${subcategory.id}`,
				name: subcategory.name,
				nameEs: subcategory.nameEs,
				categoryId: category.id
			});
		}
	}
	return items
		.filter((item) => {
			const label = language.startsWith('es') ? item.nameEs : item.name;
			return (
				fold(label).includes(needle) ||
				fold(item.name).includes(needle) ||
				fold(item.nameEs).includes(needle)
			);
		})
		.slice(0, 8);
}

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
			helpWith: '¿En qué necesitas ayuda?',
			popular: 'Servicios frecuentes',
			suggested: 'Sugerencias',
			typical: 'Precios de partida',
			noMatches: 'Ningún servicio coincide.',
			offer: '¿Qué vas a hacer?',
			inPerson: 'En persona',
			remote: 'A distancia',
			seeAll: 'Todas las categorías',
			suggestedCategory: 'Categoría sugerida',
			acceptSuggestion: 'Usar esta categoría',
			changeSuggestion: 'Puedes elegir otra abajo. Se guarda la que elijas.',
			pickType: 'En persona o a distancia',
			pickCategory: 'Elige una categoría',
			pickSub: 'Elige un tipo',
			allTypes: 'Todos',
			tasks: 'Tareas',
			services: 'Servicios',
			empty: 'Todavía no hay nada en esta categoría.',
			unknown: 'Esa categoría no está en la lista.',
			loading: 'Cargando…',
			slow: 'Está tardando demasiado.',
			retry: 'Intentar de nuevo'
		};
	}
	return {
		needDone: 'What do you need done?',
		helpWith: 'What do you need help with?',
		popular: 'Popular services',
		suggested: 'Suggested',
		typical: 'Typical starting prices',
		noMatches: 'No matching service.',
		offer: 'What will you do?',
		inPerson: 'In person',
		remote: 'Remote',
		seeAll: 'All categories',
		suggestedCategory: 'Suggested category',
		acceptSuggestion: 'Use this category',
		changeSuggestion: 'You can pick a different category below. Your choice is what gets saved.',
		pickType: 'In person or remote',
		pickCategory: 'Pick a category',
		pickSub: 'Pick a type',
		allTypes: 'All',
		tasks: 'Tasks',
		services: 'Services',
		empty: 'Nothing in this category yet.',
		unknown: 'That category is not listed.',
		loading: 'Loading…',
		slow: 'This is taking too long.',
		retry: 'Try again'
	};
}

/**
 * @param {string} text
 * @param {string} keyword
 */
/** Whole words. "auto" must not match automatizadas, automáticos, or AutoCAD. */
const TOKEN_KEYWORDS = new Set(['auto', 'edit']);

function textHas(text, keyword) {
	const needle = fold(keyword);
	if (!needle) return false;
	if (needle.length <= 3 || TOKEN_KEYWORDS.has(needle)) {
		return text.split(/[^a-z0-9]+/).includes(needle);
	}
	return text.includes(needle);
}

/**
 * @param {SearchCategory} category
 * @param {string[]} categoryIds
 */
/** Stored category names are a hint. They are not scanned as keywords. */
const NAME_HINTS = {
	cleaning: ['cleaning', 'limpieza'],
	removals: ['deliver', 'logistic', 'courier'],
	moving: ['moving', 'mudanza'],
	handyman: ['home improvement', 'handyman'],
	assembly: ['assembl'],
	mounting: ['mount'],
	electrical: ['electric'],
	plumbing: ['plumb', 'plomer'],
	painting: ['paint', 'pintur'],
	gardening: ['garden', 'jardin'],
	automotive: ['automotive', 'vehicle'],
	events: ['photo', 'event'],
	legal: ['abogado', 'notario', 'contador', 'lawyer', 'notary', 'accountant'],
	pets: ['pet', 'mascot'],
	beauty: ['beauty', 'belleza'],
	admin: ['assistant', 'financial', 'legal'],
	computers: ['technology & it', 'tech & it'],
	development: ['web development', 'software', 'it and web'],
	design: ['design', 'creativ'],
	marketing: ['marketing'],
	writing: ['writing', 'translat', 'redac'],
	tutoring: ['tutor', 'educat', 'coach'],
	bitcoin: ['bitcoin'],
	ai: ['inteligencia artificial']
};

/**
 * @param {string} categoryId
 * @param {string[]} categoryNames
 */
function nameHint(categoryId, categoryNames) {
	const blob = fold(categoryNames.join(' '));
	const hints = NAME_HINTS[categoryId] || [];
	if (!blob || hints.length === 0) return 0;
	return hints.some((hint) => blob.includes(fold(hint))) ? 1 : 0;
}

function legacyBoost(category, categoryIds) {
	if (category.legacyCategoryIds.some((id) => categoryIds.includes(String(id)))) return 5;
	if ((category.hintLegacyIds || []).some((id) => categoryIds.includes(String(id)))) return 2;
	return 0;
}

/**
 * @param {string} text
 * @param {string} keyword
 */
/** Title matches count more than the same word in the description. */
export const TITLE_WEIGHT = 3;

function keywordPoints(text, keyword) {
	if (!textHas(text, keyword)) return 0;
	const folded = fold(keyword);
	// A phrase such as "cleaning shift" has to beat the shorter general word.
	let points = folded.length >= 8 ? 2 : 1;
	if (folded.includes(' ')) points += 2;
	return points;
}

/**
 * A social follow is marketing even when the account name is a Bitcoin product.
 * Setting up a node or wallet stays in Bitcoin.
 * @param {string} title
 */
function marketingFollowBonus(title) {
	if (!/\bfollow\b/.test(title)) return 0;
	if (!/\b(x|twitter|instagram)\b/.test(title)) return 0;
	if (/\b(node|wallet|self-hosted|self hosted)\b/.test(title)) return 0;
	return 9;
}

/**
 * Score a title and description. The poster's saved category is ignored here.
 * Title keywords are worth TITLE_WEIGHT times the same word in the description.
 *
 * @param {{
 *   title?: string,
 *   description?: string,
 *   skills?: string[],
 *   categories?: Array<string | { id?: string, name?: string }>
 * }} input
 */
export function suggestCategory(input) {
	const categoryIds = (input.categories || [])
		.map((category) => (typeof category === 'string' ? category : category?.id || ''))
		.filter(Boolean)
		.map(String);
	const categoryNames = (input.categories || [])
		.map((category) => (typeof category === 'string' ? category : category?.name || ''))
		.filter(Boolean);
	const title = fold(input.title || '');
	const rest = fold([input.description, ...(input.skills || [])].join(' '));
	const followBonus = marketingFollowBonus(title);

	/** @type {{ category: string, subcategory: string, score: number } | null} */
	let best = null;
	/** @type {{ category: string, subcategory: string, score: number } | null} */
	let titleBest = null;
	for (const category of SEARCH_CATEGORIES) {
		const boost = legacyBoost(category, categoryIds) + nameHint(category.id, categoryNames);
		for (const subcategory of category.subcategories) {
			if (subcategory.id === 'other') continue;
			let keywordScore = 0;
			let titleScore = 0;
			for (const keyword of subcategory.keywords) {
				const fromTitle = keywordPoints(title, keyword) * TITLE_WEIGHT;
				titleScore += fromTitle;
				keywordScore += fromTitle;
				keywordScore += keywordPoints(rest, keyword);
			}
			if (category.id === 'marketing' && subcategory.id === 'social') {
				titleScore += followBonus;
				keywordScore += followBonus;
			}
			for (const skill of input.skills || []) {
				if (subcategory.skills.some((item) => fold(item) === fold(skill))) keywordScore += 2;
			}
			// A stored Automotive id is the old default trio. It must not beat real keywords.
			const stored = category.id === 'automotive' && keywordScore <= 0 ? 0 : boost;
			const score = keywordScore + stored;
			if (titleScore > 0 && (!titleBest || titleScore > titleBest.score)) {
				titleBest = { category: category.id, subcategory: subcategory.id, score: titleScore };
			}
			if (score <= 0) continue;
			if (!best || score > best.score) {
				best = { category: category.id, subcategory: subcategory.id, score };
			}
		}
	}

	// A clear title ("limpieza", "fotografo") beats a stored legacy label.
	if (titleBest && titleBest.score >= 6 && (!best || titleBest.category !== best.category)) {
		if (!best || titleBest.score >= best.score) best = titleBest;
	}

	if (best) {
		return {
			category: best.category,
			subcategory: best.subcategory,
			score: best.score,
			source: 'auto'
		};
	}
	const remote =
		textHas(title, 'remote') ||
		textHas(rest, 'remote') ||
		textHas(title, 'remoto') ||
		textHas(rest, 'remoto');
	return {
		category: remote ? 'admin' : 'other',
		subcategory: 'other',
		score: 0,
		source: 'fallback'
	};
}

/**
 * Pick a category for items that were saved before this menu existed.
 * The poster's explicit searchCategory always wins. Suggestions never overwrite it.
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
	const suggestion = suggestCategory(input);
	return {
		category: suggestion.category,
		subcategory: suggestion.subcategory,
		source: suggestion.source === 'fallback' ? 'fallback' : 'auto'
	};
}

/**
 * One category name for a task or service card.
 * @param {Parameters<typeof classifyListing>[0]} input
 * @param {string} language
 */
export function classifiedLabel(input, language) {
	const category = categoryById(classifyListing(input).category);
	if (!category) return '';
	return String(language || '').startsWith('es') ? category.nameEs : category.name;
}
