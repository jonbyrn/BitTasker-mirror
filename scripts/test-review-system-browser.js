/**
 * Browser Console Test Script for Review System
 * 
 * Copy and paste this into your browser console (F12) to test the review system
 * while the app is running.
 * 
 * Usage:
 *   1. Open browser console (F12)
 *   2. Navigate to any page in the app
 *   3. Copy and paste this entire script
 *   4. Press Enter
 */

(async function testReviewSystem() {
	console.log('🧪 Starting Review System Browser Tests...\n');
	console.log('='.repeat(60));

	const results = [];

	function logTest(name, passed, error, data) {
		results.push({ name, passed, error, data });
		const status = passed ? '✅ PASS' : '❌ FAIL';
		console.log(`${status}: ${name}`);
		if (error) {
			console.log(`   Error: ${error}`);
		}
		if (data && passed) {
			console.log(`   Data:`, data);
		}
	}

	try {
		// Import functions dynamically
		const { getNpub } = await import('/src/lib/utils/nostrKeys.ts');
		const { findPendingReviews, getPendingReviewsCount } = await import('/src/lib/utils/review-helpers.ts');
		const { getReviewsForUser, getReviewsByReviewer, getReviewsForEscrow } = await import('/src/lib/utils/nostr-review.ts');
		const { getLatestTreeVersion, retrieveMerkleTree } = await import('/src/lib/services/review-verification.service.ts');

		// Test 1: Get user pubkey
		try {
			const pubkey = await getNpub();
			if (pubkey) {
				logTest('Get User Pubkey', true, null, { pubkey: pubkey.substring(0, 20) + '...' });
				
				// Test 2: Find pending reviews
				try {
					const pending = await findPendingReviews();
					logTest('Find Pending Reviews', true, null, { 
						count: pending.length,
						escrowIds: pending.slice(0, 3).map(p => p.escrowId)
					});

					// Test 3: Get pending count
					try {
						const count = await getPendingReviewsCount();
						logTest('Get Pending Reviews Count', true, null, { count });
					} catch (error) {
						logTest('Get Pending Reviews Count', false, error.message);
					}

					// Test 4: Get reviews for user
					try {
						const reviews = await getReviewsForUser(pubkey, 10);
						logTest('Get Reviews For User', true, null, { 
							count: reviews.length,
							hasReviews: reviews.length > 0
						});
					} catch (error) {
						logTest('Get Reviews For User', false, error.message);
					}

					// Test 5: Get reviews by reviewer
					try {
						const reviews = await getReviewsByReviewer(pubkey, 10);
						logTest('Get Reviews By Reviewer', true, null, { 
							count: reviews.length,
							hasReviews: reviews.length > 0
						});
					} catch (error) {
						logTest('Get Reviews By Reviewer', false, error.message);
					}

					// Test 6: Test with first pending review if available
					if (pending.length > 0) {
						const firstPending = pending[0];
						try {
							const escrowReviews = await getReviewsForEscrow(firstPending.escrowId);
							logTest('Get Reviews For Escrow', true, null, { 
								escrowId: firstPending.escrowId,
								count: escrowReviews.length
							});
						} catch (error) {
							logTest('Get Reviews For Escrow', false, error.message);
						}
					}

					// Test 7: Merkle tree version
					try {
						const version = await getLatestTreeVersion();
						logTest('Get Latest Tree Version', true, null, { version });
						
						if (version) {
							try {
								const tree = await retrieveMerkleTree(version);
								logTest('Retrieve Merkle Tree', true, null, { 
									version,
									hasTree: !!tree
								});
							} catch (error) {
								logTest('Retrieve Merkle Tree', false, error.message);
							}
						}
					} catch (error) {
						logTest('Merkle Tree Operations', false, error.message);
					}

				} catch (error) {
					logTest('Find Pending Reviews', false, error.message);
				}
			} else {
				logTest('Get User Pubkey', false, 'No pubkey returned');
			}
		} catch (error) {
			logTest('Get User Pubkey', false, error.message);
		}

	} catch (error) {
		console.error('❌ Failed to import test functions:', error);
		console.log('\n💡 Make sure you are on a page that has loaded the review system modules.');
		return;
	}

	// Summary
	console.log('\n' + '='.repeat(60));
	console.log('\n📊 Test Summary:\n');
	
	const passed = results.filter(r => r.passed).length;
	const failed = results.filter(r => !r.passed).length;
	const total = results.length;

	console.log(`Total Tests: ${total}`);
	console.log(`✅ Passed: ${passed}`);
	console.log(`❌ Failed: ${failed}`);
	console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%\n`);

	if (failed > 0) {
		console.log('Failed Tests:');
		results
			.filter(r => !r.passed)
			.forEach(r => {
				console.log(`  - ${r.name}: ${r.error}`);
			});
	}

	console.log('\n' + '='.repeat(60));
	console.log('\n✅ Test complete! Check results above.\n');

	return results;
})();

