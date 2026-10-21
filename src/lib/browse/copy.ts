export interface BrowseCopy {
	tasks: string;
	services: string;
	staff: string;
	search: string;
	category: string;
	role: string;
	any: string;
	maxPrice: string;
	maxRate: string;
	location: string;
	inPerson: string;
	remote: string;
	date: string;
	empty: string;
	loading: string;
	shifts: string;
	workers: string;
	noWorkers: string;
	postShift: string;
	off: string;
	allCountries: string;
	homeRegion: string;
}

const EN: BrowseCopy = {
	tasks: 'Browse Tasks',
	services: 'Browse Services',
	staff: 'Browse Temporary Staff',
	search: 'Search',
	category: 'Category',
	role: 'Role',
	any: 'Any',
	maxPrice: 'Max price (USD)',
	maxRate: 'Max hourly rate',
	location: 'Location',
	inPerson: 'In person',
	remote: 'Remote',
	date: 'Date on or after',
	empty: 'Nothing matches.',
	loading: 'Loading…',
	shifts: 'Open shifts',
	workers: 'Workers',
	noWorkers: 'No workers yet.',
	postShift: 'Post a shift',
	off: 'Temp staff is not turned on.',
	allCountries: 'All countries',
	homeRegion: 'El Salvador and Latin America'
};

const ES: BrowseCopy = {
	tasks: 'Ver tareas',
	services: 'Ver servicios',
	staff: 'Ver personal temporal',
	search: 'Buscar',
	category: 'Categoría',
	role: 'Puesto',
	any: 'Cualquiera',
	maxPrice: 'Precio máximo (USD)',
	maxRate: 'Pago máximo por hora',
	location: 'Lugar',
	inPerson: 'En persona',
	remote: 'A distancia',
	date: 'Fecha desde',
	empty: 'Nada coincide.',
	loading: 'Cargando…',
	shifts: 'Turnos abiertos',
	workers: 'Personas',
	noWorkers: 'Todavía no hay personas.',
	postShift: 'Publicar un turno',
	off: 'El personal temporal no está activado.',
	allCountries: 'Todos los países',
	homeRegion: 'El Salvador y Latinoamérica'
};

export function browseCopy(language: string): BrowseCopy {
	return language.startsWith('es') ? ES : EN;
}
