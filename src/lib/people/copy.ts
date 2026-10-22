export type PeopleCopy = {
	title: string;
	placeholder: string;
	loading: string;
	empty: string;
	emptyDirectory: string;
	view: string;
};

const EN: PeopleCopy = {
	title: 'People',
	placeholder: 'Search people',
	loading: 'Searching people',
	empty: 'No people match',
	emptyDirectory: 'No people are listed yet',
	view: 'View profile'
};

const ES: PeopleCopy = {
	title: 'Personas',
	placeholder: 'Buscar personas',
	loading: 'Buscando personas',
	empty: 'Nadie coincide',
	emptyDirectory: 'Todavía no hay personas',
	view: 'Ver perfil'
};

export function peopleCopy(language: string): PeopleCopy {
	return String(language || '').startsWith('es') ? ES : EN;
}
