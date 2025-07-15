import type { LiveTask, FeaturedTaskee } from '$lib/types/homepage';

export const liveTasks: LiveTask[] = [
	{
		id: '1',
		title: 'Urgent plumbing repair needed for leaking bathroom',
		budget: 150,
		proposals: 8,
		timeLeft: '3 hours',
		image: 'https://images.unsplash.com/photo-1542013936693-884638332954?auto=format&fit=crop&w=800'
	},
	{
		id: '2',
		title: 'Electrician needed to install ceiling fans',
		budget: 200,
		proposals: 5,
		timeLeft: '1 day',
		image: 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=800'
	},
	{
		id: '3',
		title: 'Help setting up Bitcoin node at home',
		budget: 175,
		proposals: 4,
		timeLeft: '2 days',
		image: 'https://images.unsplash.com/photo-1518546305927-5a555bb7020d?auto=format&fit=crop&w=800'
	},
	{
		id: '4',
		title: 'Lawn mowing and garden maintenance needed weekly',
		budget: 80,
		proposals: 12,
		timeLeft: '4 hours',
		image: 'https://images.unsplash.com/photo-1690068023694-053da714f95f?q=80&w=800&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D'
	},
	{
		id: '5',
		title: 'House painting service for 3-bedroom home',
		budget: 1200,
		proposals: 7,
		timeLeft: '3 days',
		image: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=800'
	},
	{
		id: '6',
		title: 'Setup Lightning wallet and channels for small business',
		budget: 300,
		proposals: 3,
		timeLeft: '1 day',
		image: 'https://images.unsplash.com/photo-1518546305927-5a555bb7020d?auto=format&fit=crop&w=800'
	},
	{
		id: '7',
		title: 'Handyman needed for various home repairs',
		budget: 250,
		proposals: 10,
		timeLeft: '12 hours',
		image: 'https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=800'
	},
	{
		id: '8',
		title: 'HVAC technician for AC installation',
		budget: 600,
		proposals: 4,
		timeLeft: '2 days',
		image: 'https://images.unsplash.com/photo-1545259742-b4fd8fea67e4?q=80&w=1470&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D'
	},
	{
		id: '9',
		title: 'Setup multisig Bitcoin wallet for family inheritance',
		budget: 400,
		proposals: 5,
		timeLeft: '4 days',
		image: 'https://images.unsplash.com/photo-1516245834210-c4c142787335?auto=format&fit=crop&w=800'
	},
	{
		id: '10',
		title: 'Fence repair and staining needed',
		budget: 350,
		proposals: 8,
		timeLeft: '1 day',
		image: 'https://images.unsplash.com/photo-1700076275772-382f5132876c?q=80&w=800&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D'
	},
	{
		id: '11',
		title: 'Tree removal service for backyard',
		budget: 500,
		proposals: 6,
		timeLeft: '3 days',
		image: 'https://images.unsplash.com/photo-1697623317093-7a50b4aaf676?q=80&w=800&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D'
	},
	{
		id: '12',
		title: 'Bitcoin ATM installation for local shop',
		budget: 800,
		proposals: 3,
		timeLeft: '5 days',
		image: 'https://images.unsplash.com/photo-1623039405147-547794f92e9e?auto=format&fit=crop&w=800'
	},
	{
		id: '13',
		title: 'Pest control service for residential home',
		budget: 150,
		proposals: 9,
		timeLeft: '1 day',
		image: 'https://images.unsplash.com/photo-1581578017093-cd30fce4eeb7?q=80&w=800&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D'
	},
	{
		id: '14',
		title: 'Furniture assembly - IKEA bedroom set',
		budget: 100,
		proposals: 15,
		timeLeft: '6 hours',
		image: 'https://images.unsplash.com/photo-1556228453-efd6c1ff04f6?auto=format&fit=crop&w=800'
	},
	{
		id: '15',
		title: 'Garage door repair and maintenance',
		budget: 180,
		proposals: 7,
		timeLeft: '2 days',
		image: 'https://images.unsplash.com/photo-1675747158954-4a32e28812c0?q=80&w=800&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D'
	},
	{
		id: '16',
		title: 'Help setting up Liquid Network wallet',
		budget: 120,
		proposals: 4,
		timeLeft: '3 days',
		image: 'https://images.unsplash.com/photo-1516245834210-c4c142787335?auto=format&fit=crop&w=800'
	}
];

