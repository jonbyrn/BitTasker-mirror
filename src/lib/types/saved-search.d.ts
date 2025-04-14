import type { SearchTasksParams } from './task';

export interface SavedSearch {
  id: string;
  name: string;
  userId: string;
  searchParams: SearchTasksParams;
  notifyOnMatch: boolean;
  isActive?: boolean;
  notificationFrequency: NotificationFrequency;
  createdAt: string;
  updatedAt: string;
  lastNotifiedAt: string | null;
  totalNotifications: number;
  unreadNotifications: number;
}

/**
 * Notification for a saved search
 */
export interface SavedSearchNotification {
  id: string;
  savedSearchId: string;
  taskId: string;
  isRead: boolean;
  createdAt: string;
  task: {
    id: string;
    title: string;
    budget: number;
    budgetType: string;
    taskType: string;
    deadlineDate: string | null;
  };
}

/**
 * Notification preferences for a saved search
 */
export interface NotificationPreferences {
  notifyOnMatch: boolean;
  frequency: NotificationFrequency;
  emailNotifications: boolean;
  pushNotifications: boolean;
  quietHours: {
    enabled: boolean;
    start: string; // HH:mm format
    end: string; // HH:mm format
  };
}
