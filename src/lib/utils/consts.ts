/**
 * Different views of the user dashboard
 */
export const sections = [
	{ id: '', label: 'navbar.my_tasks', icon: 'mdi:home', mobile: true }, // Default section
	{ id: 'create-task', label: 'navbar.create_task', icon: 'ic:baseline-create', mobile: true },
	{ id: 'find-tasks', label: 'navbar.find_tasks', icon: 'mdi:magnify', mobile: true },
	{ id: 'wallet', label: 'navbar.wallet', icon: 'mdi:wallet', mobile: true },
	{ id: 'profile', label: 'navbar.profile', icon: 'mdi:account', mobile: false },
	{ id: 'messages', label: 'navbar.messages', icon: 'mdi:message', mobile: true },
	{ id: 'settings', label: 'navbar.settings', icon: 'mdi:cog', mobile: false }
];

/**
 * Sample wallet for the dashboard
 */
export const wallet = {
	balance: {
		btc: 0.02345678,
		sats: 2345678,
		usdValue: 1432.89
	},
	addresses: [
		{
			type: 'Bitcoin',
			address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
			isDefault: true
		},
		{
			type: 'Lightning',
			address: 'user@lightning.me',
			isDefault: false
		},
		{
			type: 'Liquid',
			address: 'VJL8rRKYNNvEYpef4nqEGtTGjpYYTzGcUDGvvTp9tgUNGLRBwUuB',
			isDefault: false
		}
	],
	transactions: [
		{
			id: 'tx1',
			type: 'received',
			amount: 0.00123456,
			timestamp: Date.now() - 2 * 24 * 60 * 60 * 1000, // 2 days ago
			sender: 'bc1q...3f8j',
			recipient: 'bc1q...0wlh',
			confirmations: 23,
			txid: '8f3a...e9b2',
			network: 'Bitcoin'
		},
		{
			id: 'tx2',
			type: 'sent',
			amount: 0.00045678,
			timestamp: Date.now() - 5 * 24 * 60 * 60 * 1000, // 5 days ago
			sender: 'bc1q...0wlh',
			recipient: 'bc1q...j29d',
			confirmations: 78,
			txid: '7e2b...f8a4',
			network: 'Bitcoin'
		},
		{
			id: 'tx3',
			type: 'received',
			amount: 0.00078912,
			timestamp: Date.now() - 10 * 24 * 60 * 60 * 1000, // 10 days ago
			sender: 'ln...@zbd.gg',
			recipient: 'user@lightning.me',
			confirmations: null, // Lightning transactions don't have confirmations
			txid: 'ln...892',
			network: 'Lightning'
		},
		{
			id: 'tx4',
			type: 'received',
			amount: 0.01,
			timestamp: Date.now() - 15 * 24 * 60 * 60 * 1000, // 15 days ago
			sender: 'VJL8...tgMN',
			recipient: 'VJL8...UuB',
			confirmations: 186,
			txid: 'liquid...a723',
			network: 'Liquid'
		}
	]
};

// Mock user data to provide fallbacks
export const mockUser = {
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
