export enum BudgetTypeEnum {
    FIXED = 'FIXED',
    HOURLY = 'HOURLY'
}

export enum TaskTypeEnum {
    IN_PERSON = 'IN_PERSON',
    REMOTE = 'REMOTE'
}

export interface Location {
    id: number;
    displayName: string;
    zipCode: string;
    latitude: number;
    longitude: number;
}

export interface DateRange {
    startDate: string;
    endDate: string;
}

export interface Skill {
    id: number;
    name: string;
    description: string;
}

export interface Category {
    id: number;
    name: string;
    description: string;
}

export interface TaskSkill {
    id: string;
    skillId: string;
    skill: Skill;
}

export interface TaskCategory {
    id: string;
    categoryId: string;
    category: Category;
}

export interface Task {
    id: string;
    title: string;
    description: string;
    budget: number;
    budgetType: BudgetTypeEnum;
    taskType: TaskTypeEnum;
    estimatedHours: number | null;
    deadlineDate?: string;
    isRemovals: boolean;
    pickupLocation?: Location;
    dropOffLocation?: Location;
    requiredSkills: TaskSkill[];
    categories: TaskCategory[];
    createdAt: string;
    updatedAt: string;
}
