#!/usr/bin/env node
/**
 * Script to count users from BitTasker Nostr relays
 * 
 * This script connects to the BitTasker Nostr relays and counts:
 * - Total unique users (by pubkey)
 * - New users per day (based on profile creation date)
 * - User statistics and breakdown
 * 
 * Usage:
 *   npm run count-users
 *   or
 *   npx tsx scripts/count-users.ts
 * 
 * Relays queried:
 *   - wss://relay2.bittasker.com
 *   - wss://relay1.bittasker.com
 */

import { SimplePool, type Event, type Filter } from 'nostr-tools';
import { nip19 } from 'nostr-tools';
import { writeFileSync } from 'fs';

// Relay URLs
const RELAYS = [
	'wss://relay2.bittasker.com',
	'wss://relay1.bittasker.com'
];

// Profile metadata kind (NIP-01)
const PROFILE_METADATA_KIND = 0;

// Timeout for relay queries (30 seconds)
const QUERY_TIMEOUT = 30000;

/**
 * Interface for user profile data
 */
interface UserProfile {
	pubkey: string;
	username?: string; // Extracted from NIP-05 (part before @)
	nip05?: string; // Full NIP-05 identifier (username@domain)
	displayName?: string;
	createdAt: number; // Unix timestamp in seconds
	createdAtDate: string; // ISO date string (YYYY-MM-DD)
	rawProfileData?: any; // Raw profile data from event
}

/**
 * Extract username from NIP-05 identifier
 * NIP-05 format: username@domain.com
 * Returns the username part (before @) or null if not available
 */
function extractUsernameFromNip05(nip05?: string): string | undefined {
	if (!nip05) return undefined;
	
	// NIP-05 format is username@domain
	const parts = nip05.split('@');
	if (parts.length === 2 && parts[0].trim()) {
		return parts[0].trim();
	}
	
	return undefined;
}

/**
 * Escape CSV field (handles quotes and commas)
 */
function escapeCsvField(field: any): string {
	if (field === null || field === undefined) {
		return '';
	}
	
	const str = String(field);
	// If field contains comma, quote, or newline, wrap in quotes and escape quotes
	if (str.includes(',') || str.includes('"') || str.includes('\n')) {
		return `"${str.replace(/"/g, '""')}"`;
	}
	return str;
}

/**
 * Convert a Nostr event to a UserProfile
 */
function convertEventToUserProfile(event: Event): UserProfile | null {
	try {
		const profileData = event.content ? JSON.parse(event.content) : {};
		
		// Convert created_at (Unix timestamp in seconds) to Date
		const createdAtDate = new Date(event.created_at * 1000);
		const createdAtDateStr = createdAtDate.toISOString().split('T')[0]; // YYYY-MM-DD
		
		// Extract username from NIP-05
		const nip05 = profileData.nip05;
		const username = extractUsernameFromNip05(nip05);
		
		return {
			pubkey: event.pubkey,
			username: username,
			nip05: nip05,
			displayName: profileData.display_name || profileData.displayName,
			createdAt: event.created_at,
			createdAtDate: createdAtDateStr,
			rawProfileData: profileData
		};
	} catch (error) {
		console.error(`Failed to parse profile from event ${event.id}:`, error);
		return null;
	}
}

/**
 * Query user profiles from a single relay
 */
async function queryUsersFromRelay(pool: SimplePool, relay: string): Promise<UserProfile[]> {
	console.log(`\n📡 Querying users from ${relay}...`);
	
	const profiles: UserProfile[] = [];
	const events: Event[] = [];
	
	try {
		const filter: Filter = {
			kinds: [PROFILE_METADATA_KIND],
			limit: 10000 // Large limit to get all profiles
		};
		
		// Create a promise that resolves when we get all events or timeout
		const queryPromise = new Promise<void>((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error(`Query timeout after ${QUERY_TIMEOUT}ms`));
			}, QUERY_TIMEOUT);
			
			const sub = pool.subscribe([relay], filter, {
				onevent: (event: Event) => {
					events.push(event);
				},
				oneose: () => {
					clearTimeout(timeout);
					resolve();
				}
			});
			
			// Cleanup subscription after timeout
			setTimeout(() => {
				sub.close();
			}, QUERY_TIMEOUT);
		});
		
		await queryPromise;
		
		// Convert events to user profiles
		for (const event of events) {
			const profile = convertEventToUserProfile(event);
			if (profile) {
				profiles.push(profile);
			}
		}
		
		console.log(`✅ Found ${profiles.length} profile events from ${relay}`);
		return profiles;
		
	} catch (error) {
		console.error(`❌ Error querying ${relay}:`, error instanceof Error ? error.message : error);
		return [];
	}
}

