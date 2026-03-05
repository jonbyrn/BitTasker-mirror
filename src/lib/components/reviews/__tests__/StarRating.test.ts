/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import StarRating from '../StarRating.svelte';

describe('StarRating', () => {
	it('renders with default value 0', () => {
		render(StarRating);
		const container = screen.getByRole('img', { name: /Rating: 0\.0 out of 5/i });
		expect(container).toBeInTheDocument();
	});

	it('renders 5 stars', () => {
		const { container } = render(StarRating);
		const svgs = container.querySelectorAll('svg');
		expect(svgs.length).toBe(5);
	});

	it('shows value when showValue is true', () => {
		render(StarRating, { props: { value: 3.5, showValue: true } });
		expect(screen.getByText('3.5')).toBeInTheDocument();
	});

	it('does not show value when showValue is false', () => {
		render(StarRating, { props: { value: 4, showValue: false } });
		expect(screen.queryByText('4.0')).not.toBeInTheDocument();
	});

	it('uses custom max', () => {
		const { container } = render(StarRating, { props: { value: 2, max: 10 } });
		const svgs = container.querySelectorAll('svg');
		expect(svgs.length).toBe(10);
		expect(screen.getByRole('img', { name: /Rating: 2\.0 out of 10/i })).toBeInTheDocument();
	});
});
