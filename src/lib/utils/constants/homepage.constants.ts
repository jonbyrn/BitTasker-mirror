import type { LiveTask, FeaturedFreelancer } from '$lib/types/homepage';

export const liveTasks: LiveTask[] = [
	{
		id: '1',
		title: 'Need a logo for my new coffee shop',
		budget: 150,
		proposals: 12,
		timeLeft: '2 days',
		image: 'https://images.unsplash.com/photo-1559925393-8be0ec4767c8?q=80&w=1887&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D'
	},
	{
		id: '2',
		title: 'Develop a SvelteKit component library',
		budget: 1200,
		proposals: 5,
		timeLeft: '1 week',
		image: 'https://images.unsplash.com/photo-1633356122102-3fe601e05bd2?q=80&w=1887&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D'
	},
	{
		id: '3',
		title: 'Write a blog post about Bitcoin adoption',
		budget: 75,
		proposals: 25,
		timeLeft: '3 hours',
		image: 'https://images.unsplash.com/photo-1621417443338-55db8643545f?q=80&w=1740&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D'
	},
	{
		id: '4',
		title: 'Design a Bitcoin wallet interface',
		budget: 800,
		proposals: 9,
		timeLeft: '3 days',
		image: 'https://images.unsplash.com/photo-1627163439134-7a8c47e08208?q=80&w=2532&auto=format&fit=crop'
	},
	{
		id: '5',
		title: 'Translate website content to Spanish',
		budget: 250,
		proposals: 18,
		timeLeft: '1 day',
		image: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?q=80&w=2671&auto=format&fit=crop'
	},
	{
		id: '6',
		title: 'Build a Lightning Network payment app',
		budget: 2000,
		proposals: 4,
		timeLeft: '5 days',
		image: 'https://images.unsplash.com/photo-1620321023374-d1a68fbc720d?q=80&w=2497&auto=format&fit=crop'
	},
	{
		id: '7',
		title: 'Create social media graphics pack',
		budget: 175,
		proposals: 31,
		timeLeft: '12 hours',
		image: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?q=80&w=2674&auto=format&fit=crop'
	},
	{
		id: '8',
		title: 'Develop a Nostr client application',
		budget: 1500,
		proposals: 7,
		timeLeft: '4 days',
		image: 'https://images.unsplash.com/photo-1551434678-e076c223a692?q=80&w=2670&auto=format&fit=crop'
	},
	{
		id: '9',
		title: 'Write technical documentation',
		budget: 400,
		proposals: 15,
		timeLeft: '2 days',
		image: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?q=80&w=2670&auto=format&fit=crop'
	},
	{
		id: '10',
		title: 'Create a mobile app prototype',
		budget: 950,
		proposals: 11,
		timeLeft: '6 days',
		image: 'https://images.unsplash.com/photo-1581291518633-83b4ebd1d83e?q=80&w=2670&auto=format&fit=crop'
	},
	{
		id: '11',
		title: 'Edit promotional video',
		budget: 325,
		proposals: 19,
		timeLeft: '1 day',
		image: 'https://images.unsplash.com/photo-1536240478700-b869070f9279?q=80&w=2400&auto=format&fit=crop'
	},
	{
		id: '12',
		title: 'Setup Bitcoin multisig wallet',
		budget: 500,
		proposals: 6,
		timeLeft: '3 days',
		image: 'https://images.unsplash.com/photo-1639762681057-408e52192e55?q=80&w=2532&auto=format&fit=crop'
	},
	{
		id: '13',
		title: 'Design a minimalist logo set',
		budget: 275,
		proposals: 22,
		timeLeft: '4 days',
		image: 'https://images.unsplash.com/photo-1558655146-364adaf1fcc9?q=80&w=2564&auto=format&fit=crop'
	},
	{
		id: '14',
		title: 'Create podcast cover art',
		budget: 100,
		proposals: 28,
		timeLeft: '1 day',
		image: 'https://images.unsplash.com/photo-1581368135153-a506cf13531c?q=80&w=2670&auto=format&fit=crop'
	},
	{
		id: '15',
		title: 'Develop Liquid Network integration',
		budget: 1800,
		proposals: 3,
		timeLeft: '1 week',
		image: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?q=80&w=2670&auto=format&fit=crop'
	},
	{
		id: '16',
		title: 'Write Lightning Network tutorial',
		budget: 350,
		proposals: 14,
		timeLeft: '5 days',
		image: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?q=80&w=2670&auto=format&fit=crop'
	}
];

