/**
 * Helper function to get the display name for a user
 * Priority: username > name > fallback (never Anonymous or public keys)
 * 
 * @param user - User object with optional username and name
 * @param fallback - Optional fallback string (default: empty string)
 * @returns Display name prioritizing username over name
 */
export function getUserDisplayName(
	user?: {
		username?: string | null;
		name?: string | null;
	},
	fallback: string = ''
): string {
	if (!user) return fallback;
	
	// Priority: username > name > fallback
	if (user.username && user.username.trim()) {
		return user.username.trim();
	}
	
	if (user.name && user.name.trim()) {
		return user.name.trim();
	}
	
	return fallback;
}

/**
 * Helper function to get the display name from userProfile structure
 * Used in bid components where user data is nested in userProfile.user
 * 
 * @param userProfile - UserProfile object with nested user
 * @param fallback - Optional fallback string (default: empty string)
 * @returns Display name prioritizing username over name
 */
export function getUserDisplayNameFromProfile(
	userProfile?: {
		user?: {
			username?: string | null;
			name?: string | null;
		};
	},
	fallback: string = ''
): string {
	if (!userProfile?.user) return fallback;
	return getUserDisplayName(userProfile.user, fallback);
}

/**
 * Helper function to get the display name from bidderName or userProfile
 * Used when we have both bidderName (from Nostr bid) and userProfile (from database)
 * 
 * @param bidderName - Name from Nostr bid (may be outdated)
 * @param userProfile - UserProfile from database (preferred source)
 * @param fallback - Optional fallback string (default: empty string)
 * @returns Display name prioritizing database username/name over bidderName
 */
export function getBidderDisplayName(
	bidderName?: string | null,
	userProfile?: {
		user?: {
			username?: string | null;
			name?: string | null;
		};
	},
	fallback: string = ''
): string {
	// First try to get from userProfile (database - most up-to-date)
	if (userProfile?.user) {
		const profileName = getUserDisplayNameFromProfile(userProfile, '');
		if (profileName) return profileName;
	}
	
	// Fallback to bidderName if available and not empty
	if (bidderName && bidderName.trim() && bidderName.trim() !== 'Anonymous') {
		return bidderName.trim();
	}
	
	return fallback;
}

