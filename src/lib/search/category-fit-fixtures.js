/**
 * Listings sampled on rgb.bittasker.com on 2026-10-21.
 * expected is the category the audit said fits, including the misfits
 * that were filed under a catch-all.
 * @type {Array<{ id: string, kind: 'task' | 'service', title: string, description?: string, expected: string, misfit?: boolean }>}
 */
export const CATEGORY_FIT_FIXTURES = [
	{
		id: 'task-cleaner',
		kind: 'task',
		title: 'Trusted Cleaner en La Costa',
		expected: 'cleaning'
	},
	{
		id: 'task-mudanza',
		kind: 'task',
		title: 'Mudanza request',
		expected: 'removals'
	},
	{
		id: 'task-sapanish',
		kind: 'task',
		title: 'I offer sapanish interpretation services in el salvador',
		expected: 'writing',
		misfit: true
	},
	{
		id: 'task-laundry-machine',
		kind: 'task',
		title: 'Laundry machine install',
		expected: 'handyman'
	},
	{
		id: 'task-bamboo-rack',
		kind: 'task',
		title: 'bamboo rack fit',
		expected: 'handyman'
	},
	{
		id: 'task-pintura',
		kind: 'task',
		title: 'Trabajos de pintura',
		expected: 'painting'
	},
	{ id: 'task-dj', kind: 'task', title: 'DJ', expected: 'events' },
	{ id: 'task-video-editing', kind: 'task', title: 'Video Editing', expected: 'events' },
	{
		id: 'task-cloud-support',
		kind: 'task',
		title: 'Cloud Support Engineer',
		expected: 'computers'
	},
	{
		id: 'task-logo',
		kind: 'task',
		title: 'Vectorize streetwear logo',
		expected: 'design'
	},
	{
		id: 'task-fotografo',
		kind: 'task',
		title: 'Fotógrafo para marketing profesional de lexis',
		description: 'Portrait photoshoot',
		expected: 'events',
		misfit: true
	},
	{
		id: 'task-translate',
		kind: 'task',
		title: 'Transcribe/translate texts',
		expected: 'writing'
	},
	{
		id: 'task-follow-x',
		kind: 'task',
		title: 'Follow Lightning.News on X',
		description: 'Follow-on-X task',
		expected: 'marketing',
		misfit: true
	},
	{
		id: 'task-node-1',
		kind: 'task',
		title: 'Set up a self-hosted Bitcoin + Lightning node at home (El Zonte)',
		expected: 'bitcoin'
	},
	{
		id: 'task-node-2',
		kind: 'task',
		title: 'Set up a self-hosted Bitcoin + Lightning node at home (El Zonte)',
		expected: 'bitcoin'
	},
	{
		id: 'task-node-3',
		kind: 'task',
		title: 'Set up a self-hosted Bitcoin + Lightning node at home (El Zonte)',
		expected: 'bitcoin'
	},
	{
		id: 'service-shopper',
		kind: 'service',
		title: 'Personal shopper for expats',
		description: 'Groceries delivery',
		expected: 'removals'
	},
	{
		id: 'service-cameras',
		kind: 'service',
		title: 'Técnico instalador de camaras y alarmas',
		expected: 'mounting',
		misfit: true
	},
	{
		id: 'service-luminarias',
		kind: 'service',
		title: 'Servicio de instalaciones de tomas y luminarias',
		expected: 'electrical',
		misfit: true
	},
	{
		id: 'service-autocad',
		kind: 'service',
		title: 'Remodeling - DESIGN + DRAWINGS AutoCAD 2D',
		description: 'Architectural drafting',
		expected: 'design',
		misfit: true
	},
	{
		id: 'service-electricista',
		kind: 'service',
		title: 'Técnico Electricista de 4ta categoría',
		expected: 'electrical'
	},
	{
		id: 'service-sim',
		kind: 'service',
		title: 'Local tip: best SIM card and bank for expats in La Libertad',
		expected: 'admin',
		misfit: true
	},
	{
		id: 'service-obra',
		kind: 'service',
		title: 'Servicio mano de obra construcción',
		description: 'Masonry, plumbing and painting',
		expected: 'handyman',
		misfit: true
	},
	{
		id: 'service-polarizados',
		kind: 'service',
		title: 'Polarizados de ventanas',
		expected: 'automotive'
	},
	{ id: 'service-tyre', kind: 'service', title: 'Tyre fitter', expected: 'automotive' },
	{
		id: 'service-photo-1',
		kind: 'service',
		title: 'Wedding photography',
		expected: 'events'
	},
	{
		id: 'service-photo-2',
		kind: 'service',
		title: 'Portrait photography',
		expected: 'events'
	},
	{
		id: 'service-photo-3',
		kind: 'service',
		title: 'Event photographer',
		expected: 'events'
	},
	{
		id: 'service-fundraising',
		kind: 'service',
		title: 'AI Growth & Fundraising Assistant',
		expected: 'admin'
	},
	{
		id: 'service-research',
		kind: 'service',
		title: 'AI market research brief',
		expected: 'admin'
	},
	{
		id: 'service-stack-1',
		kind: 'service',
		title: 'Sovereign Tech Stack',
		expected: 'computers'
	},
	{
		id: 'service-stack-2',
		kind: 'service',
		title: 'Sovereign Tech Stack setup',
		expected: 'computers'
	},
	{
		id: 'service-stack-3',
		kind: 'service',
		title: 'Sovereign Tech Stack support',
		expected: 'computers'
	},
	{ id: 'service-wordpress', kind: 'service', title: 'WordPress fix', expected: 'development' },
	{
		id: 'service-mvp',
		kind: 'service',
		title: 'AI Startup MVP partner',
		expected: 'development'
	},
	{
		id: 'service-website-check',
		kind: 'service',
		title: '10-min AI website check',
		expected: 'development'
	},
	{
		id: 'service-mobile',
		kind: 'service',
		title: 'Mobile/AI/Blockchain engineering',
		expected: 'development'
	},
	{ id: 'service-app', kind: 'service', title: 'create an app', expected: 'development' },
	{
		id: 'service-ecrire',
		kind: 'service',
		title: 'Écrire un texte.',
		description: 'French text writing',
		expected: 'writing',
		misfit: true
	},
	{
		id: 'service-architectural',
		kind: 'service',
		title: 'Architectural DESIGN+DRAWINGS',
		expected: 'design'
	},
	{ id: 'service-graphic', kind: 'service', title: 'Graphic design', expected: 'design' },
	{
		id: 'service-thumbnails',
		kind: 'service',
		title: 'YouTube thumbnails',
		expected: 'design'
	},
	{
		id: 'service-landing',
		kind: 'service',
		title: 'Landing Page Development',
		expected: 'development',
		misfit: true
	},
	{
		id: 'service-interpretation',
		kind: 'service',
		title: 'Spanish interpretation',
		expected: 'writing'
	},
	{
		id: 'service-tutor',
		kind: 'service',
		title: 'Online Tutor - School Chemistry',
		expected: 'tutoring'
	},
	{
		id: 'service-regulatorio',
		kind: 'service',
		title: 'ASUNTOS REGULATORIOS',
		description: 'Pharma regulatory affairs',
		expected: 'admin',
		misfit: true
	},
	{ id: 'service-ops-agent', kind: 'service', title: 'Ops agent', expected: 'ai' },
	{ id: 'service-ai-translation', kind: 'service', title: 'AI translation', expected: 'ai' },
	{ id: 'service-telegram', kind: 'service', title: 'Telegram bot', expected: 'ai' },
	{
		id: 'service-agentes',
		kind: 'service',
		title: 'Construyo agentes de IA',
		expected: 'ai'
	}
];

/**
 * @param {typeof CATEGORY_FIT_FIXTURES} fixtures
 * @param {(input: { title?: string, description?: string }) => { category: string }} suggest
 */
export function measureCategoryFit(fixtures, suggest) {
	const misses = [];
	let hits = 0;
	for (const fixture of fixtures) {
		const result = suggest({ title: fixture.title, description: fixture.description });
		if (result.category === fixture.expected) hits += 1;
		else misses.push({ id: fixture.id, expected: fixture.expected, actual: result.category });
	}
	return {
		hits,
		total: fixtures.length,
		rate: fixtures.length === 0 ? 0 : hits / fixtures.length,
		misses
	};
}
