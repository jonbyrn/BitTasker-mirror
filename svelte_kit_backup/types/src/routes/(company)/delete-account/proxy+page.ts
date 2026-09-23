// @ts-nocheck
import type { PageLoad } from './$types';

export const load = async ({ url }: Parameters<PageLoad>[0]) => {
	const baseUrl = (import.meta.env.VITE_CLIENT_URL || 'https://bittasker.com').replace(/\/$/, '');

	return {
		title: 'Delete Your Account - BitTasker | Account & Data Deletion',
		description:
			'Request deletion of your BitTasker account and associated data. Learn how our non-custodial account deletion process works and what data gets removed.',
		keywords:
			'BitTasker delete account, account deletion, data deletion, remove account, Bitcoin marketplace account, Nostr account deletion, GDPR data removal',
		canonical: `${baseUrl}${url.pathname}`,
		ogTitle: 'Delete Your Account - BitTasker',
		ogDescription:
			'Request deletion of your BitTasker account and associated data. Learn how our non-custodial account deletion process works.',
		twitterTitle: 'Delete Your BitTasker Account',
		twitterDescription:
			'Request deletion of your BitTasker account and associated data. Learn how our non-custodial account deletion process works.',
		jsonLd: {
			'@context': 'https://schema.org',
			'@type': 'WebPage',
			name: 'Delete Your Account - BitTasker',
			description:
				'Request deletion of your BitTasker account and associated data. Learn how our non-custodial account deletion process works.',
			url: `${baseUrl}${url.pathname}`,
			mainEntity: {
				'@type': 'HowTo',
				name: 'How to Delete Your BitTasker Account',
				description: 'Step-by-step guide to deleting your BitTasker account and associated data.',
				step: [
					{
						'@type': 'HowToStep',
						position: 1,
						name: 'Log In to BitTasker',
						text: 'Log in using your Nostr private key (nsec), recovery password, or passkey.'
					},
					{
						'@type': 'HowToStep',
						position: 2,
						name: 'Go to Settings',
						text: 'Navigate to Settings → Account Actions and click the Delete Account button.'
					},
					{
						'@type': 'HowToStep',
						position: 3,
						name: 'Confirm Deletion',
						text: 'Review the consequences and confirm. A 30-day grace period begins.'
					},
					{
						'@type': 'HowToStep',
						position: 4,
						name: 'Permanent Deletion',
						text: 'After 30 days with no login, your account is permanently deleted.'
					}
				]
			}
		}
	};
};
