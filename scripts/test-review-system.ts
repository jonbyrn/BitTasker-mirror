/**
 * Review System Test Script
 * 
 * Run this script to test the review system functions programmatically
 * 
 * Usage:
 *   npm run test:reviews
 *   or
 *   npx tsx scripts/test-review-system.ts
 */

import { findPendingReviews, getPendingReviewsCount, hasUserReviewedContract } from '../src/lib/utils/review-helpers';
import { getReviewsForUser, getReviewsByReviewer, getReviewsForEscrow, publishVerifiedReview } from '../src/lib/utils/nostr-review';
import { getNpub } from '../src/lib/utils/nostrKeys';
import { buildMerkleTree, getLatestTreeVersion, retrieveMerkleTree } from '../src/lib/services/review-verification.service';
import { getUserContracts } from '../src/lib/utils/nostr-bid';
import { escrow } from '../src/lib/utils/wallet/escrow';

interface TestResult {
	name: string;
	passed: boolean;
	error?: string;
	data?: any;
}

const testResults: TestResult[] = [];

function logTest(name: string, passed: boolean, error?: string, data?: any) {
	testResults.push({ name, passed, error, data });
	const status = passed ? '✅ PASS' : '❌ FAIL';
	console.log(`${status}: ${name}`);
	if (error) {
		console.log(`   Error: ${error}`);
	}
	if (data && passed) {
		console.log(`   Data:`, JSON.stringify(data, null, 2));
	}
}

async function testGetUserPubkey() {
	try {
		const pubkey = await getNpub();
		if (pubkey) {
			logTest('Get User Pubkey', true, undefined, { pubkey: pubkey.substring(0, 20) + '...' });
			return pubkey;
		} else {
			logTest('Get User Pubkey', false, 'No pubkey returned');
			return null;
		}
	} catch (error) {
		logTest('Get User Pubkey', false, error instanceof Error ? error.message : String(error));
		return null;
	}
}

async function testGetUserContracts() {
	try {
		const contracts = await getUserContracts();
		logTest('Get User Contracts', true, undefined, { count: contracts.length });
		return contracts;
	} catch (error) {
		logTest('Get User Contracts', false, error instanceof Error ? error.message : String(error));
		return [];
	}
}

async function testFindPendingReviews() {
	try {
		const pending = await findPendingReviews();
		logTest('Find Pending Reviews', true, undefined, { 
			count: pending.length,
			escrowIds: pending.map(p => p.escrowId).slice(0, 3)
		});
		return pending;
	} catch (error) {
		logTest('Find Pending Reviews', false, error instanceof Error ? error.message : String(error));
		return [];
	}
}

async function testGetPendingReviewsCount() {
	try {
		const count = await getPendingReviewsCount();
		logTest('Get Pending Reviews Count', true, undefined, { count });
		return count;
	} catch (error) {
		logTest('Get Pending Reviews Count', false, error instanceof Error ? error.message : String(error));
		return 0;
	}
}

async function testGetReviewsForUser(pubkey: string) {
	try {
		const reviews = await getReviewsForUser(pubkey, 10);
		logTest('Get Reviews For User', true, undefined, { 
			count: reviews.length,
			hasReviews: reviews.length > 0
		});
		return reviews;
	} catch (error) {
		logTest('Get Reviews For User', false, error instanceof Error ? error.message : String(error));
		return [];
	}
}

async function testGetReviewsByReviewer(pubkey: string) {
	try {
		const reviews = await getReviewsByReviewer(pubkey, 10);
		logTest('Get Reviews By Reviewer', true, undefined, { 
			count: reviews.length,
			hasReviews: reviews.length > 0
		});
		return reviews;
	} catch (error) {
		logTest('Get Reviews By Reviewer', false, error instanceof Error ? error.message : String(error));
		return [];
	}
}

async function testGetReviewsForEscrow(escrowId: string) {
	try {
		const reviews = await getReviewsForEscrow(escrowId);
		logTest('Get Reviews For Escrow', true, undefined, { 
			escrowId,
			count: reviews.length
		});
		return reviews;
	} catch (error) {
		logTest('Get Reviews For Escrow', false, error instanceof Error ? error.message : String(error));
		return [];
	}
}

