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
	slow: string;
	retry: string;
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
	staff: 'Temporary Staff',
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
	slow: 'This is taking too long.',
	retry: 'Try again',
	shifts: 'Open shifts',
	workers: 'Workers',
	noWorkers: 'No workers yet.',
	postShift: 'Post a shift',
	off: 'Temp staff is not turned on.',
	allCountries: 'All countries',
	homeRegion: 'El Salvador'
};

const ES: BrowseCopy = {
	tasks: 'Ver tareas',
	services: 'Ver servicios',
	staff: 'Personal temporal',
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
	slow: 'Está tardando demasiado.',
	retry: 'Intentar de nuevo',
	shifts: 'Turnos abiertos',
	workers: 'Personas',
	noWorkers: 'Todavía no hay personas.',
	postShift: 'Publicar un turno',
	off: 'El personal temporal no está activado.',
	allCountries: 'Todos los países',
	homeRegion: 'El Salvador'
};

export function browseCopy(language: string): BrowseCopy {
	return language.startsWith('es') ? ES : EN;
}
