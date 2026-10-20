import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { content as upwork } from '$lib/content/taproot/freelancing/upwork-alternatives.en';
import { content as paidInBitcoin } from '$lib/content/taproot/bitcoin-freelancing/get-paid-in-bitcoin.en';
import { SLUG_MAP } from '$lib/content/taproot/slug-map';

const routeDir = 'src/routes/(company)/learn';

describe('public learn routes', () => {
	it('serves /learn from a public route', () => {
		expect(existsSync(`${routeDir}/+page.svelte`)).toBe(true);
		expect(existsSync(`${routeDir}/[...slug]/+page.svelte`)).toBe(true);
		expect(existsSync('src/routes/(company)/_taproot/+page.svelte')).toBe(false);
	});

	it('renders the article layout instead of the disabled stub', () => {
		const page = readFileSync(`${routeDir}/[...slug]/+page.svelte`, 'utf8');
		const loader = readFileSync(`${routeDir}/[...slug]/+page.ts`, 'utf8');
		expect(page).toContain('LearnPageLayout');
		expect(page).not.toContain('temporarily disabled');
		expect(loader).toContain('$lib/content/taproot/**/*.en.ts');
		expect(loader).toContain('content/taproot/');
		expect(loader).toContain('export const prerender = true');
	});

	it('loads restored articles as learn content', () => {
		expect(upwork.hero.title.length).toBeGreaterThan(0);
		expect(paidInBitcoin.answerBlock.length).toBeGreaterThan(0);
	});

	it('has an English article for every slug', () => {
		const missing = Object.keys(SLUG_MAP).filter((key) => {
			return (
				!existsSync(`src/lib/content/taproot/${key}.en.ts`) &&
				!existsSync(`src/lib/content/taproot/${key}/index.en.ts`)
			);
		});
		expect(missing).toEqual([]);
	});
});

describe('dev deploy keeps existing Nostr data', () => {
	it('bakes an RGB asset id without switching the dev job onto sandbox relays', () => {
		const ci = readFileSync('.gitlab-ci.yml', 'utf8');
		const build = ci.split('build-development:')[1]?.split('build-production:')[0] ?? '';
		const deploy = ci.split('deploy-development:')[1]?.split('deploy-sandbox:')[0] ?? '';

		expect(build).toContain('VITE_RGB_USDT_ASSET_ID');
		expect(build).toContain('relay1-dev');
		expect(build).not.toContain('wss://nos.lol');
		expect(deploy).toContain('https://dev.bittasker.com');
		expect(deploy).toContain('VITE_RGB_USDT_ASSET_ID');
		expect(deploy).not.toContain('wss://nos.lol');
		expect(deploy).toContain('npx wrangler deploy --env dev');
	});
});
