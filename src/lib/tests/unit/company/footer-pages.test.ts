import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
	return readFileSync(resolve(path), 'utf8');
}

describe('footer company pages', () => {
	it('states worker principles in English and Spanish', () => {
		const en = source('static/locales/en/taskers/principles.json');
		const es = source('static/locales/es/taskers/principles.json');
		expect(en).toContain('Deliver what you bid');
		expect(en).toContain('Non-custodial escrow release on completion');
		expect(en).not.toContain('Say what you need');
		expect(es).toContain('Entrega lo que ofertaste');
		expect(es).toContain('Principios del Tasker');
		expect(es).not.toContain('Principios de los Taskees');
	});

	it('keeps About factual and drops Lightning and the trades list', () => {
		const page = source('src/routes/(company)/about/+page.svelte');
		const en = source('static/locales/en/company/about.json');
		expect(page).toContain('about_page.areas.goods');
		expect(page).toContain('about_page.areas.staff');
		expect(page).not.toContain('features.lightning');
		expect(page).not.toContain('marketplace.item1');
		expect(en).toContain('Bit Tasker, Ltda. de C.V.');
		expect(en).toContain('KYC-free');
		expect(en).not.toContain('Bitcoin Lightning Payments');
		expect(en).not.toContain('Trades, Construction');
	});

	it('points Start Earning at signup, tasks, and staff', () => {
		const page = source('src/routes/(company)/start-earning/+page.svelte');
		const footer = source('src/lib/components/BitTaskerFooter.svelte');
		expect(footer).toContain("resolve('/tasks')");
		expect(footer).not.toContain("resolve('/start-earning')");
		expect(page).toContain("resolve('/auth/signup')");
		expect(page).toContain("resolve('/tasks')");
		expect(page).not.toContain("resolve('/browse/tasks')");
		expect(page).toContain("resolve('/browse/staff')");
		expect(page).toContain("resolve('/browse/goods')");
		const copy = source('static/locales/en/company/start-earning.json');
		expect(copy).toContain('Buy & Sell');
		expect(copy).toContain('Temporary Staff');
	});

	it('shows admin@ on contact, careers, and press without fake roles or coverage', () => {
		const careers = source('src/routes/(company)/careers/+page.svelte');
		const press = source('src/routes/(company)/press/+page.svelte');
		const contact = source('src/routes/(company)/contact/+page.svelte');
		expect(careers).toContain('admin@bittasker.com');
		expect(careers).toContain('careers.no_open_roles');
		expect(careers).not.toContain('careers.positions');
		expect(press).toContain('admin@bittasker.com');
		expect(press).toContain('/images/logos/bittasker-logomark.svg');
		expect(contact).toContain('admin@bittasker.com');
		expect(source('static/locales/en/company/press.json')).not.toContain('revolutionary');
		expect(source('src/routes/(company)/careers/+page.ts')).not.toContain('JobPosting');
		expect(source('src/routes/(company)/careers/+page.ts')).not.toContain('Lightning');
	});

	it('keeps the security sync claim and drops hot-wallet wording', () => {
		const en = source('static/locales/en/company/security.json');
		const es = source('static/locales/es/company/security.json');
		expect(en).toContain(
			'encrypted on your device using your authentication credentials before synchronization with our servers'
		);
		expect(es).toContain('antes de sincronizarse con nuestros servidores');
		expect(en.toLowerCase()).not.toContain('hot wallet');
		expect(es.toLowerCase()).not.toContain('billetera caliente');
		expect(es.toLowerCase()).not.toContain('hot wallet');
		expect(en).toContain('cold storage solutions when not actively using them');
		expect(es).toContain('almacenamiento en frío cuando no las estés usando activamente');
	});

	it('shows the production homepage call to action in Poppins', () => {
		const layout = source('src/routes/(company)/+layout.svelte');
		const en = source('static/locales/en/home.json');
		const es = source('static/locales/es/home.json');
		expect(layout).toContain('homepage.v2.finalcta.title');
		expect(layout).toContain('final-cta__title');
		expect(layout).toContain("font-family: 'Poppins', ui-sans-serif, system-ui, sans-serif");
		expect(layout).not.toContain("pathname !== '/'");
		expect(en).toContain('Join the Future of Work');
		expect(es).toContain('Únete al Futuro del Trabajo');
		expect(en).toContain('BitTasker is the place to be.');
		expect(es).toContain('BitTasker es el lugar ideal.');
	});

	it('mentions Buy & Sell and Temporary Staff on the fee pages without new rates', () => {
		const en = source('static/locales/en/taskers/fee.json');
		expect(en).toContain('Buy & Sell');
		expect(en).toContain('Temporary Staff');
		expect(en).toContain('2.5%');
		expect(en).toContain('2.0%');
		expect(en).toContain('1.5%');
		expect(source('src/routes/(company)/tasker-fees/+page.svelte')).toContain(
			'tasker.fees.structure.areas'
		);
		expect(source('src/routes/(company)/taskee-fees/+page.svelte')).toContain(
			'fees.structure.areas'
		);
		expect(source('src/routes/(company)/tasker-fees/+page.svelte')).toContain('DocumentTitle');
		expect(source('src/routes/(company)/tasker-fees/+page.svelte')).not.toContain(
			'<title>{seo.title}</title>'
		);
	});
});
