/**
 * Start vite preview with Typesense env loaded from the host file.
 * The process environment is not printed.
 */
import { spawn } from 'node:child_process';
import { readEnvFile } from '../src/lib/search/search-key-file.js';

const file = process.env.TYPESENSE_ENV_FILE || '/opt/bittasker/typesense.env';
const stored = await readEnvFile(file);
if (!stored.TYPESENSE_API_KEY || !stored.TYPESENSE_SEARCH_ONLY_KEY) {
	console.error('Typesense env file is missing a key. Refusing to start preview.');
	process.exit(1);
}
const child = spawn(
	'npx',
	['vite', 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'],
	{
		env: {
			...process.env,
			SEARCH_PROVIDER: 'typesense',
			TYPESENSE_HOST: stored.TYPESENSE_HOST || 'http://127.0.0.1:8108',
			TYPESENSE_API_KEY: stored.TYPESENSE_API_KEY,
			TYPESENSE_SEARCH_ONLY_KEY: stored.TYPESENSE_SEARCH_ONLY_KEY
		},
		stdio: 'inherit'
	}
);
child.on('exit', (code) => process.exit(code ?? 0));
