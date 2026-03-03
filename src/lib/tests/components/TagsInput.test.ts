import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import TagsInput from '$lib/components/TagsInput.svelte';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key)
	};
});

describe('TagsInput', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('prevents canonical duplicates in autocomplete mode', async () => {
		render(TagsInput, {
			props: {
				id: 'tags',
				autoComplete: 'on',
				options: ['React', 'Svelte'],
				tags: ['React']
			}
		});

		const input = screen.getByRole('textbox');
		await fireEvent.input(input, { target: { value: 'react' } });
		await fireEvent.keyDown(input, { key: 'Enter' });

		const chips = screen.getAllByLabelText('tag');
		expect(chips).toHaveLength(1);
		expect(chips[0]).toHaveTextContent('React');
	});

	it('does not insert fallback options for unmatched pasted tokens in autocomplete mode', async () => {
		render(TagsInput, {
			props: {
				id: 'tags',
				autoComplete: 'on',
				options: ['Svelte', 'TypeScript'],
				tags: []
			}
		});

		const input = screen.getByRole('textbox');
		await fireEvent.paste(input, {
			clipboardData: {
				getData: () => 'unknown,typescript'
			}
		});

		const chips = screen.getAllByLabelText('tag');
		expect(chips).toHaveLength(1);
		expect(chips[0]).toHaveTextContent('TypeScript');
	});
});
