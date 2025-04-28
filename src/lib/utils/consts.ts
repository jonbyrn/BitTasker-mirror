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
