import { describe, it, expect } from 'vitest';
import {
	getUserDisplayName,
	getUserDisplayNameFromProfile,
	getBidderDisplayName
} from '$lib/utils/helpers/userDisplayName';

describe('userDisplayName', () => {
	describe('getUserDisplayName', () => {
		it('should return fallback when user is undefined', () => {
			expect(getUserDisplayName(undefined)).toBe('');
			expect(getUserDisplayName(undefined, 'Guest')).toBe('Guest');
		});

		it('should return the display name when both name and username are present', () => {
			expect(getUserDisplayName({ username: 'alice', name: 'Alice' })).toBe('Alice');
			expect(getUserDisplayName({ username: 'bob' })).toBe('bob');
		});

		it('should trim username and name', () => {
			expect(getUserDisplayName({ username: '  alice  ', name: 'Alice' })).toBe('Alice');
			expect(getUserDisplayName({ name: '  Bob  ' })).toBe('Bob');
		});

		it('should prefer the display name over username', () => {
			expect(getUserDisplayName({ username: 'handle', name: 'Full Name' })).toBe('Full Name');
		});

		it('should return name when username is missing or whitespace-only', () => {
			expect(getUserDisplayName({ name: 'Alice' })).toBe('Alice');
			expect(getUserDisplayName({ username: '   ', name: 'Bob' })).toBe('Bob');
			expect(getUserDisplayName({ username: '', name: 'Carol' })).toBe('Carol');
		});

		it('should return fallback when both username and name are empty or whitespace', () => {
			expect(getUserDisplayName({}, 'Anonymous')).toBe('Anonymous');
			expect(getUserDisplayName({ username: '', name: '' })).toBe('');
			expect(getUserDisplayName({ username: '   ', name: '   ' }, 'Fallback')).toBe('Fallback');
		});

		it('should handle null username and name', () => {
			expect(getUserDisplayName({ username: null, name: null }, 'Guest')).toBe('Guest');
			expect(getUserDisplayName({ username: null, name: 'Alice' })).toBe('Alice');
		});
	});

	describe('getUserDisplayNameFromProfile', () => {
		it('should return fallback when userProfile or user is missing', () => {
			expect(getUserDisplayNameFromProfile(undefined, 'Guest')).toBe('Guest');
			expect(getUserDisplayNameFromProfile({}, 'Guest')).toBe('Guest');
			expect(getUserDisplayNameFromProfile({ user: undefined }, 'Guest')).toBe('Guest');
		});

		it('should delegate to getUserDisplayName when user is present', () => {
			expect(
				getUserDisplayNameFromProfile({ user: { username: 'alice', name: 'Alice' } }, 'Guest')
			).toBe('Alice');
			expect(getUserDisplayNameFromProfile({ user: { name: 'Bob' } })).toBe('Bob');
			expect(getUserDisplayNameFromProfile({ user: {} }, 'Fallback')).toBe('Fallback');
		});
	});

	describe('getBidderDisplayName', () => {
		it('should prefer userProfile over bidderName', () => {
			expect(
				getBidderDisplayName(
					'OldBidderName',
					{ user: { username: 'current_user', name: 'Current User' } },
					'Guest'
				)
			).toBe('Current User');
		});

		it('should return bidderName when userProfile has no usable name', () => {
			expect(getBidderDisplayName('BidderFromNostr', undefined, 'Guest')).toBe('BidderFromNostr');
			expect(
				getBidderDisplayName('BidderFromNostr', { user: { username: '', name: '' } }, 'Guest')
			).toBe('BidderFromNostr');
		});

		it('should reject "Anonymous" as bidderName and use fallback', () => {
			expect(getBidderDisplayName('Anonymous', undefined, 'Guest')).toBe('Guest');
			expect(getBidderDisplayName('  Anonymous  ', undefined, 'Guest')).toBe('Guest');
		});

		it('should trim bidderName', () => {
			expect(getBidderDisplayName('  trim me  ', undefined, 'Guest')).toBe('trim me');
		});

		it('should return fallback when no source is available', () => {
			expect(getBidderDisplayName(undefined, undefined, 'Guest')).toBe('Guest');
			expect(getBidderDisplayName('', undefined, 'Guest')).toBe('Guest');
			expect(getBidderDisplayName('   ', undefined, 'Guest')).toBe('Guest');
			expect(getBidderDisplayName('Anonymous', undefined, 'Guest')).toBe('Guest');
		});

		it('should use empty string as default fallback', () => {
			expect(getBidderDisplayName(undefined)).toBe('');
		});
	});
});
