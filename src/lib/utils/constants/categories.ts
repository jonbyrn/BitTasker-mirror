export interface Category {
	id: string;
	name: string;
	slug: string;
	description: string;
}

// Plan is to go here:

// ### Creative And Marketing Services
// *   Advertising And Branding
// *   Content Creation And Editing
// *   Digital And Graphic Design
// *   Market Research
// *   Photography And Video Production
// *   Other Creative And Marketing Services

// ### Home And Property Services
// *   Cleaning And Maintenance
// *   Construction And Renovation
// *   Gardening And Landscaping
// *   Home And Equipment Repair
// *   Interior And Exterior Work (Includes Glass, Plumbing, And Electrical)
// *   Moving And Transport
// *   Waste Removal
// *   Other Home And Property Services

// ### Healthcare And Wellness
// *   Medical And Therapeutic Services
// *   Nutrition And Fitness Training
// *   Personal Care And Beauty
// *   Well-Being And Alternative Therapy
// *   Other Healthcare And Wellness Services

// ### Business Support And Administration
// *   Administrative Services
// *   Human Resources And Staffing
// *   Logistics And Supply Chain Management
// *   Sales And Telemarketing
// *   Translation Services
// *   Other Business Support And Administration Services

// ### Personal And Event Services
// *   Childcare And Household Help
// *   Event Planning And Logistics
// *   Personal Assistance And Instruction
// *   Pet Care Services
// *   Security And Protection
// *   Other Personal And Event Services

// ### Technical And IT Services
// *   IT Support And Management
// *   Software And App Development
// *   Cybersecurity
// *   Data And Analytics
// *   Specialized Installation And Repair
// *   Other Technical And IT Services

// ### Financial And Legal Services
// *   Accounting And Bookkeeping
// *   Advisory And Consulting
// *   Financial Asset Management
// *   Legal Services
// *   Tax Services
// *   Other Financial And Legal Services

// ### Specialized And Consulting
// *   Coaching And Training
// *   Environmental Services
// *   Research And Analysis
// *   Other Specialized And Consulting Services

// ### Everything Else
// *   Other In-Person Services
// *   Other Remote Services

