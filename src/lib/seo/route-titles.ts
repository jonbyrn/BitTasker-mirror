/** Browser-tab titles. Spanish follows the locale, including the tab the visitor already has open. */
const TITLES: Record<string, { en: string; es: string }> = {
	'/': {
		en: 'Find work. Find help. Get things done. | BitTasker',
		es: 'Encuentra trabajo. Encuentra ayuda. Haz las cosas. | BitTasker'
	},
	'/about': {
		en: 'About BitTasker - Decentralized Bitcoin Task Marketplace',
		es: 'Acerca de BitTasker - Mercado de tareas con Bitcoin'
	},
	'/how-it-works': {
		en: 'How BitTasker Works - Bitcoin Task Marketplace Guide',
		es: 'Cómo funciona BitTasker - Guía del mercado de tareas'
	},
	'/faq': {
		en: 'BitTasker FAQ - Bitcoin Task Marketplace Questions',
		es: 'Preguntas frecuentes de BitTasker'
	},
	'/contact': {
		en: 'Contact BitTasker - Support & Partnership Inquiries',
		es: 'Contacto BitTasker - Soporte y alianzas'
	},
	'/security': {
		en: 'Security & Safety - BitTasker | Bitcoin Platform Security',
		es: 'Seguridad - BitTasker'
	},
	'/privacy': {
		en: 'Privacy Policy - BitTasker | Data Protection & User Privacy',
		es: 'Política de privacidad - BitTasker'
	},
	'/terms': {
		en: 'Terms of Service - BitTasker | User Agreement & Legal Terms',
		es: 'Términos de servicio - BitTasker'
	},
	'/careers': {
		en: 'Careers at BitTasker - Bitcoin Jobs | Remote Opportunities',
		es: 'Empleos en BitTasker'
	},
	'/press': {
		en: 'Press & Media - BitTasker | Company News & Media Coverage',
		es: 'Prensa - BitTasker'
	},
	'/secure-payments': {
		en: 'Secure Payment Contracts - Protected Payments | BitTasker',
		es: 'Contratos de pago seguro - BitTasker'
	},
	'/community-guidelines': {
		en: 'Community Guidelines - BitTasker | Platform Rules',
		es: 'Normas de la comunidad - BitTasker'
	},
	'/tasker-principles': {
		en: 'Tasker Principles - BitTasker',
		es: 'Principios del Tasker - BitTasker'
	},
	'/tasker-fees': {
		en: 'Fees when I need help - BitTasker',
		es: 'Tarifas cuando necesito ayuda - BitTasker'
	},
	'/taskee-fees': {
		en: 'Fees when I want work - BitTasker',
		es: 'Tarifas cuando quiero trabajo - BitTasker'
	},
	'/learn': {
		en: 'Learn — BitTasker Guides & Resources',
		es: 'Aprende — Guías y recursos de BitTasker'
	},
	'/browse/tasks': {
		en: 'Browse Tasks · BitTasker',
		es: 'Ver tareas · BitTasker'
	},
	'/browse/services': {
		en: 'Browse Services · BitTasker',
		es: 'Ver servicios · BitTasker'
	},
	'/browse/staff': {
		en: 'Temporary Staff · BitTasker',
		es: 'Personal temporal · BitTasker'
	},
	'/temporary-staff': {
		en: 'Temporary Staff · BitTasker',
		es: 'Personal temporal · BitTasker'
	},
	'/browse/goods': {
		en: 'Buy, Sell & Rent · BitTasker',
		es: 'Compra, Vende y Alquila · BitTasker'
	},
	'/categories': {
		en: 'Categories · BitTasker',
		es: 'Categorías · BitTasker'
	},
	'/search': {
		en: 'Search · BitTasker',
		es: 'Buscar · BitTasker'
	},
	'/auth/login': {
		en: 'Log in - BitTasker',
		es: 'Entrar - BitTasker'
	},
	'/auth/signup': {
		en: 'Sign up - BitTasker',
		es: 'Registrarse - BitTasker'
	},
	'/auth/onboarding': {
		en: 'Get started - BitTasker',
		es: 'Empieza - BitTasker'
	},
	'/tasks': {
		en: 'Tasks - BitTasker',
		es: 'Tareas - BitTasker'
	},
	'/services': {
		en: 'Services - BitTasker',
		es: 'Servicios - BitTasker'
	},
	'/start-earning': {
		en: 'Start earning - BitTasker',
		es: 'Empieza a ganar - BitTasker'
	},
	'/delete-account': {
		en: 'Delete account - BitTasker',
		es: 'Eliminar cuenta - BitTasker'
	}
};

/** A localized document title for this path, or null when the page sets its own. */
export function routeDocumentTitle(pathname: string, locale: string): string | null {
	const path = pathname.replace(/\/$/, '') || '/';
	const row = TITLES[path] || (path.startsWith('/search') ? TITLES['/search'] : undefined);
	if (!row) return null;
	return locale.startsWith('es') ? row.es : row.en;
}
