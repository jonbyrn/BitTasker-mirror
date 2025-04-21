/**
 * Task-related GraphQL operations
 *
 * Defines queries and mutations for working with Tasks in BitTasker.
 */

import { gql } from '@apollo/client/core';
import { withFragments } from '../hooks/fragments';
import {
	TASK_BASIC_FIELDS,
	TASK_DETAIL_FIELDS,
	TASK_FULL_FIELDS,
	TASK_LOCATION_FIELDS
} from '../fragments/task';

/**
 * Get paginated list of tasks with filtering
 */
const GET_TASKS_QUERY = gql`
	query Tasks(
		$page: Float = 1
		$limit: Float = 10
		$searchTerm: String
		$categoryId: Float
		$skillId: Float
		$status: String
		$taskType: String
		$minBudget: Float
		$maxBudget: Float
		$includeDeleted: Boolean = false
	) {
		tasks(
			page: $page
			limit: $limit
			searchTerm: $searchTerm
			categoryId: $categoryId
			skillId: $skillId
			status: $status
			taskType: $taskType
			minBudget: $minBudget
			maxBudget: $maxBudget
			includeDeleted: $includeDeleted
		) {
			items {
				...TaskBasicFields
			}
			meta {
				currentPage
				itemCount
				itemsPerPage
				totalItems
				totalPages
			}
		}
	}
`;

// Export the query with attached fragments
export const GET_TASKS = withFragments(GET_TASKS_QUERY, TASK_BASIC_FIELDS);

/**
 * Get a single task by ID
 */
const GET_TASK_QUERY = gql`
	query Task($id: Int!) {
		task(id: $id) {
			...TaskFullFields
		}
	}
`;

// Export the query with attached fragments - Full fields depends on detail fields, location fields and basic fields
export const GET_TASK = withFragments(
	GET_TASK_QUERY,
	TASK_FULL_FIELDS,
	TASK_DETAIL_FIELDS,
	TASK_BASIC_FIELDS,
	TASK_LOCATION_FIELDS
);

/**
 * Get current user's tasks
 */
const GET_MY_TASKS_QUERY = gql`
	query MyTasks {
		myTasks {
			...TaskDetailFields
		}
	}
`;

// Export the query with attached fragments - Detail fields depends on basic fields and location fields
export const GET_MY_TASKS = withFragments(
	GET_MY_TASKS_QUERY,
	TASK_DETAIL_FIELDS,
	TASK_BASIC_FIELDS,
	TASK_LOCATION_FIELDS
);

/**
 * Create a new task
 */
const CREATE_TASK_MUTATION = gql`
	mutation CreateTask($input: CreateTaskInput!) {
		createTask(input: $input) {
			...TaskDetailFields
		}
	}
`;

// Export the mutation with attached fragments - Detail fields depends on basic fields and location fields
export const CREATE_TASK = withFragments(
	CREATE_TASK_MUTATION,
	TASK_DETAIL_FIELDS,
	TASK_BASIC_FIELDS,
	TASK_LOCATION_FIELDS
);

/**
 * Update an existing task
 */
const UPDATE_TASK_MUTATION = gql`
	mutation UpdateTask($id: Int!, $input: UpdateTaskInput!) {
		updateTask(id: $id, input: $input) {
			...TaskDetailFields
		}
	}
`;

// Export the mutation with attached fragments - Detail fields depends on basic fields and location fields
export const UPDATE_TASK = withFragments(
	UPDATE_TASK_MUTATION,
	TASK_DETAIL_FIELDS,
	TASK_BASIC_FIELDS,
	TASK_LOCATION_FIELDS
);

/**
 * Change task status
 */
export const CHANGE_TASK_STATUS = gql`
	mutation ChangeTaskStatus($taskId: ID!, $status: TaskStatus!) {
		changeTaskStatus(taskId: $taskId, status: $status) {
			id
			status
		}
	}
`;

/**
 * Delete a task
 */
export const DELETE_TASK = gql`
	mutation DeleteTask($id: Int!) {
		deleteTask(id: $id)
	}
`;
