/**
 * Simple smoke test for the Boltz public API.
 *
 * Usage:
 *   node scripts/test-boltz-connection.mjs
 */
import WebSocket from 'ws';

async function testBoltzWebSocket() {
	console.log('Connecting to Boltz WebSocket…');

	await new Promise((resolve, reject) => {
		const ws = new WebSocket('wss://api.boltz.exchange/v2/ws', {
			origin: 'https://dev.bittasker.com'
		});

		const timeout = setTimeout(() => {
			ws.terminate();
			reject(new Error('Timed out waiting for Boltz WebSocket response'));
		}, 5000);

		ws.once('open', () => {
			console.log('• WebSocket connection established');
			ws.ping();
		});

		ws.once('pong', () => {
			console.log('• Received pong response');
			clearTimeout(timeout);
			ws.close();
			resolve();
		});

		ws.once('error', (error) => {
			clearTimeout(timeout);
			reject(error);
		});

		ws.once('close', (code, reason) => {
			if (code !== 1000) {
				clearTimeout(timeout);
				reject(new Error(`WebSocket closed unexpectedly (code ${code}): ${reason.toString()}`));
			}
		});
	});
}

async function testBoltzRest() {
	console.log('Fetching Boltz REST contract metadata…');
	const response = await fetch('https://api.boltz.exchange/v2/chain/RBTC/contracts');
	if (!response.ok) {
		throw new Error(`Boltz REST endpoint failed with status ${response.status}`);
	}
	const json = await response.json();
	console.log('• REST response OK:', json);
}

async function main() {
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

