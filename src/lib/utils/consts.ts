/**
 * Different views of the user dashboard
 */
export const sections = [
	{ id: '', label: 'My Tasks', icon: 'mdi:home' }, // Default section
	{ id: 'create-task', label: 'Create', icon: 'ic:baseline-create' },
	{ id: 'find-tasks', label: 'Find', icon: 'mdi:magnify' },
	{ id: 'wallet', label: 'Wallet', icon: 'mdi:wallet' },
	{ id: 'profile', label: 'Profile', icon: 'mdi:account' }
];

/**
 * Sample tasks for the dashboard
 */
export const tasks = [
	{
		id: '1',
		title: 'WordPress Website Migration & Optimization',
		description:
			'Need help migrating my WordPress site to a new host and optimizing it for speed and SEO.',
		category: 'IT & Technology',
		budget: 150,
		currency: 'USD',
		location: 'Remote',
		postedDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
		deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
		bids: 3,
		status: 'open'
	},
	{
		id: '2',
		title: 'Logo Design for Eco-Friendly Startup',
		description:
			'Looking for a creative designer to create a modern, eco-friendly logo for my new sustainable products business.',
		category: 'Creative Services',
		budget: 200,
		currency: 'USD',
		location: 'Remote',
		postedDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
		deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
		bids: 8,
		status: 'open'
	},
	{
		id: '3',
		title: 'Bathroom Renovation Help',
		description:
			'Need an experienced handyman to help renovate my bathroom. Will require tile work, plumbing, and fixture installation.',
		category: 'Home Maintenance',
		budget: 1200,
		currency: 'USD',
		location: 'San Francisco, CA',
		postedDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
		deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
		bids: 5,
		status: 'open'
	},
	{
		id: '4',
		title: 'Smart Contract Audit for NFT Project',
		description:
			'Looking for a Solidity expert to audit my NFT smart contract before deployment. Security is a priority.',
		category: 'IT & Technology',
		budget: 500,
		currency: 'USD',
		location: 'Remote',
		postedDate: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago
		deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
		bids: 2,
		status: 'open'
	},
	{
		id: '5',
		title: 'Mobile App Testing for iOS and Android',
		description:
			'Need thorough testing of my new fitness tracking app on multiple iOS and Android devices.',
		category: 'IT & Technology',
		budget: 300,
		currency: 'USD',
		location: 'Remote',
		postedDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
		deadline: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days from now
		bids: 4,
		status: 'open'
	},
	{
		id: '6',
		title: 'Content Writing for Crypto Blog',
		description:
			'Seeking an experienced writer with knowledge of cryptocurrency and blockchain to create weekly blog posts.',
		category: 'Professional Services',
		budget: 80,
		currency: 'USD',
		location: 'Remote',
		postedDate: new Date(Date.now() - 6 * 60 * 60 * 1000), // 6 hours ago
		deadline: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000), // 21 days from now
		bids: 7,
		status: 'open'
	}
];

/**
 * Sample tasks for the find tasks page
 */
export const tasks2 = [
	{
		id: '1',
		title: 'Fix leaking roof',
		description: 'My roof is leaking and needs to be fixed ASAP.',
		category: 'Home Maintenance',
		location: 'San Francisco, CA',
		isRemote: false,
		budget: '0.0015',
		currencyType: 'BTC',
		deadline: '2023-12-25',
		skills: ['Roofing', 'Carpentry'],
		postedBy: {
			id: 'user1',
			name: 'Alex Smith',
			rating: 4.8,
			completedTasks: 15
		},
		createdAt: '2023-12-01'
	},
	{
		id: '2',
		title: 'Website design for small business',
		description: 'Need a professional to design a modern website for my bakery.',
		category: 'IT & Technology',
		location: '',
		isRemote: true,
		budget: '0.005',
		currencyType: 'BTC',
		deadline: '2024-01-15',
		skills: ['Web Design', 'UI/UX', 'JavaScript'],
		postedBy: {
			id: 'user2',
			name: 'Maria Garcia',
			rating: 4.6,
			completedTasks: 8
		},
		createdAt: '2023-12-05'
	},
	{
		id: '3',
		title: 'Personal Shopping Assistant',
		description: 'Looking for someone to help me pick out a new wardrobe.',
		category: 'Personal Assistant',
		location: 'New York, NY',
		isRemote: false,
		budget: '0.00075',
		currencyType: 'BTC',
		deadline: '2023-12-20',
		skills: ['Fashion', 'Shopping', 'Styling'],
		postedBy: {
			id: 'user3',
			name: 'John Doe',
			rating: 4.2,
			completedTasks: 3
		},
		createdAt: '2023-12-07'
	},
	{
		id: '4',
		title: 'Move furniture to new apartment',
		description: 'Need help moving furniture from my old apartment to the new one nearby.',
		category: 'Delivery',
		location: 'Austin, TX',
		isRemote: false,
		budget: '0.002',
		currencyType: 'BTC',
		deadline: '2023-12-18',
		skills: ['Heavy Lifting', 'Moving', 'Driving'],
		postedBy: {
			id: 'user4',
			name: 'Sarah Johnson',
			rating: 4.9,
			completedTasks: 22
		},
		createdAt: '2023-12-03'
	},
	{
		id: '5',
		title: 'Translate business documents',
		description: 'Need a professional translator for business documents from English to Spanish.',
		category: 'Professional Services',
		location: '',
		isRemote: true,
		budget: '0.0025',
		currencyType: 'LBTC',
		deadline: '2024-01-05',
		skills: ['Translation', 'Spanish', 'Business'],
		postedBy: {
			id: 'user5',
			name: 'Robert Wilson',
			rating: 4.7,
			completedTasks: 17
		},
		createdAt: '2023-12-08'
	}
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
