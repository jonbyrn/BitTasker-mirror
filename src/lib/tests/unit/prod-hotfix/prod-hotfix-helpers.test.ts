import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE_AUTO_HIDE_MS } from '$lib/utils/wallet/balance-visibility';
import { settingsKeyErrorMessage } from '$lib/utils/settings/settings-key-error';
import { skillCatalogOptions } from '$lib/data/skill-catalog';
import { taskDetailsPath } from '$lib/utils/tasks/task-path';
import { markPrimaryImage, profilePictureFromImages } from '$lib/utils/profile/profile-picture';

describe('wallet balance visibility', () => {
	it('does not auto-hide a revealed balance', () => {
		expect(BALANCE_AUTO_HIDE_MS).toBeNull();
	});
});

describe('settings key errors', () => {
	it('maps a raw Network Error away from $t', () => {
		const translate = (key: string) =>
			key === 'settings.error.network' ? 'Network unavailable' : key;
		expect(settingsKeyErrorMessage('Network Error', translate)).toBe('Network unavailable');
		expect(settingsKeyErrorMessage('settings.error.loadKeys', translate)).toBe(
			'settings.error.loadKeys'
		);
		const en = JSON.parse(readFileSync('static/locales/en/dashboard/settings.json', 'utf8'));
		const es = JSON.parse(readFileSync('static/locales/es/dashboard/settings.json', 'utf8'));
		expect(en.settings.error.network).toBeTruthy();
		expect(es.settings.error.network).toBeTruthy();
	});
});

describe('skill catalog', () => {
	it('includes Copywriting and is not empty', () => {
		const options = skillCatalogOptions();
		expect(options.length).toBeGreaterThan(0);
		expect(options).toContain('Copywriting');
		expect(new Set(options).size).toBe(options.length);
	});
});

describe('task details path', () => {
	it('builds a refreshable /tasks/:id URL', () => {
		expect(taskDetailsPath('task-1')).toBe('/tasks/task-1');
		expect(taskDetailsPath('a/b')).toBe('/tasks/a%2Fb');
	});
});

describe('profile picture', () => {
	it('uses the first uploaded image as the kind 0 picture', () => {
		const images = markPrimaryImage([
			{ url: 'https://cdn.example/a.jpg' },
			{ url: 'https://cdn.example/b.jpg' }
		]);
		expect(images[0].isPrimary).toBe(true);
		expect(images[1].isPrimary).toBe(false);
		expect(profilePictureFromImages(images)).toBe('https://cdn.example/a.jpg');
	});
});
