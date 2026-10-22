import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { readable } from 'svelte/store';
import Homepage from '../../../../routes/(company)/+page.svelte';
import { authState } from '$lib/stores/auth.store';
import { darkMode } from '$lib/stores/theme.store';

vi.mock('svelte-i18n', () => ({
	t: readable((key: string) => key),
	locale: readable('en')
}));

function pageData() {
	return {
		title: 'BitTasker',
		description: 'BitTasker home',
		keywords: '',
		canonical: 'https://bittasker.com',
		ogTitle: 'BitTasker',
		ogDescription: 'BitTasker home',
		ogImage: 'https://bittasker.com/og.png',
		twitterTitle: 'BitTasker',
		twitterDescription: 'BitTasker home',
		twitterImage: 'https://bittasker.com/og.png',
		jsonLd: null
	};
}

describe('homepage start', () => {
	it('shows the plain headline, photo cards, and one get-started button', () => {
		authState.set({ isAuthenticated: false, isLoading: false, error: null });
		darkMode.set(false);
		render(Homepage, { props: { data: pageData() } } as never);

		expect(screen.queryByTestId('homepage-slogan')).toBeNull();
		expect(screen.queryByTestId('homepage-headline')).toBeNull();
		const logo = screen.getByTestId('homepage-logo');
		expect(logo.getAttribute('src')).toBe('/images/logos/bittasker-logo-en-light-bg.svg');
		expect(logo.className).toContain('max-w-xs');
		expect(logo.className).toContain('sm:max-w-sm');
		expect(logo.className).toContain('md:max-w-md');
		expect(screen.getByTestId('homepage-tagline')).toHaveTextContent(
			'homepage.v2.hero.description'
		);
		expect(screen.getByTestId('homepage').className).toContain('bg-base-100');

		const grid = screen.getByTestId('hero-browse');
		expect(grid.className).toContain('home-cards');

		for (const id of [
			'hero-browse-tasks',
			'hero-browse-services',
			'hero-browse-goods',
			'hero-browse-staff'
		]) {
			const card = screen.getByTestId(id);
			expect(card.className).not.toContain('truncate');
			const photo = card.querySelector('img');
			expect(photo?.getAttribute('src')).toMatch(/\.webp$/);
			expect(photo?.getAttribute('width')).toBe('640');
			expect(photo?.getAttribute('height')).toBe('640');
			expect(photo?.getAttribute('loading')).toBe('lazy');
		}

		expect(screen.getByTestId('hero-browse-tasks').getAttribute('href')).toContain('/browse/tasks');
		expect(screen.getByTestId('hero-browse-tasks')).toHaveTextContent('navbar.browse_tasks');
		expect(screen.getByTestId('get-started').getAttribute('href')).toContain('/auth/signup');
		expect(screen.getByTestId('get-started')).toHaveTextContent('homepage.v2.hero.get_started');
		expect(screen.getByTestId('get-started').className).toContain('w-full');
		expect(screen.queryByTestId('signup-link')).toBeNull();
		expect(screen.queryByTestId('homepage-trust')).toBeNull();
	});

	it('uses the dark wordmark when the theme is dark', () => {
		authState.set({ isAuthenticated: false, isLoading: false, error: null });
		darkMode.set(true);
		render(Homepage, { props: { data: pageData() } } as never);
		expect(screen.getByTestId('homepage-logo').getAttribute('src')).toBe(
			'/images/logos/bittasker-logo-en-dark-bg.svg'
		);
	});
});