export const featuredTaskees: FeaturedTaskee[] = [
	{
		id: '1',
		name: 'Mike Rivera',
		skills: 'Plumbing, Water Heater Installation, Repairs',
		rating: 4.9,
		reviews: 124,
		avatar: 'https://randomuser.me/api/portraits/men/44.jpg'
	},
	{
		id: '2',
		name: 'Sarah Chen',
		skills: 'Electrician, Wiring, Lighting Installation',
		rating: 5.0,
		reviews: 89,
		avatar: 'https://randomuser.me/api/portraits/women/46.jpg'
	},
	{
		id: '3',
		name: 'James Wilson',
		skills: 'Landscaping, Lawn Care, Garden Design',
		rating: 4.8,
		reviews: 231,
		avatar: 'https://randomuser.me/api/portraits/men/47.jpg'
	},
	{
		id: '4',
		name: 'Lisa Rodriguez',
		skills: 'House Cleaning, Organization, Deep Cleaning',
		rating: 4.9,
		reviews: 176,
		avatar: 'https://randomuser.me/api/portraits/women/65.jpg'
	},
	{
		id: '5',
		name: 'David Kim',
		skills: 'Handyman, Furniture Assembly, Repairs',
		rating: 4.7,
		reviews: 92,
		avatar: 'https://randomuser.me/api/portraits/men/55.jpg'
	},
	{
		id: '6',
		name: 'Maria Sanchez',
		skills: 'House Painting, Wall Repair, Interior Design',
		rating: 4.9,
		reviews: 143,
		avatar: 'https://randomuser.me/api/portraits/women/67.jpg'
	},
	{
		id: '7',
		name: 'Robert Johnson',
		skills: 'Bitcoin Node Setup, Lightning Network, Wallet Security',
		rating: 5.0,
		reviews: 58,
		avatar: 'https://randomuser.me/api/portraits/men/36.jpg'
	},
	{
		id: '8',
		name: 'Patricia Thompson',
		skills: 'HVAC Technician, AC Repair, Heating Systems',
		rating: 4.8,
		reviews: 201,
		avatar: 'https://randomuser.me/api/portraits/women/90.jpg'
	},
	{
		id: '9',
		name: 'Carlos Mendez',
		skills: 'Carpentry, Custom Furniture, Woodworking',
		rating: 4.6,
		reviews: 117,
		avatar: 'https://randomuser.me/api/portraits/men/18.jpg'
	},
	{
		id: '10',
		name: 'Jennifer Miller',
		skills: 'Home Organizing, Decluttering, Space Planning',
		rating: 4.9,
		reviews: 108,
		avatar: 'https://randomuser.me/api/portraits/women/35.jpg'
	},
	{
		id: '11',
		name: 'Kevin Patel',
		skills: 'Bitcoin Security, Cold Storage Setup, Multisig',
		rating: 5.0,
		reviews: 74,
		avatar: 'https://randomuser.me/api/portraits/men/62.jpg'
	},
	{
		id: '12',
		name: 'Laura Wright',
		skills: 'Pet Care, Dog Walking, House Sitting',
		rating: 4.8,
		reviews: 195,
		avatar: 'https://randomuser.me/api/portraits/women/21.jpg'
	},
	{
		id: '13',
		name: 'Michael Chen',
		skills: 'Appliance Repair, Installation, Maintenance',
		rating: 4.7,
		reviews: 83,
		avatar: 'https://randomuser.me/api/portraits/men/73.jpg'
	},
	{
		id: '14',
		name: 'Nina Taylor',
		skills: 'Window Cleaning, Gutter Cleaning, Power Washing',
		rating: 4.9,
		reviews: 141,
		avatar: 'https://randomuser.me/api/portraits/women/24.jpg'
	},
	{
		id: '15',
		name: 'Omar Wilson',
		skills: 'Roofing, Roof Repair, Inspection',
		rating: 4.8,
		reviews: 127,
		avatar: 'https://randomuser.me/api/portraits/men/41.jpg'
	},
	{
		id: '16',
		name: 'Priya Sharma',
		skills: 'Lightning Network Setup, Bitcoin Education',
		rating: 4.7,
		reviews: 169,
		avatar: 'https://randomuser.me/api/portraits/women/29.jpg'
	}
];