export const TASK_CATEGORIES: Category[] = [
	{
		id: '1',
		slug: 'cleaning',
		name: 'Cleaning & Maintenance',
		description:
			'House cleaning, office cleaning, carpet cleaning, window cleaning, and maintenance tasks'
	},
	{
		id: '2',
		slug: 'handyman',
		name: 'Handyman Services',
		description: 'General repairs, installations, furniture assembly, and home maintenance'
	},
	{
		id: '3',
		slug: 'moving',
		name: 'Moving & Delivery',
		description: 'Moving services, furniture delivery, courier services, and transportation'
	},
	{
		id: '4',
		slug: 'home-improvement',
		name: 'Home Improvement',
		description: 'Painting, renovations, plumbing, electrical work, and home upgrades'
	},
	{
		id: '29',
		slug: 'building-construction',
		name: 'Building and Construction',
		description:
			'New construction, building projects, structural work, commercial construction, and residential building services'
	},
	{
		id: '5',
		slug: 'gardening',
		name: 'Gardening & Landscaping',
		description: 'Lawn care, garden maintenance, landscaping, and outdoor services'
	},
	{
		id: '6',
		slug: 'automotive',
		name: 'Automotive',
		description: 'Car repairs, mobile mechanics, car detailing, and vehicle services'
	},
	{
		id: '7',
		slug: 'personal-services',
		name: 'Personal Services',
		description: 'Beauty services, fitness training, personal care, and wellness'
	},
	{
		id: '8',
		slug: 'pet-care',
		name: 'Pet Care',
		description: 'Pet sitting, dog walking, grooming, and animal care services'
	},
	{
		id: '9',
		slug: 'events',
		name: 'Events & Entertainment',
		description: 'Event planning, catering, entertainment, and special occasions'
	},
	{
		id: '10',
		slug: 'professional',
		name: 'Professional Services',
		description: 'Legal, accounting, business consulting, and professional services'
	},
	{
		id: '11',
		slug: 'tutoring',
		name: 'Education & Tutoring',
		description: 'Private tutoring, lessons, coaching, and educational services'
	},
	{
		id: '12',
		slug: 'tech',
		name: 'Technology & IT',
		description: 'Computer repair, tech support, software development, and digital services'
	},
	{
		id: '30',
		slug: 'it-web-development',
		name: 'IT and Web Development',
		description:
			'Web development, software development, IT services, API integration, database management, and technical solutions'
	},
	{
		id: '13',
		slug: 'creative',
		name: 'Creative & Design',
		description: 'Graphic design, photography, videography, and creative services'
	},
	{
		id: '14',
		slug: 'food',
		name: 'Food & Catering',
		description: 'Personal chef services, meal prep, catering, and food delivery'
	},
	{
		id: '15',
		slug: 'financial-legal',
		name: 'Financial & Legal Services',
		description: 'Accounting, bookkeeping, legal consultation, tax services, and financial planning'
	},
	{
		id: '16',
		slug: 'business-admin',
		name: 'Business Support & Administration',
		description: 'Administrative services, HR support, sales assistance, and business consulting'
	},
	{
		id: '17',
		slug: 'healthcare-wellness',
		name: 'Healthcare & Wellness',
		description:
			'Medical services, therapy, nutrition consulting, fitness training, and wellness services'
	},
	{
		id: '18',
		slug: 'marketing',
		name: 'Marketing',
		description:
			'Digital marketing, advertising, content creation, social media management, and brand strategy'
	},
	{
		id: '19',
		slug: 'security-safety',
		name: 'Security & Safety',
		description: 'Security services, safety inspections, locksmith services, and safety consulting'
	},
	{
		id: '20',
		slug: 'waste-recycling',
		name: 'Waste & Recycling',
		description: 'Trash removal, junk removal, recycling services, and waste management'
	},
	{
		id: '21',
		slug: 'installation-assembly',
		name: 'Installation & Assembly',
		description:
			'Appliance installation, furniture assembly, electronics setup, and equipment installation'
	},
	{
		id: '22',
		slug: 'inspection-assessment',
		name: 'Inspection & Assessment',
		description:
			'Home inspections, vehicle inspections, property assessments, and safety evaluations'
	},
	{
		id: '23',
		slug: 'delivery-logistics',
		name: 'Delivery & Logistics',
		description:
			'Package delivery, same-day delivery, specialized transport, and logistics services'
	},
	{
		id: '24',
		slug: 'real-estate',
		name: 'Real Estate',
		description: 'Property management, real estate photography, staging, and real estate services'
	},
	{
		id: '25',
		slug: 'accommodation',
		name: 'Accommodation',
		description: 'Short-term rentals, room booking, accommodation services, and hospitality stays'
	},
	{
		id: '26',
		slug: 'hospitality',
		name: 'Hospitality',
		description:
			'Restaurant services, catering, food service, event hospitality, and guest services'
	},
	{
		id: '27',
		slug: 'tourism',
		name: 'Tourism',
		description:
			'Tour guiding, travel assistance, local experiences, sightseeing, and tourism services'
	},
	{
		id: '31',
		slug: 'transportation',
		name: 'Transportation',
		description:
			'Ridesharing, passenger transport, taxi services, airport transfers, and personal transportation'
	},
	{
		id: '32',
		slug: 'childcare',
		name: 'Childcare & Babysitting',
		description: 'Babysitting, nanny services, daycare, after-school care, and child supervision'
	},
	{
		id: '33',
		slug: 'writing-editing',
		name: 'Writing & Editing',
		description: 'Copywriting, proofreading, editing, content writing, resumes, and ghostwriting'
	},
	{
		id: '34',
		slug: 'translation',
		name: 'Translation',
		description: 'Document translation, interpretation, localization, and multilingual services'
	},
	{
		id: '35',
		slug: 'virtual-assistant',
		name: 'Virtual Assistant',
		description:
			'Remote administrative support, email management, scheduling, data entry, and personal organization'
	},
	{
		id: '36',
		slug: 'coaching-training',
		name: 'Coaching & Training',
		description:
			'Life coaching, career coaching, professional development, public speaking, and corporate training'
	},
	{
		id: '28',
		slug: 'other',
		name: 'Other',
		description: 'Other types of tasks not covered by other categories'
	},
	{
		id: '37',
		slug: 'bitcoin-nostr',
		name: 'Bitcoin and Nostr',
		description: 'Bitcoin, Lightning, and Nostr work'
	},
	{
		id: '38',
		slug: 'ai-agents',
		name: 'AI agents',
		description: 'AI agents, prompts, and automation'
	}
];
