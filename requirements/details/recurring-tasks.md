# BitTasker Recurring Tasks Implementation Plan

## Overview

This document outlines the implementation plan for adding recurring tasks functionality to BitTasker. Recurring tasks will allow users to create task templates that can automatically generate new tasks based on predefined schedules, streamlining the process for regular service needs.

## Business Requirements

- Allow users to create task templates from existing tasks or from scratch
- Support multiple scheduling options (daily, weekly, monthly, etc.)
- Enable users to create service packages by bundling multiple tasks
- Support customization of recurring task parameters
- Automatic task generation based on the defined schedule
- Allow viewing, editing, and cancellation of recurring task templates

## Technical Implementation

### 1. Data Models

#### Task Template Model

```typescript
// list of enums to to support types - file src/lib/utils/recurringTask.enums.ts
// enum RECURRINGFREQUENCYENUM: 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'CUSTOM'
// enum TIMINGTYPE: 'ON_DATE' | 'BEFORE_DATE' | 'FLEXIBLE'
// enum LOCATIONTYPE: 'IN_PERSON' | 'ONLINE'
// enum TIMINGTIMEOFDAY: 'morning' | 'midday' | 'afternoon' | 'evening'
// enum BUDGETTYPE: 'FIXED' | 'HOURLY'
// enum TASKSTATUS: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED'
// enum TASKTYPE: 'REMOTE' | 'IN_PERSON'
// enum TASKCATEGORY: 'REMOVALS' | 'DELIVERY'
// enum TASKSKILL: 'REMOVALS' | 'DELIVERY'
// enum BUDGETCURRENCY: 'BTC' | 'L-BTC' | 'USDt' | 'LN'
```

```typescript
import { RECURRINGFREQUENCYENUM } from '$lib/utils/recurringTask.enums';

interface TaskTemplate {
	id: number;
	title: string;
	description: string;

	// Schedule configuration
	recurrencePattern: {
		frequency: RECURRINGFREQUENCYENUM;
		interval: number; // e.g., every 2 weeks
		daysOfWeek?: number[]; // 0-6 for Sunday-Saturday
		dayOfMonth?: number; // 1-31
		endDate?: string; // ISO date or null for indefinite
		maxOccurrences?: number; // limit number of tasks to generate
	};

	// Task details (similar to regular task)
	timing: {
		type: TIMINGTYPE;
		timeOfDay?: TIMINGTIMEOFDAY;
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
```

#### Service Package Model

```typescript
interface ServicePackage {
	id: number;
	name: string;
	description: string;
	taskTemplates: number[]; // IDs of task templates in the package

	// Package details
	bundleDiscount: number; // Percentage discount
	totalPrice: number;
	currency: BUDGETCURRENCY;

	// Metadata
	createdAt: string;
	createdBy: string;
	status: TASKSTATUS;
}
```

### 2. API Integration

Add the following endpoints to the `src/lib/api/endpoints.ts` file:

```typescript
const taskTemplates = 'task-templates';
const servicePackages = 'service-packages';

export const ENDPOINTS = {
	TASK_TEMPLATES: {
		POST: `${API_PATH}/${API_VERSION}/${taskTemplates}`,
		GET: `${API_PATH}/${API_VERSION}/${taskTemplates}`,
		GET_BY_ID: (id: string) => `${API_PATH}/${API_VERSION}/${taskTemplates}/${id}`,
		UPDATE: (id: string) => `${API_PATH}/${API_VERSION}/${taskTemplates}/${id}`,
		DELETE: (id: string) => `${API_PATH}/${API_VERSION}/${taskTemplates}/${id}`
	},

	SERVICE_PACKAGES: {
		POST: `${API_PATH}/${API_VERSION}/${servicePackages}`,
		GET: `${API_PATH}/${API_VERSION}/${servicePackages}`, // get all user
		GET_PUBLIC: `${API_PATH}/${API_VERSION}/${servicePackages}/public`, // get all public packages
		GET_BY_ID: (id: string) => `${API_PATH}/${API_VERSION}/${servicePackages}/${id}`, // get services package by id
		UPDATE: (id: string) => `${API_PATH}/${API_VERSION}/${servicePackages}/${id}`,
		DELETE: (id: string) => `${API_PATH}/${API_VERSION}/${servicePackages}/${id}`,
		PURCHASE_PACKAGE: (id: string) => `${API_PATH}/${API_VERSION}/${servicePackages}/${id}/purchase`
	}
};
```

