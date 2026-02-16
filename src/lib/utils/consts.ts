/**
 * Different views of the user dashboard
 */
export const sections = [
	{ id: '', path: '/dashboard?tab=tasks', label: 'navbar.my_tasks', icon: 'mdi:format-list-bulleted', mobile: true }, // Default section
	{ id: 'create-task', path: '/dashboard/create-task', label: 'navbar.create_task', icon: 'mdi:plus-circle-outline', mobile: true },
	{ id: 'find-tasks', path: '/tasks', label: 'navbar.find_tasks', icon: 'mdi:magnify', mobile: true },
	{ id: 'find-services', path: '/services', label: 'navbar.find_services', icon: 'mdi:briefcase-search', mobile: true },
	{ id: 'bids-sent', path: '/dashboard?tab=bids', label: 'navbar.bids_sent', icon: 'mdi:invoice-text-send-outline', mobile: true },
	{ id: 'contracts', path: '/dashboard?tab=contracts', label: 'navbar.contracts', icon: 'mdi:file-sign', mobile: true },
	{ id: 'wallet', path: '/dashboard/wallet', label: 'navbar.wallet', icon: 'mdi:wallet-outline', mobile: true },
	{ id: 'profile', path: '/dashboard/profile', label: 'navbar.profile', icon: 'mdi:account', mobile: false },
	{ id: 'messages', path: '/dashboard/messages', label: 'navbar.messages', icon: 'mdi:chat-outline', mobile: true },
	{ id: 'settings', path: '/dashboard/settings', label: 'navbar.settings', icon: 'mdi:cog', mobile: false }
];

/**
 * Key derivation contexts for master key encryption
 */
export const DERIVATION_CONTEXTS = {
	NOSTR: 'nostr-key-v1',
	WALLET: 'wallet-mnemonic-v1'
};
