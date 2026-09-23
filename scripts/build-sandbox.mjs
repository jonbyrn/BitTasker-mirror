import { spawnSync } from 'node:child_process';

const sandboxEnv = {
	...process.env,
	VITE_CLIENT_HOSTNAME: 'rgb.bittasker.com',
	VITE_NOSTR_RELAY_URL: 'wss://nos.lol',
	VITE_NOSTR_TASK_RELAY_URL: 'wss://relay.primal.net',
	VITE_NOSTR_RELAY_NESTJS: 'https://api-staging.bittasker.com',
	VITE_API_URL: 'https://api-staging.bittasker.com',
	VITE_API_BASE_URL: 'https://api-staging.bittasker.com',
	VITE_RGB_USDT_ASSET_ID: 'rgb:2s69152-rg39309-8438210-usdt_testnet'
};

const result = spawnSync('npm', ['run', 'build:dev'], {
	stdio: 'inherit',
	env: sandboxEnv,
	shell: process.platform === 'win32'
});

process.exit(result.status ?? 1);