Create a new service file `recurring-tasks.service.ts` in the `src/lib/api/services` directory to handle API requests:

```typescript
// src/lib/api/services/recurring-tasks.service.ts
import { api } from '../api-client';
import type { TaskTemplate, ServicePackage } from '$lib/types/recurring-tasks';

class RecurringTasksService {
	// Template CRUD operations
	async getTemplates(): Promise<TaskTemplate[]> {
		return api.get(ENDPOINTS.TASK_TEMPLATES.GET);
	}

	async getTemplateById(id: number): Promise<TaskTemplate> {
		return api.get(`${ENDPOINTS.TASK_TEMPLATES.GET_BY_ID(id)}`);
	}

	async createTemplate(template: Omit<TaskTemplate, 'id' | 'createdAt'>): Promise<TaskTemplate> {
		return api.post(ENDPOINTS.TASK_TEMPLATES.POST, template);
	}

	async updateTemplate(id: number, template: Partial<TaskTemplate>): Promise<TaskTemplate> {
		return api.put(`${ENDPOINTS.TASK_TEMPLATES.UPDATE(id)}`, template);
	}

	async deleteTemplate(id: number): Promise<void> {
		return api.delete(`${ENDPOINTS.TASK_TEMPLATES.DELETE(id)}`);
	}
}

export default new RecurringTasksService();
```

```typescript
// src/lib/api/services/service-package.service.ts
import { api } from '../api-client';
import type { ServicePackage } from '$lib/types/recurring-tasks';

class ServicePackageService {
	// Service Package operations
	async getPackages(): Promise<ServicePackage[]> {
		return api.get(ENDPOINTS.SERVICE_PACKAGES.GET);
	}

	async createPackage(package: Omit<ServicePackage, 'id' | 'createdAt'>): Promise<ServicePackage> {
		return api.post(ENDPOINTS.SERVICE_PACKAGES.POST, package);
	}

	async updatePackage(id: number, package: Partial<ServicePackage>): Promise<ServicePackage> {
		return api.put(`${ENDPOINTS.SERVICE_PACKAGES.UPDATE(id)}`, package);
	}

	async deletePackage(id: number): Promise<void> {
		return api.delete(`${ENDPOINTS.SERVICE_PACKAGES.DELETE(id)}`);
	}

	async purchasePackage(id: number): Promise<void> {
		return api.post(`${ENDPOINTS.SERVICE_PACKAGES.PURCHASE_PACKAGE(id)}`);
	}

	async getPublicPackages(): Promise<ServicePackage[]> {
		return api.get(ENDPOINTS.SERVICE_PACKAGES.GET_PUBLIC);
	}

	async getPackageById(id: number): Promise<ServicePackage> {
		return api.get(`${ENDPOINTS.SERVICE_PACKAGES.GET_BY_ID(id)}`);
	}
}

export default new RecurringTasksService();
```

### 3. UI Components

#### Dashboard Integration

Add a new "Recurring Tasks" tab to the dashboard page (`src/routes/(protected)/dashboard/+page.svelte`):

```svelte
<!-- Existing tabs -->
<button
	class="tab {activeTab === 'tasks' ? 'tab-active' : ''}"
	onclick={() => (activeTab = 'tasks')}
	role="tab"
	aria-selected={activeTab === 'tasks'}
	aria-controls="panel-tasks"
	id="tab-tasks"
>
	My Tasks
</button>
<button
	class="tab {activeTab === 'bids' ? 'tab-active' : ''}"
	onclick={() => (activeTab = 'bids')}
	role="tab"
	aria-selected={activeTab === 'bids'}
	aria-controls="panel-bids"
	id="tab-bids"
>
	My Bids
</button>
<!-- New tab -->
<button
	class="tab {activeTab === 'recurring' ? 'tab-active' : ''}"
	onclick={() => (activeTab = 'recurring')}
	role="tab"
	aria-selected={activeTab === 'recurring'}
	aria-controls="panel-recurring"
	id="tab-recurring"
>
	Recurring Tasks
</button>
```

