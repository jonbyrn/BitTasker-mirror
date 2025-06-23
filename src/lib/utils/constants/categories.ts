export interface Category {
    id: string;
    name: string;
    description: string;
}

export const TASK_CATEGORIES: Category[] = [
    {
        id: 'dev',
        name: 'Software Development',
        description: 'Programming, web development, mobile apps, and other software tasks'
    },
    {
        id: 'design',
        name: 'Design',
        description: 'Graphic design, UI/UX, illustrations, and visual content'
    },
    {
        id: 'writing',
        name: 'Writing & Content',
        description: 'Content writing, copywriting, translations, and documentation'
    },
    {
        id: 'marketing',
        name: 'Marketing',
        description: 'Digital marketing, social media, SEO, and promotion'
    },
    {
        id: 'admin',
        name: 'Administrative',
        description: 'Virtual assistance, data entry, research, and organization'
    },
    {
        id: 'finance',
        name: 'Finance & Accounting',
        description: 'Bookkeeping, financial analysis, and accounting tasks'
    },
    {
        id: 'legal',
        name: 'Legal',
        description: 'Legal assistance, contract review, and compliance'
    },
    {
        id: 'education',
        name: 'Education & Training',
        description: 'Teaching, tutoring, and course creation'
    },
    {
        id: 'creative',
        name: 'Creative & Media',
        description: 'Video editing, animation, music, and multimedia'
    },
    {
        id: 'other',
        name: 'Other',
        description: 'Other types of tasks not covered by other categories'
    }
]; 