import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/svelte';
import PeoplePage from '../../../../routes/(app)/people/+page.svelte';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		locale: readable('en'),
		t: readable((key: string) => key)
	};
});

const ana = 'aa'.repeat(32);
const luis = 'bb'.repeat(32);
const cafe = 'cc'.repeat(32);

function fold(value: string): string {
	return value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase();
}

const directory = [
	{
		public_id: ana,
		pubkey: ana,
		title: 'Ana Diseñador',
		description: 'Diseño de marcas',
		category: 'design',
		picture: 'https://example.com/ana.png'
	},
	{
		public_id: luis,
		pubkey: luis,
		title: 'Luis Pérez',
		description: 'Limpieza de apartamentos',
		category: 'cleaning',
		location: 'San Salvador'
	},
	{
		public_id: cafe,
		pubkey: cafe,
		title: 'Café Luna',
		description: 'Barista',
		category: 'other'
	}
];

describe('People page', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		window.history.replaceState({}, '', '/people');
	});

	function installFetch() {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = new URL(String(input), 'https://rgb.bittasker.com');
			const q = fold(url.searchParams.get('q') || '');
			const category = url.searchParams.get('category') || '';
			const profiles = directory.filter((person) => {
				if (q && !fold(`${person.title} ${person.description}`).includes(q)) return false;
				if (category && person.category !== category) return false;
				return true;
			});
			return {
				ok: true,
				json: async () => ({ profiles, provider: 'typesense', ready: true })
			};
		});
		vi.stubGlobal('fetch', fetchMock);
		return fetchMock;
	}

	it('lists every profile when the box is empty and links to the profile', async () => {
		const fetchMock = installFetch();
		render(PeoplePage);

		await waitFor(() => {
			expect(screen.getByText('Ana Diseñador')).toBeTruthy();
		});
		expect(screen.getByText('Luis Pérez')).toBeTruthy();
		expect(screen.getByText('Café Luna')).toBeTruthy();
		expect(screen.getByTestId('people-category-tiles')).toBeTruthy();
		expect(screen.getAllByTestId('people-view-link')[0].getAttribute('href')).toContain('/npub/');
		const first = String(fetchMock.mock.calls[0][0]);
		expect(first).toContain('/api/search?');
		expect(first).toContain('type=profile');
		expect(new URL(first, 'https://rgb.bittasker.com').searchParams.get('q')).toBeNull();
	});

	it('searches diseñador, limpieza, and café with an encoded query', async () => {
		const fetchMock = installFetch();
		render(PeoplePage);
		await screen.findByText('Café Luna');

		const input = screen.getByTestId('people-search-input') as HTMLInputElement;
		for (const query of ['diseñador', 'limpieza', 'café']) {
			await fireEvent.input(input, { target: { value: query } });
			await waitFor(
				() => {
					const matched = fetchMock.mock.calls
						.map((call) => String(call[0]))
						.find(
							(url) => new URL(url, 'https://rgb.bittasker.com').searchParams.get('q') === query
						);
					expect(matched).toBeTruthy();
					expect(matched).not.toContain('ñ');
					expect(matched).not.toContain('é');
				},
				{ timeout: 2000 }
			);
		}

		await waitFor(() => {
			expect(screen.getByText('Café Luna')).toBeTruthy();
			expect(screen.queryByText('Ana Diseñador')).toBeNull();
		});
	});

	it('sends the category with the query', async () => {
		const fetchMock = installFetch();
		render(PeoplePage);
		await screen.findByText('Luis Pérez');
		const input = screen.getByTestId('people-search-input') as HTMLInputElement;
		await fireEvent.input(input, { target: { value: 'limpieza' } });
		await fireEvent.click(screen.getByTestId('people-category-tile-cleaning'));

		await waitFor(() => {
			const matched = fetchMock.mock.calls
				.map((call) => String(call[0]))
				.find((url) => {
					const params = new URL(url, 'https://rgb.bittasker.com').searchParams;
					return params.get('q') === 'limpieza' && params.get('category') === 'cleaning';
				});
			expect(matched).toBeTruthy();
		});
		expect(screen.getByText('Luis Pérez')).toBeTruthy();
		expect(screen.queryByText('Café Luna')).toBeNull();
	});

	it('reads ?q= and shows the empty state when nobody matches', async () => {
		installFetch();
		window.history.replaceState({}, '', '/people?q=nadie');
		render(PeoplePage);
		await waitFor(() => {
			expect(screen.getByTestId('people-search-empty')).toBeTruthy();
		});
		expect((screen.getByTestId('people-search-input') as HTMLInputElement).value).toBe('nadie');
	});
});