/**
 * Get the most recent profile for each unique pubkey
 * (Since profiles are replaceable events, we want the latest one)
 */
function getUniqueUsers(profiles: UserProfile[]): Map<string, UserProfile> {
	const uniqueUsers = new Map<string, UserProfile>();
	
	// Group by pubkey and keep the most recent profile
	for (const profile of profiles) {
		const existing = uniqueUsers.get(profile.pubkey);
		
		if (!existing || profile.createdAt > existing.createdAt) {
			uniqueUsers.set(profile.pubkey, profile);
		}
	}
	
	return uniqueUsers;
}

/**
 * Main function
 */
async function main() {
	console.log('🚀 Starting user count script...\n');
	console.log(`📅 Current date: ${new Date().toISOString()}\n`);
	
	const pool = new SimplePool();
	
	try {
		// Query profiles from all relays
		const allProfiles: UserProfile[] = [];
		
		for (const relay of RELAYS) {
			const profiles = await queryUsersFromRelay(pool, relay);
			allProfiles.push(...profiles);
		}
		
		// Get unique users (by pubkey, keeping most recent profile)
		const uniqueUsers = getUniqueUsers(allProfiles);
		const totalUsers = uniqueUsers.size;
		
		// Group users by creation date
		const usersByDate = new Map<string, number>();
		const usersByDateDetails = new Map<string, UserProfile[]>();
		
		for (const profile of uniqueUsers.values()) {
			const date = profile.createdAtDate;
			usersByDate.set(date, (usersByDate.get(date) || 0) + 1);
			
			if (!usersByDateDetails.has(date)) {
				usersByDateDetails.set(date, []);
			}
			usersByDateDetails.get(date)!.push(profile);
		}
		
		// Sort dates chronologically
		const sortedDates = Array.from(usersByDate.entries())
			.sort((a, b) => a[0].localeCompare(b[0]));
		
		// Calculate statistics
		const today = new Date().toISOString().split('T')[0];
		const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
		const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
		const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
		
		const usersToday = usersByDate.get(today) || 0;
		const usersYesterday = usersByDate.get(yesterday) || 0;
		const usersLast7Days = sortedDates
			.filter(([date]) => date >= last7Days)
			.reduce((sum, [, count]) => sum + count, 0);
		const usersLast30Days = sortedDates
			.filter(([date]) => date >= last30Days)
			.reduce((sum, [, count]) => sum + count, 0);
		
		// Convert pubkeys to npubs and prepare user list
		const userList = Array.from(uniqueUsers.values())
			.map(profile => {
				try {
					const npub = nip19.npubEncode(profile.pubkey);
					return {
						npub,
						pubkey: profile.pubkey,
						displayName: profile.displayName || 'N/A',
						createdAtDate: profile.createdAtDate,
						createdAt: profile.createdAt,
						rawProfileData: profile.rawProfileData || {}
					};
				} catch (error) {
					console.error(`Failed to encode npub for ${profile.pubkey}:`, error);
					return null;
				}
			})
			.filter((user): user is NonNullable<typeof user> => user !== null)
			.sort((a, b) => a.createdAtDate.localeCompare(b.createdAtDate)); // Sort by creation date
		
		// Generate CSV output
		// CSV Header
		const csvHeaders = [
			'npub',
			'pubkey',
			'name',
			'display_name',
			'about',
			'picture',
			'banner',
			'website',
			'nip05',
			'lud16',
			'lud06',
			'professionalTitle',
			'location',
			'created_at',
			'created_at_date'
		];
		
		// Build CSV content
		const csvRows: string[] = [csvHeaders.join(',')];
		
		// CSV Rows
		userList.forEach((user) => {
			const profile = user.rawProfileData || {};
			const row = [
				escapeCsvField(user.npub),
				escapeCsvField(user.pubkey),
				escapeCsvField(profile.name),
				escapeCsvField(profile.display_name || profile.displayName),
				escapeCsvField(profile.about),
				escapeCsvField(profile.picture),
				escapeCsvField(profile.banner),
				escapeCsvField(profile.website),
				escapeCsvField(profile.nip05),
				escapeCsvField(profile.lud16),
				escapeCsvField(profile.lud06),
				escapeCsvField(profile.professionalTitle),
				escapeCsvField(profile.location),
				escapeCsvField(user.createdAt),
				escapeCsvField(user.createdAtDate)
			];
			csvRows.push(row.join(','));
		});
		
		// Write CSV to file
		const csvContent = csvRows.join('\n');
		writeFileSync('npub-export.csv', csvContent, 'utf-8');
		console.log(`\n✅ CSV data written to npub-export.csv (${userList.length} users)`);
		
		// Print user list
		console.log('\n' + '='.repeat(80));
		console.log('👥 USER LIST');
		console.log('='.repeat(80));
		console.log(`Total users: ${userList.length}\n`);
		
		userList.forEach((user, index) => {
			console.log(`${String(index + 1).padStart(3, ' ')}. ${user.npub}`);
			console.log(`     Display Name: ${user.displayName}`);
			console.log(`     Created: ${user.createdAtDate}`);
			console.log('');
		});
		
		// Print results
		console.log('='.repeat(80));
		console.log('📊 USER STATISTICS');
		console.log('='.repeat(80));
		console.log(`Total unique users: ${totalUsers}`);
		console.log(`Users today: ${usersToday}`);
		console.log(`Users yesterday: ${usersYesterday}`);
		console.log(`Users in last 7 days: ${usersLast7Days}`);
		console.log(`Users in last 30 days: ${usersLast30Days}`);
		console.log('='.repeat(60));
		
		// Show daily breakdown
		if (sortedDates.length > 0) {
			console.log('\n📅 NEW USERS PER DAY (All Time)');
			console.log('='.repeat(60));
			
			// Show last 30 days if available, otherwise show all
			const datesToShow = sortedDates.length > 30 
				? sortedDates.slice(-30) 
				: sortedDates;
			
			datesToShow.forEach(([date, count]) => {
				const dateObj = new Date(date);
				const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
				console.log(`  ${date} (${dayName}): ${count} user${count !== 1 ? 's' : ''}`);
			});
			
			if (sortedDates.length > 30) {
				console.log(`  ... and ${sortedDates.length - 30} more days`);
			}
			
			console.log('='.repeat(60));
		}
		
		// Show recent activity (last 7 days)
		if (sortedDates.length > 0) {
			const recentDates = sortedDates.filter(([date]) => date >= last7Days);
			if (recentDates.length > 0) {
				console.log('\n📈 RECENT ACTIVITY (Last 7 Days)');
				console.log('='.repeat(60));
				recentDates.forEach(([date, count]) => {
					const dateObj = new Date(date);
					const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
					console.log(`  ${date} (${dayName}): ${count} user${count !== 1 ? 's' : ''}`);
				});
				console.log('='.repeat(60));
			}
		}
		
		// Show top days by user count
		if (sortedDates.length > 0) {
			const topDays = Array.from(usersByDate.entries())
				.sort((a, b) => b[1] - a[1])
				.slice(0, 10);
			
			if (topDays.length > 0) {
				console.log('\n🏆 TOP DAYS BY NEW USER COUNT');
				console.log('='.repeat(60));
				topDays.forEach(([date, count], index) => {
					const dateObj = new Date(date);
					const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
					console.log(`  ${index + 1}. ${date} (${dayName}): ${count} user${count !== 1 ? 's' : ''}`);
				});
				console.log('='.repeat(60));
			}
		}
		
		// Show oldest and newest users
		if (uniqueUsers.size > 0) {
			const allUserProfiles = Array.from(uniqueUsers.values());
			const sortedByDate = allUserProfiles.sort((a, b) => a.createdAt - b.createdAt);
			const oldest = sortedByDate[0];
			const newest = sortedByDate[sortedByDate.length - 1];
			
			console.log('\n👤 USER TIMELINE');
			console.log('='.repeat(60));
			console.log(`Oldest user: ${oldest.createdAtDate} (${oldest.username || oldest.displayName || oldest.pubkey.slice(0, 16)}...)`);
			console.log(`Newest user: ${newest.createdAtDate} (${newest.username || newest.displayName || newest.pubkey.slice(0, 16)}...)`);
			console.log('='.repeat(60));
		}
		
		console.log('\n✅ Script completed successfully!\n');
		
		// Exit with success
		process.exit(0);
		
	} catch (error) {
		console.error('\n❌ Fatal error:', error instanceof Error ? error.message : error);
		process.exit(1);
	} finally {
		// Close all relay connections
		await pool.close(RELAYS);
	}
}

// Run the script
main().catch(error => {
	console.error('Unhandled error:', error);
	process.exit(1);
});

