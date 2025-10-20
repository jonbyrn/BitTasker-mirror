/**
 * Temporary test file for Boltz Cooperative Claim API
 * Used to verify the /v2/swap/reverse/{id}/claim endpoint
 * 
 * DELETE THIS FILE after Phase 1 testing is complete
 */

import { reverseSwapService } from './reverseSwapService';

/**
 * Test the Boltz cooperative claim endpoint
 * 
 * Usage:
 * 1. Start regtest environment (Boltz + RSK)
 * 2. Create a swap with zero-balance wallet
 * 3. Pay the Lightning invoice
 * 4. Wait for transaction.confirmed status
 * 5. Run this test to verify cooperative claim
 */
export async function testCooperativeClaim(swapId: string, preimage: string) {
	const apiUrl = 'http://localhost:9001'; // Boltz regtest
	
	console.log('🧪 Testing Boltz Cooperative Claim API');
	console.log('📋 Swap ID:', swapId);
	console.log('🔑 Preimage:', preimage.slice(0, 20) + '...');
	
	try {
		// Test the claim endpoint
		const response = await fetch(
			`${apiUrl}/v2/swap/reverse/${swapId}/claim`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					preimage: preimage
				})
			}
		);

		console.log('📡 Response status:', response.status);
		console.log('📡 Response headers:', Object.fromEntries(response.headers.entries()));

		if (!response.ok) {
			const errorText = await response.text();
			console.error('❌ Request failed:', errorText);
			throw new Error(`Boltz API returned ${response.status}: ${errorText}`);
		}

		const result = await response.json();
		console.log('✅ Cooperative claim response:', result);
		
		// Document the response structure
		console.log('\n📝 Response Structure:');
		console.log('- Transaction ID field:', result.transactionId || result.txHash || result.hash || 'UNKNOWN');
		console.log('- Full response:', JSON.stringify(result, null, 2));
		
		return result;
	} catch (error) {
		console.error('❌ Test failed:', error);
		throw error;
	}
}

/**
 * Test cooperative claim with various error scenarios
 */
export async function testCooperativeClaimErrors() {
	const apiUrl = 'http://localhost:9001';
	
	console.log('🧪 Testing Error Scenarios');
	
	// Test 1: Invalid swap ID
	console.log('\n1️⃣ Testing invalid swap ID...');
	try {
		const response = await fetch(
			`${apiUrl}/v2/swap/reverse/invalid-swap-id/claim`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ preimage: '0'.repeat(64) })
			}
		);
		console.log('Status:', response.status, '- Expected: 404');
		const error = await response.text();
		console.log('Error:', error);
	} catch (err) {
		console.log('Error:', err);
	}
	
	// Test 2: Invalid preimage format
	console.log('\n2️⃣ Testing invalid preimage format...');
	try {
		const response = await fetch(
			`${apiUrl}/v2/swap/reverse/test-swap/claim`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ preimage: 'invalid' })
			}
		);
		console.log('Status:', response.status, '- Expected: 400');
		const error = await response.text();
		console.log('Error:', error);
	} catch (err) {
		console.log('Error:', err);
	}
	
	// Test 3: Missing preimage
	console.log('\n3️⃣ Testing missing preimage...');
	try {
		const response = await fetch(
			`${apiUrl}/v2/swap/reverse/test-swap/claim`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({})
			}
		);
		console.log('Status:', response.status, '- Expected: 400');
		const error = await response.text();
		console.log('Error:', error);
	} catch (err) {
		console.log('Error:', err);
	}
}

/**
 * Helper to check if the endpoint exists
 */
export async function checkClaimEndpointExists(): Promise<boolean> {
	const apiUrl = 'http://localhost:9001';
	
	try {
		// Try OPTIONS request to see if endpoint exists
		const response = await fetch(
			`${apiUrl}/v2/swap/reverse/test/claim`,
			{
				method: 'OPTIONS'
			}
		);
		
		console.log('Endpoint check:', response.status);
		return response.status !== 404;
	} catch (error) {
		console.error('Failed to check endpoint:', error);
		return false;
	}
}

