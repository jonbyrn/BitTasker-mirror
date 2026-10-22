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

describe('homepage hero', () => {
	it('shows the photo cards and one get-started action', () => {
		const renderOpts = {
			props: {
				data: {
					title: 'BitTasker',
					description: 'Find work. Find help. Get things done.',
					keywords: '',
					canonical: 'https://bittasker.com',
					ogTitle: 'BitTasker',
					ogDescription: 'Find work. Find help. Get things done.',
					ogImage: 'https://bittasker.com/og.png',
					twitterTitle: 'BitTasker',
					twitterDescription: 'Find work. Find help. Get things done.',
					twitterImage: 'https://bittasker.com/og.png',
					jsonLd: null,
					translations: null
				}
			}
		} as unknown as Parameters<typeof render<typeof Homepage>>[1];
		authState.set({ isAuthenticated: false, isLoading: false, error: null });
		darkMode.set(false);
		const { container } = render(Homepage, renderOpts);

		expect(screen.queryByTestId('homepage-headline')).toBeNull();
		expect(screen.queryByTestId('homepage-slogan')).toBeNull();
		expect(screen.getByTestId('homepage-tagline').textContent).toBe('homepage.v2.hero.description');
		expect(screen.getByTestId('get-started').textContent).toContain('homepage.v2.hero.get_started');

		for (const id of [
			'hero-browse-tasks',
			'hero-browse-services',
			'hero-browse-goods',
			'hero-browse-staff'
		]) {
			const card = screen.getByTestId(id);
			expect(card.className).not.toContain('truncate');
			expect(card.querySelector('img')?.getAttribute('loading')).toBe('lazy');
			expect(card.querySelector('img')?.getAttribute('src')).toMatch(/\.webp$/);
		}

		expect(screen.getByTestId('hero-browse-tasks').textContent).toContain('navbar.browse_tasks');
		expect(screen.getByTestId('hero-browse-tasks').textContent).toContain(
			'homepage.v2.hero.cards.tasks_subtitle'
		);
		expect(screen.queryByTestId('signup-link')).toBeNull();
		expect(screen.queryByTestId('homepage-trust')).toBeNull();
		expect(screen.queryByTestId('homepage-featured-tasks')).toBeNull();
		expect(screen.queryByTestId('homepage-featured-services')).toBeNull();
		expect(container.textContent).not.toContain('Decentralized Workforce');
		expect(
			screen.getByRole('img', { name: 'common.components.logo.alt' }).getAttribute('src')
		).toBe('/images/logos/bittasker-logo-light.svg');
	});
});
