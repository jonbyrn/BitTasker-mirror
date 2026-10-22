import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { headerPrimaryLinks, loggedInLogoHref, tasksHref } from '$lib/utils/nav/site-nav';

function source(path: string): string {
	return readFileSync(resolve(path), 'utf8');
}

describe('shared site nav', () => {
	it('puts the same four links on the header, with tasks at /tasks', () => {
		expect(headerPrimaryLinks.map((link) => link.id)).toEqual([
			'browse-tasks',
			'browse-services',
			'buy-sell',
			'temporary-staff'
		]);
		expect(tasksHref).toBe('/tasks');
		expect(loggedInLogoHref).toBe('/tasks');
		expect(headerPrimaryLinks[0]?.href).toBe('/tasks');
		const browse = source('src/lib/components/browse/BrowseLinks.svelte');
		const loggedIn = source('src/lib/components/topbar/ProtectedTopBar.svelte');
		const loggedOut = source('src/lib/components/topbar/PublicTopBar.svelte');
		expect(browse).toContain('headerPrimaryLinks');
		expect(loggedIn).toContain('<BrowseLinks />');
		expect(loggedIn).toContain('loggedInLogoHref');
		expect(loggedIn).toContain('position: static');
		expect(loggedIn).toContain('transform: none');
		expect(loggedIn).toContain('flex-wrap: nowrap');
		expect(loggedOut).toContain('<BrowseLinks />');
		expect(loggedOut).toContain('flex-wrap: nowrap');
	});

	it('redirects /browse/tasks and retargets the remaining task links', () => {
		expect(source('src/routes/(app)/browse/tasks/+page.ts')).toContain("redirect(307, '/tasks')");
		expect(source('src/lib/utils/consts.ts')).toContain("path: '/tasks'");
		expect(source('src/lib/utils/constants/menu.constants.ts')).toContain("href: '/tasks'");
		expect(source('src/lib/utils/constants/menu.constants.ts')).not.toContain("'/browse/tasks'");
		expect(source('src/routes/(company)/+page.svelte')).toContain("route: '/(app)/tasks'");
		expect(source('src/routes/(company)/start-earning/+page.svelte')).toContain(
			"resolve('/tasks')"
		);
	});

	it('uses the Spanish tagline for the homepage meta description', () => {
		const page = source('src/routes/(company)/+page.svelte');
		expect(page).toContain(
			'<meta name="description" content={t(\'homepage.v2.hero.description\')} />'
		);
		expect(page).toContain(
			'<meta property="og:description" content={t(\'homepage.v2.hero.description\')} />'
		);
		expect(page).toContain(
			'<meta name="twitter:description" content={t(\'homepage.v2.hero.description\')} />'
		);
		const es = JSON.parse(source('static/locales/es/home.json'));
		expect(es.homepage.v2.hero.description).toBe(
			'Contrata personas y agentes de IA, reserva personal temporal, o compra y vende. Paga en Bitcoin (USDT muy pronto) con garantía (escrow). Sin KYC. Hecho sobre Nostr.'
		);
	});

	it('shows the Spanish composer strings', () => {
		const es = JSON.parse(source('static/locales/es/dashboard/messages.json'));
		expect(es.messages.type_message_placeholder).toBe('Escribe un mensaje…');
		expect(es.messages.send_message).toBe('Enviar');
		const chat = source('src/lib/components/messages/ChatView.svelte');
		expect(chat).toContain("$t('messages.type_message_placeholder')");
		expect(chat).toContain("$t('messages.send_message')");
	});

	it('clears the sheet above the dock and drops Home and About', () => {
		const sheet = source('src/lib/components/nav/PublicMenuLinks.svelte');
		const dock = source('src/lib/components/BottomNavBar.svelte');
		expect(sheet).not.toContain('data-testid="sheet-home"');
		expect(sheet).not.toContain('data-testid="sheet-about"');
		expect(sheet).toContain('tasksHref');
		expect(dock).toContain('env(safe-area-inset-bottom, 0px)');
		expect(dock).toContain('padding-bottom: calc(1.5rem + env(safe-area-inset-bottom, 0px))');
		expect(dock).toContain('var(--app-dock-height, 5.5rem)');
	});
});