async function testHasUserReviewedContract(escrowId: string, pubkey: string) {
	try {
		const hasReviewed = await hasUserReviewedContract(escrowId);
		logTest('Has User Reviewed Contract', true, undefined, { 
			escrowId,
			hasReviewed
		});
		return hasReviewed;
	} catch (error) {
		logTest('Has User Reviewed Contract', false, error instanceof Error ? error.message : String(error));
		return false;
	}
}

async function testMerkleTreeOperations() {
	try {
		// Get latest tree version
		const latestVersion = await getLatestTreeVersion();
		logTest('Get Latest Tree Version', true, undefined, { version: latestVersion });

		// Retrieve tree if exists
		if (latestVersion) {
			const tree = await retrieveMerkleTree(latestVersion);
			logTest('Retrieve Merkle Tree', true, undefined, { 
				version: latestVersion,
				hasTree: !!tree
			});
		} else {
			logTest('Retrieve Merkle Tree', true, undefined, { 
				message: 'No tree version found, will build new tree'
			});
		}

		// Build tree (this might take a while)
		console.log('Building Merkle tree (this may take 30-60 seconds)...');
		const buildResult = await buildMerkleTree();
		logTest('Build Merkle Tree', true, undefined, { 
			version: buildResult.version,
			root: buildResult.root.substring(0, 20) + '...',
			commitmentCount: buildResult.commitmentCount
		});

		return true;
	} catch (error) {
		logTest('Merkle Tree Operations', false, error instanceof Error ? error.message : String(error));
		return false;
	}
}

async function testGetEscrow(escrowId: string) {
	try {
		const escrowData = await escrow.getEscrow(escrowId);
		if (escrowData) {
			logTest('Get Escrow Data', true, undefined, { 
				escrowId,
				status: escrowData.status,
				hasData: true
			});
			return escrowData;
		} else {
			logTest('Get Escrow Data', false, 'Escrow not found');
			return null;
		}
	} catch (error) {
		logTest('Get Escrow Data', false, error instanceof Error ? error.message : String(error));
		return null;
	}
}

async function runAllTests() {
	console.log('🧪 Starting Review System Tests...\n');
	console.log('=' .repeat(60));

	// Test 1: Get user pubkey
	const pubkey = await testGetUserPubkey();
	if (!pubkey) {
		console.log('\n❌ Cannot continue tests without user pubkey');
		return;
	}

	// Test 2: Get user contracts
	const contracts = await testGetUserContracts();

	// Test 3: Find pending reviews
	const pendingReviews = await testFindPendingReviews();

	// Test 4: Get pending reviews count
	await testGetPendingReviewsCount();

	// Test 5: Get reviews for user
	await testGetReviewsForUser(pubkey);

	// Test 6: Get reviews by reviewer
	await testGetReviewsByReviewer(pubkey);

	// Test 7: Test with first pending review if available
	if (pendingReviews.length > 0) {
		const firstPending = pendingReviews[0];
		await testGetReviewsForEscrow(firstPending.escrowId);
		await testHasUserReviewedContract(firstPending.escrowId, pubkey);
		await testGetEscrow(firstPending.escrowId);
	} else if (contracts.length > 0) {
		// Test with first contract if no pending reviews
		const firstContract = contracts[0];
		await testGetReviewsForEscrow(firstContract.escrowId);
		await testHasUserReviewedContract(firstContract.escrowId, pubkey);
	}

	// Test 8: Merkle tree operations (optional, can be slow)
	console.log('\n⚠️  Skipping Merkle tree build test (can be slow)');
	console.log('   To test Merkle tree, uncomment testMerkleTreeOperations() call');
	// await testMerkleTreeOperations();

	// Summary
	console.log('\n' + '='.repeat(60));
	console.log('\n📊 Test Summary:\n');
	
	const passed = testResults.filter(t => t.passed).length;
	const failed = testResults.filter(t => !t.passed).length;
	const total = testResults.length;

	console.log(`Total Tests: ${total}`);
	console.log(`✅ Passed: ${passed}`);
	console.log(`❌ Failed: ${failed}`);
	console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%\n`);

	if (failed > 0) {
		console.log('Failed Tests:');
		testResults
			.filter(t => !t.passed)
			.forEach(t => {
				console.log(`  - ${t.name}: ${t.error}`);
			});
	}

	console.log('\n' + '='.repeat(60));
}

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
	runAllTests().catch(console.error);
}

export { runAllTests, testResults };

