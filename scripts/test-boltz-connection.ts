/**
 * Simple smoke test for the Boltz public API.
 *
 * Usage:
 *   npx ts-node scripts/test-boltz-connection.ts
 */
import WebSocket from 'ws';

async function testBoltzWebSocket(): Promise<void> {
	console.log('Connecting to Boltz WebSocket…');

	await new Promise<void>((resolve, reject) => {
		const ws = new WebSocket('wss://api.boltz.exchange/v2/ws', {
			origin: 'https://dev.bittasker.com'
		});

		const timeoutId = setTimeout(() => {
			ws.terminate();
			reject(new Error('Timed out waiting for Boltz WebSocket response'));
		}, 5000);

		ws.once('open', () => {
			console.log('• WebSocket connection established');
			ws.ping();
		});

		ws.once('pong', () => {
			console.log('• Received pong response');
			clearTimeout(timeoutId);
			ws.close();
			resolve();
		});

		ws.once('error', (error) => {
			clearTimeout(timeoutId);
			reject(error);
		});

		ws.once('close', (code, reason) => {
			if (code !== 1000) {
				clearTimeout(timeoutId);
				reject(new Error(`WebSocket closed unexpectedly (code ${code}): ${reason}`));
			}
		});
	});
}

async function testBoltzRest(): Promise<void> {
	console.log('Fetching Boltz REST contract metadata…');
	const response = await fetch('https://api.boltz.exchange/v2/chain/RBTC/contracts');
	if (!response.ok) {
		throw new Error(`Boltz REST endpoint failed with status ${response.status}`);
	}
	const json = await response.json();
	console.log('• REST response OK:', json);
}

async function main(): Promise<void> {
	try {
		await testBoltzWebSocket();
		await testBoltzRest();
		console.log('✅ Boltz connectivity tests passed');
		process.exit(0);
	} catch (error) {
		console.error('❌ Boltz connectivity test failed:', error);
		process.exit(1);
	}
}

main();

