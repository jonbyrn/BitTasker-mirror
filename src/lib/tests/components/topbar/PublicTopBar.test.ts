import { readFileSync } from 'node:fs';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import PublicTopBar from '$lib/components/topbar/PublicTopBar.svelte';
import en from '../../../../../static/locales/en/home.json';
import es from '../../../../../static/locales/es/home.json';

describe('PublicTopBar', () => {
	it('opens a mobile sheet with the header links plus login and sign up', async () => {
		render(PublicTopBar, { props: { translations: en } });

		expect(screen.queryByTestId('public-mobile-sheet')).toBeNull();
		const button = screen.getByTestId('public-mobile-menu');
		expect(button.className).toContain('lg:hidden');
		await fireEvent.click(button);

		const sheet = screen.getByTestId('public-mobile-sheet');
		expect(sheet.className).toContain('font-poppins');
		expect(screen.getByTestId('sheet-how-it-works')).toHaveAttribute('href', '/how-it-works');
		expect(screen.getByTestId('sheet-how-it-works')).toHaveTextContent('How It Works');
		expect(sheet).toHaveTextContent('For Taskers');
		expect(sheet).toHaveTextContent('For Taskees');
		expect(sheet).toHaveTextContent('Company');
		expect(screen.getByRole('link', { name: 'Post a Task' })).toHaveAttribute(
			'href',
			'/create-task'
		);
		expect(screen.getByRole('link', { name: 'Taskee Principles' })).toHaveAttribute(
			'href',
			'/tasker-principles'
		);
		expect(screen.queryByRole('link', { name: 'Tasker Principles' })).toBeNull();
		expect(screen.getByTestId('sheet-login')).toHaveAttribute('href', '/auth/login');
		expect(screen.getByTestId('sheet-signup')).toHaveAttribute('href', '/auth/signup');

		await fireEvent.keyDown(window, { key: 'Escape' });
		expect(screen.queryByTestId('public-mobile-sheet')).toBeNull();
	});

	it('does not clip the Spanish Iniciar label', () => {
		render(PublicTopBar, { props: { translations: es } });
		const login = screen.getByTestId('login-link');
		expect(login.textContent?.trim()).toBe('Iniciar');
		expect(login.className).toContain('whitespace-nowrap');
		expect(login.className).toContain('shrink-0');
		expect(screen.getByTestId('header-signup').textContent?.trim()).toBe('Registrarse');
	});

	it('keeps header login and sign up at a 44px touch height on mobile', () => {
		render(PublicTopBar, { props: { translations: en } });
		render(PublicTopBar, { props: { translations: es } });

		for (const id of ['login-link', 'header-signup']) {
			for (const button of screen.getAllByTestId(id)) {
				expect(button.className).toContain('header-auth');
				expect(button.className).toContain('whitespace-nowrap');
			}
		}
		expect(screen.getAllByTestId('login-link')[0].className).toContain('btn-secondary');
		expect(screen.getAllByTestId('header-signup')[0].className).toContain('btn-primary');

		const css = readFileSync('src/lib/components/topbar/PublicTopBar.svelte', 'utf8');
		expect(css).toContain('@media (max-width: 639px)');
		expect(css).toContain('height: 44px');
		expect(css).toContain('min-height: 44px');
		expect(css).toContain('font-size: 0.75rem');
		expect(css).not.toContain('32px');
	});
});
