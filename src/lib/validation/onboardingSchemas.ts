import { z } from 'zod';

// Account creation schema
export const accountCreateSchema = z.object({
	email: z.string().email('Please enter a valid email address'),
	password: z
		.string()
		.min(8, 'Password must be at least 8 characters')
		.regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
		.regex(/[a-z]/, 'Password must contain at least one lowercase letter')
		.regex(/[0-9]/, 'Password must contain at least one number')
});

// Name and location schema
export const nameLocationSchema = z.object({
	firstName: z.string().min(1, 'First name is required'),
	lastName: z.string().min(1, 'Last name is required'),
	location: z.string().min(1, 'Location is required')
});

// About schema for freelancer
export const freelancerAboutSchema = z.object({
	about: z
		.string()
		.min(50, 'Please provide at least 50 characters about your skills and experience')
});

// About schema for client
export const clientAboutSchema = z.object({
	about: z.string().min(50, 'Please provide at least 50 characters about your project needs')
});

// Skills schema for freelancer
export const skillsSchema = z.object({
	skillCategories: z.array(z.string()).min(1, 'Please select at least one skill category'),
	skills: z.array(z.string()).min(1, 'Please select at least one skill'),
	customSkills: z.string().optional()
});

// Task categories schema for client
export const taskCategoriesSchema = z.object({
	taskCategories: z.array(z.string()).min(1, 'Please select at least one task category')
});
