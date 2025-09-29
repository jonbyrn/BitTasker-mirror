/**
 * Different views of the user dashboard
 */
export const sections = [
	{ id: '', label: 'navbar.my_tasks', icon: 'mdi:format-list-bulleted', mobile: true }, // Default section
	{ id: 'create-task', label: 'navbar.create_task', icon: 'mdi:plus-circle-outline', mobile: true },
	{ id: 'find-tasks', label: 'navbar.find_tasks', icon: 'mdi:magnify', mobile: true },
	{ id: 'bids-sent', label: 'navbar.bids_sent', icon: 'mdi:invoice-text-send-outline', mobile: true },
	{ id: 'contracts', label: 'navbar.contracts', icon: 'mdi:file-sign', mobile: true },
	{ id: 'wallet', label: 'navbar.wallet', icon: 'mdi:wallet-outline', mobile: true },
	{ id: 'profile', label: 'navbar.profile', icon: 'mdi:account', mobile: false },
	{ id: 'messages', label: 'navbar.messages', icon: 'mdi:chat-outline', mobile: true },
	{ id: 'settings', label: 'navbar.settings', icon: 'mdi:cog', mobile: false }
];

/**
 * Key derivation contexts for master key encryption
 */
export const DERIVATION_CONTEXTS = {
	NOSTR: 'nostr-key-v1',
	WALLET: 'wallet-mnemonic-v1'
};
