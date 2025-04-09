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
  title: string;
  description: string;
  
  // Schedule configuration
  recurrencePattern: RecurrencePattern;

  // Task details (similar to regular task)
  timing: {
    type: TIMINGTYPE;
    timeOfDay?: TIMINGTIMEOFDAY;
    dueDate?: string | null;
  };
  
  location: {
    type: LOCATIONTYPE;
    isRemovalsTask: boolean;
    pickup?: {
      zipCode: string | null;
    };
    dropoff?: {
      zipCode: string | null;
    };
  };

  details: {
    summary: string;
    category: TASKCATEGORY;
    requiredSkills: TASKSKILL[];
    attachments: {
      images: string[];
    };
  };

  budget: {
    amount: number;
    currency: BUDGETCURRENCY;
    type: BUDGETTYPE;
    estimatedHours?: number;
  };

  // Metadata
  createdAt: string;
  createdBy: string;
  lastGeneratedDate?: string;
  nextGenerationDate?: string;
  status: TASKSTATUS;
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