export const featuredFreelancers: FeaturedFreelancer[] = [
	{
		id: '1',
		name: 'Alice Johnson',
		skills: 'UI/UX Design, Svelte, Figma',
		rating: 4.9,
		reviews: 124,
		avatar: 'https://randomuser.me/api/portraits/women/44.jpg'
	},
	{
		id: '2',
		name: 'Bob Williams',
		skills: 'Nostr, Rust, Bitcoin Dev',
		rating: 5.0,
		reviews: 89,
		avatar: 'https://randomuser.me/api/portraits/men/46.jpg'
	},
	{
		id: '3',
		name: 'Charlie Brown',
		skills: 'Content Writing, SEO, Marketing',
		rating: 4.8,
		reviews: 231,
		avatar: 'https://randomuser.me/api/portraits/men/47.jpg'
	},
	{
		id: '4',
		name: 'Diana Garcia',
		skills: 'JavaScript, TypeScript, SvelteKit',
		rating: 4.9,
		reviews: 176,
		avatar: 'https://randomuser.me/api/portraits/women/65.jpg'
	},
	{
		id: '5',
		name: 'Eric Zhang',
		skills: 'Graphic Design, Illustration, Branding',
		rating: 4.7,
		reviews: 92,
		avatar: 'https://randomuser.me/api/portraits/men/55.jpg'
	},
	{
		id: '6',
		name: 'Fiona Smith',
		skills: 'Full Stack Development, Node.js, MongoDB',
		rating: 4.9,
		reviews: 143,
		avatar: 'https://randomuser.me/api/portraits/women/67.jpg'
	},
	{
		id: '7',
		name: 'George Martinez',
		skills: 'Lightning Network, Bitcoin Apps',
		rating: 5.0,
		reviews: 58,
		avatar: 'https://randomuser.me/api/portraits/men/36.jpg'
	},
	{
		id: '8',
		name: 'Hannah Wilson',
		skills: 'Mobile App Development, React Native',
		rating: 4.8,
		reviews: 201,
		avatar: 'https://randomuser.me/api/portraits/women/90.jpg'
	},
	{
		id: '9',
		name: 'Ian Taylor',
		skills: 'DeFi, Smart Contracts, Solidity',
		rating: 4.9,
		reviews: 87,
		avatar: 'https://randomuser.me/api/portraits/men/27.jpg'
	},
	{
		id: '10',
		name: 'Julia Robinson',
		skills: 'Video Editing, Motion Graphics',
		rating: 4.7,
		reviews: 119,
		avatar: 'https://randomuser.me/api/portraits/women/32.jpg'
	},
	{
		id: '11',
		name: 'Kevin Lee',
		skills: 'Technical Writing, Documentation',
		rating: 4.8,
		reviews: 76,
		avatar: 'https://randomuser.me/api/portraits/men/78.jpg'
	},
	{
		id: '12',
		name: 'Linda Chen',
		skills: 'Blockchain Development, Cryptography',
		rating: 5.0,
		reviews: 94,
		avatar: 'https://randomuser.me/api/portraits/women/79.jpg'
	},
	{
		id: '13',
		name: 'Michael Clark',
		skills: 'DevOps, AWS, Infrastructure',
		rating: 4.9,
		reviews: 152,
		avatar: 'https://randomuser.me/api/portraits/men/14.jpg'
	},
	{
		id: '14',
		name: 'Natalie Wong',
		skills: 'UX Research, Product Design',
		rating: 4.8,
		reviews: 108,
		avatar: 'https://randomuser.me/api/portraits/women/50.jpg'
	},
	{
		id: '15',
		name: 'Oscar Hernandez',
		skills: 'Nostr Protocol, Digital Identity',
		rating: 4.9,
		reviews: 63,
		avatar: 'https://randomuser.me/api/portraits/men/42.jpg'
	},
	{
		id: '16',
		name: 'Patricia Kumar',
		skills: 'Cybersecurity, Encryption, Privacy',
		rating: 5.0,
		reviews: 71,
		avatar: 'https://randomuser.me/api/portraits/women/85.jpg'
	}
];
