import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { readable } from 'svelte/store';
import Homepage from '../../../../routes/(company)/+page.svelte';
import { authState } from '$lib/stores/auth.store';

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
		jsonLd: null,
		homepageData: { tasks: [], services: [] }
	};
}

describe('homepage start', () => {
	it('shows the plain headline, peach doors, and a full-width start button', () => {
		authState.set({ isAuthenticated: false, isLoading: false, error: null });
		render(Homepage, { props: { data: pageData() } } as never);

		expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('homepage.v2.hero.title');
		expect(screen.getByTestId('homepage-hero-subline')).toHaveTextContent(
			'homepage.v2.hero.description'
		);

		const grid = screen.getByTestId('hero-browse');
		expect(grid.className).toContain('grid-cols-2');
		expect(grid.className).not.toContain('sm:grid-cols-4');

		const tasks = screen.getByTestId('hero-browse-tasks');
		expect(tasks.getAttribute('href')).toContain('/browse/tasks');
		expect(tasks).toHaveTextContent('homepage.v2.hero.doors.tasks_title');
		expect(tasks).toHaveTextContent('homepage.v2.hero.doors.tasks_subtitle');
		expect(tasks.querySelector('[data-icon="clipboard-search"]')).toBeTruthy();
		expect(tasks.querySelector('[data-icon="chevron"]')).toBeTruthy();

		const services = screen.getByTestId('hero-browse-services');
		expect(services.getAttribute('href')).toContain('/browse/services');
		expect(services.querySelector('[data-icon="wrench"]')).toBeTruthy();

		expect(screen.getByTestId('hero-browse-goods').getAttribute('href')).toContain('/browse/goods');
		expect(screen.getByTestId('hero-browse-goods').querySelector('[data-icon="bag"]')).toBeTruthy();

		expect(screen.getByTestId('hero-browse-staff').getAttribute('href')).toContain('/browse/staff');
		expect(
			screen.getByTestId('hero-browse-staff').querySelector('[data-icon="hard-hat"]')
		).toBeTruthy();

		const start = screen.getByTestId('signup-link');
		expect(start.getAttribute('href')).toContain('/auth/onboarding');
		expect(start).toHaveTextContent('homepage.v2.hero.cta');
		expect(start.className).toContain('w-full');

		expect(screen.queryByTestId('category-grid')).toBeNull();
		expect(screen.getByTestId('homepage-hero').className).toContain('bg-white');
	});
});
