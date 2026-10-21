import { SEARCH_CATEGORIES } from '../search/taxonomy.js';

/** Categories the picker can show. Temporary staff stays out of suggestions. */
function suggestableCategories() {
	return SEARCH_CATEGORIES.filter((category) => category.id !== 'temp-staff');
}

/** One line per category: id | English | Spanish | fromPrice | unit */
export function catalogLines() {
	return suggestableCategories().map(
		(category) =>
			`${category.id} | ${category.name} | ${category.nameEs} | ${category.fromPrice} | ${category.priceUnit}`
	);
}

/**
 * @param {string} text
 */
export function draftMessages(text) {
	return [
		{
			role: 'system',
			content: [
				'You turn a rough note into a BitTasker job in El Salvador. The note may be Spanish or English.',
				'Reply with one JSON object and nothing else.',
				'Keys: title, description, categoryId, priceLow, priceHigh.',
				'title is at most 80 characters. description is two or three short sentences.',
				'categoryId is exactly one id from the list.',
				'Prices are USD household rates in El Salvador, not United States rates.',
				'When unsure, set priceLow to that category fromPrice and priceHigh to about two or three times fromPrice.',
				'Keep both prices between 1 and 5000.',
				'Categories, as id | English | Spanish | fromPrice | unit:',
				...catalogLines()
			].join('\n')
		},
		{ role: 'user', content: text }
	];
}

/**
 * @param {string} title
 * @param {string} description
 */
export function categoryMessages(title, description) {
	return [
		{
			role: 'system',
			content: [
				'Pick one BitTasker category for this listing. The text may be Spanish or English.',
				'Reply with one JSON object and nothing else: {"categoryId":"<id>"}.',
				'categoryId must be an id from the list.',
				'Categories, as id | English | Spanish:',
				...suggestableCategories().map(
					(category) => `${category.id} | ${category.name} | ${category.nameEs}`
				)
			].join('\n')
		},
		{
			role: 'user',
			content: `Title: ${title}\nDetails: ${description || ''}`
		}
	];
}
