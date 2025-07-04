import type { RecurringFrequencyEnum, TaskStatusEnum } from '$lib/utils/enums/task.enum';
import type { BudgetCurrencyEnum } from '$lib/utils/enums/task.enum';
import type { TaskBody, Task } from './task';

export interface RecurrencePattern {
	frequency: RecurringFrequencyEnum;
	interval: number; // e.g., every 2 weeks
	daysOfWeek?: number[]; // 0-6 for Sunday-Saturday
	dayOfMonth?: number; // 1-31
	endDate?: string; // ISO date or null for indefinite
	maxOccurrences?: number; // limit number of tasks to generate
}

export interface TaskTemplate {
	id: string;
	name: string;
	description: string;
	recurrencePattern: RecurrencePattern;
	task: Task;
	createdAt: string;
	createdBy: string;
}

export interface ServicePackage {
	id: string;
	name: string;
	description: string;
	taskTemplates: string[]; // IDs of task templates in the package

	// Package details
	bundleDiscount: number; // Percentage discount
	totalPrice: number;
	currency: BudgetCurrencyEnum;
	isPublic: boolean;

	// Metadata
	createdAt: string;
	createdBy: string;
	status: TaskStatusEnum;
}

export interface CreateRecurringTaskParams {
	name: string;
	description: string;
	isRecurring: boolean;
	recurrencePattern: RecurrencePattern;
	task: TaskBody;
}
