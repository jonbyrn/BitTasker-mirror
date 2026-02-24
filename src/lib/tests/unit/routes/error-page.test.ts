import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import ErrorPage from '../../../../routes/+error.svelte';

// Mutable mock so tests can set url/error before render
const mockPage = vi.hoisted(() => ({
	url: { pathname: '/', searchParams: new URLSearchParams(), params: {} },
	error: null as { status?: number; message?: string; code?: number } | null
}));

vi.mock('$app/state', () => ({
	page: mockPage
}));

vi.mock('$app/navigation', () => ({
	goto: vi.fn()
}));

vi.mock('$lib/components/Logo.svelte', () => ({
	default: vi.fn(() => ({ __esModule: true, default: 'div' }))
}));

describe('Error page (+error.svelte)', () => {
	beforeEach(() => {
		mockPage.url.pathname = '/';
		mockPage.error = null;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('rendering by status', () => {
		it('shows Server Error title and description for 500', async () => {
			render(ErrorPage, { props: { error: { status: 500, message: 'Internal server error' } } });
			await tick();

			expect(screen.getByText('Server Error')).toBeInTheDocument();
			expect(
				screen.getByText("Something went wrong on our end. We're working to fix this issue.")
			).toBeInTheDocument();
		});

		it('shows Page Not Found title and description for 404 from props', async () => {
			render(ErrorPage, { props: { error: { status: 404, message: 'Not found' } } });
			await tick();

			expect(screen.getByText('Page Not Found')).toBeInTheDocument();
			expect(
				screen.getByText("The page you're looking for doesn't exist or has been moved.")
			).toBeInTheDocument();
		});

		it('shows Page Not Found when page.error is Not Found and no props error', async () => {
			mockPage.error = { message: 'Not Found', status: 404 };
			mockPage.url.pathname = '/missing';
			render(ErrorPage, { props: { error: undefined } });
			await tick();

			expect(screen.getByText('Page Not Found')).toBeInTheDocument();
			expect(screen.getByText(/The page "\/missing" was not found/)).toBeInTheDocument();
		});

		it('shows Bad Request for 4xx (e.g. 400)', async () => {
			render(ErrorPage, { props: { error: { status: 400, message: 'Bad request' } } });
			await tick();

			expect(screen.getByText('Bad Request')).toBeInTheDocument();
			expect(
				screen.getByText(
					'There was an issue with your request. Please check your input and try again.'
				)
			).toBeInTheDocument();
		});
	});

	describe('diagnostic console logging', () => {
		it('calls console.error once on mount with [BitTasker Error Page] and error details', async () => {
			const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const err = { status: 500, message: 'Something broke' };
			render(ErrorPage, { props: { error: err } });
			await tick();

			expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
			expect(consoleErrorSpy).toHaveBeenCalledWith('[BitTasker Error Page]', {
				status: 500,
				message: 'Something broke',
				pathname: '/',
				propsError: err,
				pageError: null
			});
		});

		it('logs pathname and pageError when error comes from page store', async () => {
			const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			mockPage.url.pathname = '/dashboard';
			mockPage.error = { status: 503, message: 'Service unavailable' };
			render(ErrorPage, { props: { error: undefined } });
			await tick();

			expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
			expect(consoleErrorSpy).toHaveBeenCalledWith('[BitTasker Error Page]', {
				status: 503,
				message: 'Service unavailable',
				pathname: '/dashboard',
				propsError: undefined,
				pageError: mockPage.error
			});
		});

		it('logged status and message match what is shown on the page', async () => {
			const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const err = { status: 500, message: 'GraphQL request failed' };
			render(ErrorPage, { props: { error: err } });
			await tick();

			expect(consoleErrorSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
			const call = consoleErrorSpy.mock.calls[0];
			expect(call[0]).toBe('[BitTasker Error Page]');
			const payload = call[1] as { status: number; message: string };
			expect(payload.status).toBe(500);
			expect(payload.message).toBe('GraphQL request failed');

			expect(screen.getByText('Server Error')).toBeInTheDocument();
		});
	});

	describe('actions', () => {
		it('renders Go Home and Go Back buttons', async () => {
			render(ErrorPage, { props: { error: { status: 500, message: 'Error' } } });
			await tick();

			expect(screen.getByRole('button', { name: /go home/i })).toBeInTheDocument();
			expect(screen.getByRole('button', { name: /go back/i })).toBeInTheDocument();
		});
	});
});
