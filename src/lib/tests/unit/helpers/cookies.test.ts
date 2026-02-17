import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$app/environment', () => ({ browser: true }));

// Capacitor not in use in test (web path) — ensure we use document.cookie
beforeEach(() => {
	document.cookie = '';
	delete (window as Window & { Capacitor?: unknown }).Capacitor;
});

// Must be imported after $app/environment mock
const { setCookie, getCookie, deleteCookie, hasCookie } =
	await import('$lib/utils/helpers/cookies');

// In jsdom, secure cookies are not stored when origin is not HTTPS; use secure: false so tests run.
const webOptions = { secure: false };

describe('cookies', () => {
	describe('setCookie and getCookie', () => {
		it('should set and get a simple cookie', async () => {
			await setCookie('test', 'value123', webOptions);
			const value = await getCookie('test');
			expect(value).toBe('value123');
		});

		it('should encode name and value in cookie string', async () => {
			await setCookie('foo', 'bar=baz', webOptions);
			const value = await getCookie('foo');
			expect(value).toBe('bar=baz');
		});

		it('should return null for non-existent cookie', async () => {
			const value = await getCookie('nonexistent');
			expect(value).toBeNull();
		});

		it('should overwrite existing cookie with same name', async () => {
			await setCookie('name', 'first', webOptions);
			await setCookie('name', 'second', webOptions);
			const value = await getCookie('name');
			expect(value).toBe('second');
		});

		it('should default path to /', async () => {
			await setCookie('pathTest', 'v', { path: '/', ...webOptions });
			const value = await getCookie('pathTest');
			expect(value).toBe('v');
		});
	});

	describe('deleteCookie', () => {
		it('should remove cookie so getCookie returns null', async () => {
			await setCookie('toDelete', 'value', webOptions);
			expect(await getCookie('toDelete')).toBe('value');
			await deleteCookie('toDelete');
			expect(await getCookie('toDelete')).toBeNull();
		});

		it('should use default path / when not provided', async () => {
			await setCookie('delPath', 'v', webOptions);
			await deleteCookie('delPath');
			expect(await getCookie('delPath')).toBeNull();
		});
	});

	describe('hasCookie', () => {
		it('should return true when cookie exists', async () => {
			await setCookie('exists', 'yes', webOptions);
			expect(await hasCookie('exists')).toBe(true);
		});

		it('should return false when cookie does not exist', async () => {
			expect(await hasCookie('doesNotExist')).toBe(false);
		});

		it('should return false after cookie is deleted', async () => {
			await setCookie('temp', 'x', webOptions);
			expect(await hasCookie('temp')).toBe(true);
			await deleteCookie('temp');
			expect(await hasCookie('temp')).toBe(false);
		});
	});
});
