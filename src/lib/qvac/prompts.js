import { SEARCH_CATEGORIES } from '../search/taxonomy.js';
import { listingLines } from './listing-ids.js';

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
 * @param {'task' | 'service' | 'listing'} [kind]
 * @param {'sell' | 'rent'} [offer]
 */
export function draftMessages(text, kind = 'task', offer = 'sell') {
	const listing = kind === 'listing';
	return [
		{
			role: 'system',
			content: [
				listing
					? 'You turn a rough note or a photo description into a BitTasker buy, sell, or rent listing in El Salvador. The note may be Spanish or English.'
					: 'You turn a rough note or a photo description into a BitTasker job in El Salvador. The note may be Spanish or English.',
				'Reply with one JSON object and nothing else.',
				'Keys: title, description, categoryId, price.',
				'title is at most 80 characters. description is two or three short sentences.',
				'categoryId is exactly one id from the list.',
				'price is one suggested USD amount for El Salvador, not a United States rate.',
				'Keep price between 1 and 5000.',
				listing
					? `Categories, as id | English | Spanish:\n${listingLines(offer).join('\n')}`
					: `Categories, as id | English | Spanish | fromPrice | unit:\n${catalogLines().join('\n')}`
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
