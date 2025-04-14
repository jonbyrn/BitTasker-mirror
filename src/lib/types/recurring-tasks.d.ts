import type {
  RECURRINGFREQUENCYENUM,
  TIMINGTYPE,
  LOCATIONTYPE,
  TIMINGTIMEOFDAY,
  BUDGETTYPE,
  TASKSTATUS,
  TASKCATEGORY,
  TASKSKILL,
  BUDGETCURRENCY
} from '$lib/utils/enums/recurringTask.enums';
import type { CreateTaskParams, Task } from './task';

export interface RecurrencePattern {
  frequency: RECURRINGFREQUENCYENUM;
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
  currency: BUDGETCURRENCY;
  isPublic: boolean;

  // Metadata
  createdAt: string;
  createdBy: string;
  status: TASKSTATUS;
}

export interface CreateRecurringTaskParams {
  name: string;
  description: string;
  isRecurring: boolean;
  recurrencePattern: RecurrencePattern;
  task: CreateTaskParams;
}