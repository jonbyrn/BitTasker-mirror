#!/usr/bin/env node

/**
 * Test script to verify Blockscout API endpoint is working
 * Usage: node scripts/test-blockscout-api.js [txHash] [network]
 * 
 * Example:
 *   node scripts/test-blockscout-api.js 0x123... testnet
 */

const args = process.argv.slice(2);
const txHash = args[0] || '0x0000000000000000000000000000000000000000000000000000000000000000';
const network = args[1] || 'testnet';

const API_URLS = {
	mainnet: 'https://rootstock.blockscout.com/api/v2',
	testnet: 'https://rootstock-testnet.blockscout.com/api/v2'
};

async function testBlockscoutAPI() {
	const apiUrl = API_URLS[network];
	if (!apiUrl) {
		console.error(`❌ Invalid network: ${network}. Use 'mainnet' or 'testnet'`);
		process.exit(1);
	}

	const url = `${apiUrl}/transactions/${txHash}`;
	console.log(`\n🔍 Testing Blockscout API`);
	console.log(`   Network: ${network}`);
	console.log(`   URL: ${url}`);
	console.log(`   Transaction Hash: ${txHash}\n`);

	try {
		const startTime = Date.now();
		const response = await fetch(url, {
			signal: AbortSignal.timeout(10000) // 10 second timeout
		});
		const duration = Date.now() - startTime;

		console.log(`📡 Response Status: ${response.status} ${response.statusText}`);
		console.log(`⏱️  Response Time: ${duration}ms\n`);

		if (!response.ok) {
			console.error(`❌ API Error: ${response.status} ${response.statusText}`);
			if (response.status === 404) {
				console.log(`   ℹ️  Transaction not found. This is expected if the hash doesn't exist.`);
			}
			process.exit(1);
		}

		const data = await response.json();
		
		// Handle different response formats
		const transaction = data.items?.[0] || data;

		console.log(`✅ API Response Structure:`);
		console.log(`   Hash: ${transaction.hash || txHash}`);
		console.log(`   Block Number: ${transaction.block_number ?? transaction.blockNumber ?? 'null (in mempool)'}`);
		console.log(`   Confirmations: ${transaction.confirmations ?? 0}`);
		console.log(`   Status: ${transaction.status === 1 ? 'Success' : transaction.status === 0 ? 'Failed' : 'Pending'}`);
		console.log(`   Timestamp: ${transaction.timestamp ?? transaction.timeStamp ?? 'N/A'}\n`);

		// Verify expected fields
		const hasHash = !!(transaction.hash || txHash);
		const hasBlockNumber = transaction.block_number !== undefined || transaction.blockNumber !== undefined;
		const hasConfirmations = transaction.confirmations !== undefined;
		const hasStatus = transaction.status !== undefined;

		console.log(`📋 Field Verification:`);
		console.log(`   ✓ Hash: ${hasHash ? '✅ Present' : '❌ Missing'}`);
		console.log(`   ✓ Block Number: ${hasBlockNumber ? '✅ Present' : '❌ Missing'}`);
		console.log(`   ✓ Confirmations: ${hasConfirmations ? '✅ Present' : '❌ Missing'}`);
		console.log(`   ✓ Status: ${hasStatus ? '✅ Present' : '❌ Missing'}\n`);

		if (hasHash && hasConfirmations) {
			console.log(`✅ API endpoint is working correctly!`);
			console.log(`   Expected response structure matches.`);
		} else {
			console.log(`⚠️  API response structure may differ from expected format.`);
		}

	} catch (error) {
		console.error(`❌ Error testing API:`, error.message);
		if (error.name === 'AbortError') {
			console.error(`   Request timed out after 10 seconds`);
		}
		process.exit(1);
	}
}

// Run the test
testBlockscoutAPI().catch((error) => {
	console.error('Unexpected error:', error);
	process.exit(1);
});
