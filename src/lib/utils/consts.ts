/**
 * Different views of the user dashboard
 */
export const sections = [
	{
		id: 'hiring',
		path: '/hiring',
		label: 'navbar.hiring',
		icon: 'mdi:briefcase-outline',
		mobile: true
	},
	{
		id: 'create-task',
		path: '/create-task',
		label: 'navbar.create_task',
		icon: 'mdi:plus-circle-outline',
		mobile: true,
		indent: true
	},
	{
		id: 'find-services',
		path: '/browse/services',
		label: 'navbar.browse_services',
		icon: 'mdi:briefcase-search',
		mobile: true,
		indent: true
	},
	{
		id: 'earning',
		path: '/earning',
		label: 'navbar.earning',
		icon: 'mdi:trending-up',
		mobile: true
	},
	{
		id: 'find-tasks',
		path: '/browse/tasks',
		label: 'navbar.browse_tasks',
		icon: 'mdi:magnify',
		mobile: true,
		indent: true
	},
	{
		id: 'wallet',
		path: '/wallet',
		label: 'navbar.wallet',
		icon: 'mdi:wallet-outline',
		mobile: true
	},
	{
		id: 'reviews',
		path: '/reviews',
		label: 'navbar.reviews',
		icon: 'mdi:star-outline',
		mobile: true
	},
	{
		id: 'messages',
		path: '/messages',
		label: 'navbar.messages',
		icon: 'mdi:chat-outline',
		mobile: true
	},
	{
		id: 'notifications',
		path: '/notifications',
		label: 'navbar.notifications',
		icon: 'mdi:bell-outline',
		mobile: false
	},
	{
		id: 'profile',
		path: '/profile',
		label: 'navbar.profile',
		icon: 'mdi:account',
		mobile: false
	},
	{
		id: 'settings',
		path: '/settings',
		label: 'navbar.settings',
		icon: 'mdi:cog',
		mobile: false
	}
];

/**
 * Key derivation contexts for master key encryption
 */
export const DERIVATION_CONTEXTS = {
	NOSTR: 'nostr-key-v1',
	WALLET: 'wallet-mnemonic-v1'
};
