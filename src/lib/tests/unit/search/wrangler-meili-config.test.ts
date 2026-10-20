import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function tomlSection(toml: string, header: string): string {
	const start = toml.indexOf(`\n${header}\n`);
	if (start < 0) throw new Error(`missing ${header}`);
	const rest = toml.slice(start + header.length + 2);
	const next = rest.search(/\n\[/);
	return next === -1 ? rest : rest.slice(0, next);
}

describe('production Meili config survives wrangler deploy', () => {
	const toml = readFileSync('wrangler.toml', 'utf8');
	const ci = readFileSync('.gitlab-ci.yml', 'utf8');
	const vars = tomlSection(toml, '[env.production.vars]');
	const secrets = tomlSection(toml, '[env.production.secrets]');

	it('ships the host as a plain production var', () => {
		expect(vars).toContain('MEILI_HOST = "https://ms-dc33b13a1710-25507.nyc.meilisearch.io"');
	});

	it('inherits the search key and does not commit it', () => {
		expect(vars).not.toContain('MEILI_SEARCH_KEY');
		expect(vars).not.toContain('MEILI_MASTER_KEY');
		expect(secrets).toMatch(/required\s*=\s*\[[^\]]*["']MEILI_SEARCH_KEY["']/);
		expect(toml).not.toMatch(/MEILI_SEARCH_KEY\s*=\s*"/);
		expect(ci).not.toContain('secret put MEILI_SEARCH_KEY');
	});
});
