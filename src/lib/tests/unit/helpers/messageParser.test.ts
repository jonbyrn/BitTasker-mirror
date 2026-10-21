import { describe, it, expect } from 'vitest';
import {
	parseMessageContent,
	isJsonSystemMessage,
	isUserToUserMessage,
	extractLocationDataFromTags,
	extractLocationData,
	extractLocationMessageText
} from '$lib/utils/helpers/messageParser';
import { TAGS } from '$lib/utils/constants/tags';

describe('messageParser', () => {
	describe('parseMessageContent', () => {
		it('should return plain text as-is', () => {
			expect(parseMessageContent('Hello world')).toBe('Hello world');
		});

		it('should return empty/whitespace as-is', () => {
			expect(parseMessageContent('')).toBe('');
			expect(parseMessageContent('   ')).toBe('   ');
		});

		it('should extract message field from bid-status JSON', () => {
			const json = JSON.stringify({ type: 'bid-status', message: 'Bid accepted!' });
			expect(parseMessageContent(json)).toBe('Bid accepted!');
		});

		it('shows the plain order line from a marketplace checkout message', () => {
			const json = JSON.stringify({
				id: 'order-1',
				type: 0,
				message: 'Order for Oak desk. The money is in BitTasker escrow.',
				items: [{ product_id: 'goods-1', quantity: 1 }],
				shipping_id: 'pickup'
			});
			expect(parseMessageContent(json)).toBe(
				'Order for Oak desk. The money is in BitTasker escrow.'
			);
			expect(isJsonSystemMessage(json)).toBe(false);
			expect(isUserToUserMessage(json)).toBe(true);
		});

		it('should return original string for other JSON (no bid-status)', () => {
			const json = JSON.stringify({ type: 'other', data: 'x' });
			expect(parseMessageContent(json)).toBe(json);
		});

		it('should return original string when JSON parse fails', () => {
			expect(parseMessageContent('{invalid')).toBe('{invalid');
		});
	});

	describe('isJsonSystemMessage', () => {
		it('should return false for plain text', () => {
			expect(isJsonSystemMessage('Hello')).toBe(false);
			expect(isJsonSystemMessage('')).toBe(false);
			expect(isJsonSystemMessage('   ')).toBe(false);
		});

		it('should return true for JSON with type property', () => {
			expect(isJsonSystemMessage(JSON.stringify({ type: 'bid-status', message: 'ok' }))).toBe(true);
			expect(isJsonSystemMessage(JSON.stringify({ type: 'bid' }))).toBe(true);
		});

		it('should return false for JSON without type property', () => {
			expect(isJsonSystemMessage(JSON.stringify({ data: 'x' }))).toBe(false);
			expect(isJsonSystemMessage(JSON.stringify([1, 2, 3]))).toBe(false);
		});

		it('should return false for invalid JSON', () => {
			expect(isJsonSystemMessage('{invalid')).toBe(false);
		});
	});

	describe('isUserToUserMessage', () => {
		it('should return true for plain text (non-system)', () => {
			expect(isUserToUserMessage('Hello')).toBe(true);
		});

		it('should return false for system messages', () => {
			expect(isUserToUserMessage(JSON.stringify({ type: 'bid-status' }))).toBe(false);
		});
	});

	describe('extractLocationDataFromTags', () => {
		it('should return null for missing event or tags', () => {
			expect(extractLocationDataFromTags(undefined as unknown as { tags: string[][] })).toBeNull();
			expect(extractLocationDataFromTags({ tags: [] })).toBeNull();
		});

		it('should return location data when l tag exists with valid JSON', () => {
			const locationData = {
				type: 'location',
				location: { lat: 1, lng: 2 },
				label: 'Home'
			};
			const event = { tags: [[TAGS.L, JSON.stringify(locationData)]] };
			expect(extractLocationDataFromTags(event)).toEqual(locationData);
		});

		it('should return null when l tag has invalid JSON', () => {
			const event = { tags: [['l', '{invalid']] };
			expect(extractLocationDataFromTags(event)).toBeNull();
		});

		it('should return null when l tag data lacks type or location/locations', () => {
			const event = { tags: [['l', JSON.stringify({ foo: 'bar' })]] };
			expect(extractLocationDataFromTags(event)).toBeNull();
		});
	});

	describe('extractLocationData', () => {
		it('should return null for empty or whitespace', () => {
			expect(extractLocationData('')).toBeNull();
			expect(extractLocationData('   ')).toBeNull();
		});

		it('should return location data from legacy [LOCATION_DATA:...] marker', () => {
			const data = { type: 'location', location: { lat: 1 }, label: 'A' };
			const text = `Check this [LOCATION_DATA:${JSON.stringify(data)}]`;
			expect(extractLocationData(text)).toEqual(data);
		});

		it('should return null when marker has invalid JSON', () => {
			expect(extractLocationData('[LOCATION_DATA:{invalid]')).toBeNull();
		});
	});

	describe('extractLocationMessageText', () => {
		it('should return empty/whitespace as-is', () => {
			expect(extractLocationMessageText('')).toBe('');
			expect(extractLocationMessageText('   ')).toBe('   ');
		});

		it('should remove [LOCATION_DATA:...] marker and trim', () => {
			const result = extractLocationMessageText(
				'Meet here [LOCATION_DATA:{"type":"location","location":{}}]  '
			);
			expect(result).toBe('Meet here');
		});
	});
});
