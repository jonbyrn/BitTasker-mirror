import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { readable } from 'svelte/store';
import Footer from '$lib/components/BitTaskerFooter.svelte';

vi.mock('svelte-i18n', () => ({
	t: readable((key: string) => key),
	locale: readable('en')
}));

describe('site footer', () => {
	it('lines up four columns, production-sized badges, and the real social links', () => {
		render(Footer);

		expect(screen.getByRole('heading', { name: 'footer.company_name' })).toBeTruthy();
		expect(screen.getByRole('heading', { name: 'footer.for_taskers' })).toBeTruthy();
		expect(screen.getByRole('heading', { name: 'footer.for_taskees' })).toBeTruthy();
		expect(screen.getByRole('heading', { name: 'footer.company' })).toBeTruthy();
		expect(screen.getByText('footer.company_description')).toBeTruthy();
		expect(screen.getByText('footer.copyright_notice')).toBeTruthy();
		const made = screen.getByTestId('site-footer').querySelector('.site-footer__made');
		expect(made?.textContent).toContain('footer.made_with');
		expect(made?.textContent).toContain('footer.and');
		expect(made?.textContent).toContain('footer.in_el_salvador');

		expect(screen.getByRole('link', { name: 'footer.tasker_fees' }).getAttribute('href')).toBe(
			'/tasker-fees'
		);
		expect(screen.getByRole('link', { name: 'footer.escrow' }).getAttribute('href')).toBe(
			'/secure-payments'
		);
		expect(screen.getByRole('link', { name: 'footer.start_earning' }).getAttribute('href')).toBe(
			'/start-earning'
		);
		expect(screen.getByRole('link', { name: 'footer.contact' }).getAttribute('href')).toBe(
			'/contact'
		);

		const badges = screen.getByTestId('site-footer').querySelectorAll('.site-footer__badges img');
		expect(badges).toHaveLength(2);
		expect(badges[0].getAttribute('width')).toBe('162');
		expect(badges[0].getAttribute('height')).toBe('48');
		expect(badges[1].getAttribute('width')).toBe('160');
		expect(badges[1].getAttribute('height')).toBe('48');
		expect(badges[0].closest('a')?.getAttribute('href')).toContain('com.bittasker.app');
		expect(badges[1].closest('a')?.getAttribute('href')).toContain('zapstore.dev');

		const social = [...screen.getByTestId('site-footer').querySelectorAll('[data-social]')].map(
			(node) => node.getAttribute('data-social')
		);
		expect(social).toEqual([
			'nostr',
			'x',
			'whatsapp',
			'telegram',
			'facebook',
			'instagram',
			'youtube',
			'linkedin',
			'reddit',
			'tiktok',
			'rumble',
			'github'
		]);
		expect(
			screen.getByTestId('site-footer').querySelector('[data-social="nostr"]')?.getAttribute('href')
		).toBe('https://primal.net/BitTasker');
		expect(screen.getByTestId('site-footer').querySelector('a[href="#todo"]')).toBeNull();

		const css = readFileSync(resolve('src/lib/components/BitTaskerFooter.svelte'), 'utf8');
		expect(css).toMatch(/\.site-footer \{[\s\S]*padding:\s*48px 0 0;/);
		expect(css).not.toMatch(/padding:\s*3\.5rem/);
		expect(css).not.toMatch(/padding-inline:\s*2rem/);
		expect(css).toMatch(/\.site-footer__blurb[\s\S]*font-size:\s*16px;[\s\S]*line-height:\s*26px;/);
		expect(css).toMatch(/\.site-footer__links a \{[\s\S]*font-size:\s*16px;[\s\S]*line-height:\s*26px;/);
		expect(css).toMatch(/\.site-footer__made[\s\S]*font-size:\s*14px;[\s\S]*line-height:\s*20px;/);
		expect(css).toMatch(/grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/);
		expect(css).toMatch(
			/\.site-footer__heading \{[\s\S]*font-size:\s*20px;[\s\S]*font-weight:\s*500;[\s\S]*line-height:\s*30px;/
		);
		expect(css).toMatch(
			/@media \(min-width:\s*768px\)[\s\S]*\.site-footer__heading \{[\s\S]*font-size:\s*24px;[\s\S]*line-height:\s*36px;/
		);
	});
});
