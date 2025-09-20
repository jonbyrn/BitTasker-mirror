export interface Category {
    id: string;
    name: string;
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
        id: 'cleaning',
        name: 'Cleaning & Maintenance',
        description: 'House cleaning, office cleaning, carpet cleaning, window cleaning, and maintenance tasks'
    },
    {
        id: 'handyman',
        name: 'Handyman Services',
        description: 'General repairs, installations, furniture assembly, and home maintenance'
    },
    {
        id: 'moving',
        name: 'Moving & Delivery',
        description: 'Moving services, furniture delivery, courier services, and transportation'
    },
    {
        id: 'home-improvement',
        name: 'Home Improvement',
        description: 'Painting, renovations, plumbing, electrical work, and home upgrades'
    },
    {
        id: 'gardening',
        name: 'Gardening & Landscaping',
        description: 'Lawn care, garden maintenance, landscaping, and outdoor services'
    },
    {
        id: 'automotive',
        name: 'Automotive',
        description: 'Car repairs, mobile mechanics, car detailing, and vehicle services'
    },
    {
        id: 'personal-services',
        name: 'Personal Services',
        description: 'Beauty services, fitness training, personal care, and wellness'
    },
    {
        id: 'pet-care',
        name: 'Pet Care',
        description: 'Pet sitting, dog walking, grooming, and animal care services'
    },
    {
        id: 'events',
        name: 'Events & Entertainment',
        description: 'Event planning, catering, entertainment, and special occasions'
    },
    {
        id: 'professional',
        name: 'Professional Services',
        description: 'Legal, accounting, business consulting, and professional services'
    },
    {
        id: 'tutoring',
        name: 'Education & Tutoring',
        description: 'Private tutoring, lessons, coaching, and educational services'
    },
    {
        id: 'tech',
        name: 'Technology & IT',
        description: 'Computer repair, tech support, software development, and digital services'
    },
    {
        id: 'creative',
        name: 'Creative & Design',
        description: 'Graphic design, photography, videography, and creative services'
    },
    {
        id: 'food',
        name: 'Food & Catering',
        description: 'Personal chef services, meal prep, catering, and food delivery'
    },
    {
        id: 'financial-legal',
        name: 'Financial & Legal Services',
        description: 'Accounting, bookkeeping, legal consultation, tax services, and financial planning'
    },
    {
        id: 'business-admin',
        name: 'Business Support & Administration',
        description: 'Administrative services, HR support, sales assistance, and business consulting'
    },
    {
        id: 'healthcare-wellness',
        name: 'Healthcare & Wellness',
        description: 'Medical services, therapy, nutrition consulting, fitness training, and wellness services'
    },
    {
        id: 'marketing',
        name: 'Marketing',
        description: 'Digital marketing, advertising, content creation, social media management, and brand strategy'
    },
    {
        id: 'security-safety',
        name: 'Security & Safety',
        description: 'Security services, safety inspections, locksmith services, and safety consulting'
    },
    {
        id: 'waste-recycling',
        name: 'Waste & Recycling',
        description: 'Trash removal, junk removal, recycling services, and waste management'
    },
    {
        id: 'installation-assembly',
        name: 'Installation & Assembly',
        description: 'Appliance installation, furniture assembly, electronics setup, and equipment installation'
    },
    {
        id: 'inspection-assessment',
        name: 'Inspection & Assessment',
        description: 'Home inspections, vehicle inspections, property assessments, and safety evaluations'
    },
    {
        id: 'delivery-logistics',
        name: 'Delivery & Logistics',
        description: 'Package delivery, same-day delivery, specialized transport, and logistics services'
    },
    {
        id: 'real-estate',
        name: 'Real Estate',
        description: 'Property management, real estate photography, staging, and real estate services'
    },
    {
        id: 'other',
        name: 'Other',
        description: 'Other types of tasks not covered by other categories'
    }
]; 