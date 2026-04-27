/**
 * Different views of the user dashboard
 */
export const sections = [
	{
		id: 'hiring',
		path: '/dashboard',
		label: 'navbar.hiring',
		icon: 'mdi:briefcase-outline',
		mobile: true
	},
	{
		id: 'create-task',
		path: '/dashboard/create-task',
		label: 'navbar.create_task',
		icon: 'mdi:plus-circle-outline',
		mobile: true,
		indent: true
	},
	{
		id: 'find-services',
		path: '/services',
		label: 'navbar.find_services',
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
		path: '/tasks',
		label: 'navbar.find_tasks',
		icon: 'mdi:magnify',
		mobile: true,
		indent: true
	},
	{
		id: 'wallet',
		path: '/dashboard/wallet',
		label: 'navbar.wallet',
		icon: 'mdi:wallet-outline',
		mobile: true
	},
	{
		id: 'messages',
		path: '/dashboard/messages',
		label: 'navbar.messages',
		icon: 'mdi:chat-outline',
		mobile: true
	},
	{
		id: 'profile',
		path: '/dashboard/profile',
		label: 'navbar.profile',
		icon: 'mdi:account',
		mobile: false
	},
	{
		id: 'settings',
		path: '/dashboard/settings',
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
