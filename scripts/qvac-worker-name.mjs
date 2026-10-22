#!/usr/bin/env node
/**
 * Print the Worker name for one wrangler env. Refuses production.
 * stdout is the name only.
 */
import { readFileSync } from 'node:fs';

const env = process.argv[2];
const file = process.argv[3] || 'wrangler.toml';
if (!env || env === 'production' || env === 'prod') {
	process.stderr.write('Refusing a production wrangler env.\n');
	process.exit(1);
}

const text = readFileSync(file, 'utf8');
const header = `[env.${env}]`;
const start = text.indexOf(header);
if (start < 0) {
	process.stderr.write(`wrangler.toml has no ${header} section.\n`);
	process.exit(1);
}
const rest = text.slice(start + header.length);
const next = rest.search(/\n\[/);
const section = next === -1 ? rest : rest.slice(0, next);
const match = section.match(/^\s*name\s*=\s*"([^"]+)"/m);
if (!match) {
	process.stderr.write(`wrangler.toml ${header} has no name.\n`);
	process.exit(1);
}
if (match[1] === 'bittasker-prod-worker' || match[1] === 'production') {
	process.stderr.write('Refusing a production worker name.\n');
	process.exit(1);
}
process.stdout.write(match[1]);