Add the corresponding panel:

```svelte
{:else if activeTab === 'recurring'}
  <!-- Recurring Tasks Panel -->
  <div
    id="panel-recurring"
    role="tabpanel"
    aria-labelledby="tab-recurring"
    class="card bg-base-100 shadow-xl"
    transition:slide={{ duration: 300 }}
  >
    <div class="card-body">
      <RecurringTasksPanel />
    </div>
  </div>
{/if}
```

#### New Components

1. **RecurringTasksPanel.svelte** - Main panel for the dashboard tab
2. **TaskTemplateCard.svelte** - Card to display a task template
3. **TaskTemplateDrawer.svelte** - Drawer to view/edit template details
4. **CreateTemplateForm.svelte** - Form to create new templates
5. **RecurrencePatternSelector.svelte** - Component for schedule configuration
6. **ServicePackageCard.svelte** - Card to display service packages

### 4. Component Stories

Create stories for each component in the `src/stories` directory:

```typescript
// src/stories/RecurringTasksPanel.stories.ts
import RecurringTasksPanel from '../lib/components/task/RecurringTasksPanel.svelte';

export default {
	title: 'Task/RecurringTasksPanel',
	component: RecurringTasksPanel
};

export const Default = {
	args: {
		// sample data
	}
};

export const Loading = {
	args: {
		loading: true
	}
};

export const Empty = {
	args: {
		templates: []
	}
};
```

Similarly, create stories for all the other components.

### 5. Implementation Plan

1. **Phase 1: Basic Structure**

   - Create data models and types
   - Implement API service
   - Add dashboard tab integration
   - Create basic components

2. **Phase 2: Template Management**

   - Implement template creation flow
   - Develop template editing functionality
   - Build template listing view

3. **Phase 3: Scheduling Logic**

   - Implement recurrence pattern configuration
   - Build schedule preview component
   - Integrate with task generation API

4. **Phase 4: Service Packages**

   - Develop service package creation
   - Implement package management
   - Add package discount calculations

5. **Phase 5: Polish & Integration**
   - Add complete error handling
   - Implement loading states
   - Connect with existing task management
   - Add unit and integration tests

## System Limitations

1. **Schedule Precision**:

   - The system will not support minute/hour-level scheduling
   - Tasks will be scheduled with day-level granularity
   - Time of day preferences are limited to morning/midday/afternoon/evening

2. **Recurrence Complexity**:

   - No support for complex recurrence patterns like "last Thursday of the month"
   - Limited to simple daily, weekly, biweekly, and monthly patterns
   - Custom patterns are restricted to specific days of week or month

3. **Task Modification Propagation**:

   - Changes to a template will only affect future task instances
   - Existing generated tasks will not be automatically updated
   - No bulk modification of already generated task instances

4. **Generation Timing**:

   - Tasks will be generated by a background process that runs daily
   - Tasks may be generated up to 24 hours in advance of their scheduled date
   - No guarantee of exact generation time within the day

5. **Offline Limitations**:

   - Task generation requires server connectivity
   - Schedule calculations happen server-side
   - Offline viewing of templates is supported, but not creation or modification

6. **Payment Handling**:

   - No automatic recurring payments
   - Each generated task requires separate payment processing
   - No subscription-based billing model

7. **Transaction Volume**:

   - Limited to 50 active recurring templates per user
   - Maximum of 25 templates in a single service package
   - Generation limited to max 365 instances per template

8. **Mobile Platform Considerations**:
   - Template creation optimized for larger screens
   - Mobile view will have simplified schedule configuration
   - Some advanced features may be limited on smaller screens

## Future Enhancements

1. **Advanced Scheduling**:

   - Support for more complex recurrence patterns
   - Time-zone aware scheduling
   - Calendar integration

2. **Smart Templates**:

   - AI-assisted template creation
   - Dynamic pricing based on market conditions
   - Automatic skill matching

3. **Enhanced Packages**:

   - Tiered service packages
   - Subscription-based payment model
   - Package sharing between users

4. **Integration Expansions**:
   - Calendar synchronization
   - External scheduling tools integration
   - Notification preferences
