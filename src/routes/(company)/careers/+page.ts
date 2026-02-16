import { BITTASKER_ORG_JSONLD } from '$lib/utils/constants/seo.constants';

export async function load({ url }) {
	return {
		title: 'Careers at BitTasker - Bitcoin Jobs | Remote Opportunities',
		description: 'Join BitTasker\'s mission to democratize work through Bitcoin and decentralized technology. Remote Bitcoin jobs available. Help build the future of work.',
		keywords: 'BitTasker careers, Bitcoin jobs, remote cryptocurrency jobs, Bitcoin developers, decentralized work, Lightning Network jobs, blockchain careers, Bitcoin startup jobs, remote work Bitcoin, cryptocurrency careers',
		canonical: url.href,
		ogTitle: 'Careers at BitTasker - Join the Bitcoin Revolution',
		ogDescription: 'Help us build the decentralized future of work. Remote Bitcoin jobs available at BitTasker. Join our mission to empower global earning through Bitcoin technology.',
		twitterTitle: 'Join BitTasker - Remote Bitcoin Jobs Available',
		twitterDescription: 'Help democratize work through Bitcoin and decentralized technology. Remote positions available. Join the Bitcoin revolution at BitTasker.',
		jsonLd: {
			'@context': 'https://schema.org',
			'@type': 'JobPosting',
			title: 'Software Developer - Bitcoin & Lightning Network',
			description: 'Join BitTasker to build the future of decentralized work. We\'re looking for passionate developers to help create a Bitcoin-powered task marketplace.',
			hiringOrganization: BITTASKER_ORG_JSONLD,
			datePosted: '2025-07-21',
			employmentType: 'FULL_TIME',
			jobLocation: {
				'@type': 'Place',
				address: {
					'@type': 'PostalAddress',
					addressLocality: 'Remote',
					addressCountry: 'Global'
				}
			},
			baseSalary: {
				'@type': 'MonetaryAmount',
				currency: 'BTC',
				value: {
					'@type': 'QuantitativeValue',
					minValue: '0.5',
					maxValue: '2.0',
					unitText: 'BTC per year'
				}
			},
			workHours: 'Flexible',
			benefits: 'Bitcoin salary, Remote work, Flexible hours, Innovation-driven environment'
		}
	};
}
