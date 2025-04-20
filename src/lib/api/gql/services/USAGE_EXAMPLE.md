# GraphQL Services Usage Guide

This document illustrates how to migrate from the existing RESTful API services to GraphQL services in BitTasker.

## Task Management

### Before (REST API):

```typescript
import taskService from '$lib/api/services/task.service';

// Creating a task
const newTask = await taskService.createTask({
	title: 'New Task',
	description: 'Task description'
	// other fields...
});

// Getting all tasks
const tasks = await taskService.getAllTasks({
	page: 1,
	limit: 10
	// other search params...
});

// Getting task by ID
const task = await taskService.getTaskById('123');

// Updating a task
const updatedTask = await taskService.updateTask('123', {
	title: 'Updated Task'
	// other fields...
});

// Deleting a task
await taskService.deleteTask('123');

// Updating task status
const taskWithNewStatus = await taskService.updateTaskStatus('123', TaskStatusEnum.COMPLETED);
```

### After (GraphQL):

```typescript
import { taskGraphQLService } from '$lib/api/gql/services';

// Creating a task
const newTask = await taskGraphQLService.createTask({
	title: 'New Task',
	description: 'Task description'
	// other fields...
});

// Getting all tasks
const tasks = await taskGraphQLService.getAllTasks({
	page: 1,
	limit: 10
	// other search params...
});

// Getting task by ID
const task = await taskGraphQLService.getTaskById('123');

// Updating a task
const updatedTask = await taskGraphQLService.updateTask('123', {
	title: 'Updated Task'
	// other fields...
});

// Deleting a task
await taskGraphQLService.deleteTask('123');

// Updating task status
const taskWithNewStatus = await taskGraphQLService.updateTaskStatus(
	'123',
	TaskStatusEnum.COMPLETED
);
```

## Benefits of GraphQL

1. **Reduced Network Requests**: GraphQL allows fetching multiple resources in a single request
2. **No Over-fetching**: Only request the data you need
3. **Type Safety**: GraphQL schema provides strong typing
4. **Real-time Updates**: GraphQL subscriptions can provide real-time updates (to be implemented later)
5. **Consistent API Interface**: Same interface regardless of data source

## Migration Strategy

1. Create GraphQL service equivalents for each REST service
2. Update components to use GraphQL services one at a time
3. Run tests to ensure functionality is preserved
4. Remove REST services once all components are migrated

## Advanced GraphQL Features (Coming Soon)

- Optimistic UI updates
- Apollo cache management
- GraphQL subscriptions for real-time updates
