import { fold } from '$lib/search/taxonomy.js';
import type { StaffRole } from '$lib/staffing/types';

const ROLE_WORDS: Array<{ role: StaffRole; words: string[] }> = [
	{ role: 'cleaning', words: ['cleaning', 'limpieza', 'cleaner', 'limpiar'] },
	{
		role: 'hospitality',
		words: ['waiter', 'waitress', 'mesero', 'hosteleria', 'bar tender', 'bartender']
	},
	{ role: 'events', words: ['event staff', 'evento', 'eventos'] },
	{ role: 'warehouse', words: ['warehouse', 'almacen', 'logistics', 'logistica'] },
	{ role: 'retail', words: ['retail', 'tienda', 'shop assistant', 'shop'] },
	{ role: 'promo', words: ['promo', 'promotor', 'promotora'] },
	{ role: 'admin', words: ['admin', 'office shift', 'oficina', 'data entry'] }
];

/** Suggest a shift role. The poster's selected role is kept unless they accept this. */
export function suggestStaffRole(title: string, requirements = ''): StaffRole | '' {
	const titled = fold(title);
	const rest = fold(requirements);
	let best: { role: StaffRole; score: number } | null = null;
	for (const row of ROLE_WORDS) {
		let score = 0;
		for (const word of row.words) {
			const needle = fold(word);
			if (!needle) continue;
			const points = needle.includes(' ') ? 4 : needle.length >= 8 ? 2 : 1;
			if (titled.includes(needle)) score += points * 3;
			else if (rest.includes(needle)) score += points;
		}
		if (score > 0 && (!best || score > best.score)) best = { role: row.role, score };
	}
	return best?.role || '';
}

export function staffSuggestionCopy(language: string): {
	suggested: string;
	accept: string;
	change: string;
} {
	if (String(language).startsWith('es')) {
		return {
			suggested: 'Puesto sugerido',
			accept: 'Usar este puesto',
			change: 'Puedes elegir otro abajo. Se guarda el que elijas.'
		};
	}
	return {
		suggested: 'Suggested role',
		accept: 'Use this role',
		change: 'You can pick a different role below. Your choice is what gets saved.'
	};
}
