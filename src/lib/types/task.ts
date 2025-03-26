export interface Location {
  displayName: string;
  longitude: number;
  latitude: number;
  zipCode: string;
  locationLoaded: boolean;
}

export interface DateRange {
  start: string;
  end: string;
}

export interface Task {
  title: string;
  description: string;
  budget: number;
  budgetType: 'FIXED' | 'HOURLY';
  taskType: 'REMOTE' | 'IN_PERSON';
  deadline: string;
  estimatedHours?: number;
  categoryIds: number[];
  skillIds: number[];
  pickupLocation?: Location;
  dropOffLocation?: Location;
  dateRange?: DateRange;
}

export type TaskStep = 'basics' | 'timing' | 'location' | 'details' | 'budget';
