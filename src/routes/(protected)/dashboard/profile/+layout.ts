import type { ApiUserProfile } from '$lib/types/auth';
import type { LayoutLoad } from './$types';
import { tryCatch } from '$lib/utils/tryCatch';
import userService from '$lib/api/services/user.service';

// Mock user data to provide fallbacks
const mockUser = {
	id: 'user1',
	name: 'Alex Johnson',
	avatar: '', // URL to avatar image
	bio: 'Professional handyman with 10+ years of experience. Specialized in home repairs, carpentry, and electrical work.',
	location: 'San Francisco, CA',
	skills: [
		{ name: 'Carpentry', level: 5, verified: true },
		{ name: 'Electrical', level: 4, verified: true },
		{ name: 'Plumbing', level: 3, verified: false },
		{ name: 'Painting', level: 5, verified: true },
		{ name: 'Flooring', level: 4, verified: false }
	],
	portfolio: [
		{
			id: 'port1',
			title: 'Kitchen Renovation',
			description: 'Complete kitchen renovation including custom cabinets and island installation.',
			images: ['/path/to/image1.jpg', '/path/to/image2.jpg'],
			date: '2023-06-15'
		},
		{
			id: 'port2',
			title: 'Bathroom Remodel',
			description: 'Full bathroom remodel with custom tilework and fixtures.',
			images: ['/path/to/image3.jpg'],
			date: '2023-04-10'
		}
	],
	certifications: [
		{
			name: 'Certified Carpenter',
			issuer: 'National Carpentry Association',
			date: '2015-01-15',
			verified: true
		},
		{
			name: 'Licensed Electrician',
			issuer: 'State Board of Electrical Contractors',
			date: '2016-03-22',
			verified: true
		}
	],
	reviews: [
		{
			id: 'rev1',
			rating: 5,
			text: 'Alex did an amazing job on our kitchen renovation. Highly recommended!',
			from: {
				id: 'client1',
				name: 'Sarah Miller'
			},
			date: '2023-07-02'
		},
		{
			id: 'rev2',
			rating: 4,
			text: 'Great work on our bathroom remodel. Professional and timely.',
			from: {
				id: 'client2',
				name: 'John Davis'
			},
			date: '2023-05-18'
		}
	],
	stats: {
		tasksCompleted: 47,
		averageRating: 4.8,
		responseRate: 98,
		onTimeCompletion: 95
	},
	availability: {
		schedule: {
			monday: { available: true, hours: '9:00-17:00' },
			tuesday: { available: true, hours: '9:00-17:00' },
			wednesday: { available: true, hours: '9:00-17:00' },
			thursday: { available: true, hours: '9:00-17:00' },
			friday: { available: true, hours: '9:00-17:00' },
			saturday: { available: false, hours: '' },
			sunday: { available: false, hours: '' }
		},
		nextAvailable: '2023-12-15'
	},
	nostrPublicKey: 'npub1abc123...',
	bitcoinAddress: 'bc1abc123...',
	lightningAddress: 'alex@lightning.me'
};

export const load: LayoutLoad = async () => {
	const { data: userData, error: userError } = await tryCatch<ApiUserProfile>(
		userService.getUserProfile()
	);

	if (userError || !userData) {
		console.error('Failed to fetch user profile:', userError);
		// Return mock data if API fails
		return { userProfile: mockUser };
	}

	// Merge API data with mock data as fallback
	const userProfile = {
		...mockUser, // Start with mock data
		id: String(userData.id),
		name: userData.name || mockUser.name,
		avatar: userData.profilePicture || mockUser.avatar,
		bio: userData.freelancer?.bio || mockUser.bio,
		location: userData.location
			? `${userData.location.city}, ${userData.location.state}, ${userData.location.country}`
			: mockUser.location,
		stats: {
			...mockUser.stats, // Keep mock stats as base
			tasksCompleted:
				userData.client?.tasksCompleted ??
				userData.freelancer?.tasksCompleted ??
				mockUser.stats.tasksCompleted,
			averageRating:
				userData.client?.averageRating ??
				userData.freelancer?.averageRating ??
				mockUser.stats.averageRating
			// responseRate and onTimeCompletion will use mock values
		},
		nostrPublicKey:
			userData.authMethods?.find((method) => method.type === 'nostr')?.identifier ||
			mockUser.nostrPublicKey,
		skills: userData.freelancer?.specialties?.length
			? userData.freelancer.specialties.map((specialty) => ({
					name: specialty,
					level: 3, // Default level
					verified: false // Default verification
				}))
			: mockUser.skills
		// Other fields like portfolio, certifications, reviews, availability, etc., will use mock data
	};

	return { userProfile };
};
