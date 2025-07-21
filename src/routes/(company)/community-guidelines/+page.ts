
import type { PageLoad } from './$types';


export const load: PageLoad = async () => {
	const seo = {
		title: 'Community Guidelines - BitTasker | Platform Rules',
		description: 'Learn about BitTasker\'s community guidelines, platform rules, and user safety policies. Understand how to behave properly on our Bitcoin task marketplace.',
		keywords: 'BitTasker community guidelines, platform rules, user safety, Bitcoin marketplace conduct, task platform policies, community standards, user behavior guidelines',
		canonical: 'https://bittasker.com/community-guidelines',
		ogTitle: 'Community Guidelines - BitTasker | Platform Rules & User Safety',
		ogDescription: 'Learn about BitTasker\'s community guidelines, platform rules, and user safety policies. Understand how to behave properly on our Bitcoin task marketplace.',
		twitterTitle: 'Community Guidelines - BitTasker | Platform Rules & User Safety',
		twitterDescription: 'Learn about BitTasker\'s community guidelines, platform rules, and user safety policies. Understand how to behave properly on our Bitcoin task marketplace.',
		jsonLd: {
			'@context': 'https://schema.org',
			'@type': 'WebPage',
			'name': 'Community Guidelines - BitTasker',
			'description': 'Learn about BitTasker\'s community guidelines, platform rules, and user safety policies. Understand how to behave properly on our Bitcoin task marketplace for a positive experience.',
			'url': 'https://bittasker.com/community-guidelines',

			'mainEntity': {
				'@type': 'Article',
				'headline': 'Community Guidelines - BitTasker Platform Rules',
				'description': 'Comprehensive guidelines for proper behavior and conduct on the BitTasker platform',
				'datePublished': '2024-01-15',
				'dateModified': '2024-01-15'
			}
		}
	};

	return {
		seo
	};
};
