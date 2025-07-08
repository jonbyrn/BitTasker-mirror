export interface Category {
    id: string;
    name: string;
    description: string;
}

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
        id: 'other',
        name: 'Other',
        description: 'Other types of tasks not covered by other categories'
    }
]; 