/**
 * Different views of the user dashboard
 */
export const sections = [
	{ id: '', label: 'navbar.my_tasks', icon: 'mdi:format-list-bulleted', mobile: true }, // Default section
	{ id: 'create-task', label: 'navbar.create_task', icon: 'mdi:plus-circle', mobile: true },
	{ id: 'find-tasks', label: 'navbar.find_tasks', icon: 'mdi:magnify', mobile: true },
	{ id: 'wallet', label: 'navbar.wallet', icon: 'mdi:wallet', mobile: true },
	{ id: 'profile', label: 'navbar.profile', icon: 'mdi:account', mobile: false },
	{ id: 'messages', label: 'navbar.messages', icon: 'mdi:message', mobile: true },
	{ id: 'settings', label: 'navbar.settings', icon: 'mdi:cog', mobile: false }
];

/**
 * Key derivation contexts for master key encryption
 */
export const DERIVATION_CONTEXTS = {
	NOSTR: 'nostr-key-v1',
	WALLET: 'wallet-mnemonic-v1'
};
