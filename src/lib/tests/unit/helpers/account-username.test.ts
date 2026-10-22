import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	accountNameFromServer,
	cachedProfileUsername,
	isGeneratedAccountName,
	isPlaceholderName,
	readChosenUsername,
	rememberChosenUsername,
	usernameInputValue
} from '$lib/utils/helpers/account-username';

describe('account username', () => {
	const store = new Map<string, string>();

	afterEach(() => {
		store.clear();
		vi.mocked(localStorage.getItem).mockImplementation((key: string) => store.get(key) ?? null);
		vi.mocked(localStorage.setItem).mockImplementation((key: string, value: string) => {
			store.set(key, value);
		});
	});

	it('recognizes automatic account names', () => {
		expect(isGeneratedAccountName('user_e1a27f184e3f')).toBe(true);
		expect(isGeneratedAccountName('ada_lovelace')).toBe(false);
		expect(isPlaceholderName('User')).toBe(true);
		expect(isPlaceholderName('Ana')).toBe(false);
	});

	it('keeps a chosen name when the server still has user_hex', () => {
		vi.mocked(localStorage.getItem).mockImplementation((key: string) => store.get(key) ?? null);
		vi.mocked(localStorage.setItem).mockImplementation((key: string, value: string) => {
			store.set(key, value);
		});
		rememberChosenUsername('Ada');
		expect(readChosenUsername()).toBe('ada');
		expect(accountNameFromServer('user_e1a27f184e3f')).toBe('ada');
		expect(accountNameFromServer('kept_name')).toBe('kept_name');
	});

	it('prefills the username field, including a generated name', () => {
		expect(
			usernameInputValue({
				store: 'user_e1a27f184e3f',
				cached: '',
				chosen: ''
			})
		).toBe('user_e1a27f184e3f');
		expect(usernameInputValue({ store: 'Testing 7777', cached: 'ada', chosen: '' })).toBe('ada');
		expect(usernameInputValue({ store: '', cached: '', chosen: 'chosen_name' })).toBe(
			'chosen_name'
		);
	});

	it('reads a username stored on the cached profile', () => {
		store.set('user_profile', JSON.stringify({ username: 'ada_lovelace' }));
		expect(cachedProfileUsername()).toBe('ada_lovelace');
	});
});
