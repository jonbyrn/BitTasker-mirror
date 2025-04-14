/**
 * Task-related GraphQL operations
 * 
 * Defines queries and mutations for working with Tasks in BitTasker.
 */

import { gql } from '@apollo/client/core';
import { 
  TASK_BASIC_FIELDS, 
  TASK_DETAIL_FIELDS,
  TASK_FULL_FIELDS 
} from '../fragments/task';

/**
 * Get paginated list of tasks with filtering
 */
export const GET_TASKS = gql`
  query Tasks(
    $page: Int = 1
    $limit: Int = 10
    $searchTerm: String
    $categoryId: Int
    $skillId: Int
    $status: TaskStatus
    $taskType: TaskType
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
  ${TASK_BASIC_FIELDS}
`;

/**
 * Get a single task by ID
 */
export const GET_TASK = gql`
  query Task($id: Int!) {
    task(id: $id) {
      ...TaskFullFields
    }
  }
  ${TASK_FULL_FIELDS}
`;

/**
 * Get current user's tasks
 */
export const GET_MY_TASKS = gql`
  query MyTasks {
    myTasks {
      ...TaskDetailFields
    }
  }
  ${TASK_DETAIL_FIELDS}
`;

/**
 * Create a new task
 */
export const CREATE_TASK = gql`
  mutation CreateTask($input: CreateTaskInput!) {
    createTask(input: $input) {
      ...TaskDetailFields
    }
  }
  ${TASK_DETAIL_FIELDS}
`;

/**
 * Update an existing task
 */
export const UPDATE_TASK = gql`
  mutation UpdateTask($id: Int!, $input: UpdateTaskInput!) {
    updateTask(id: $id, input: $input) {
      ...TaskDetailFields
    }
  }
  ${TASK_DETAIL_FIELDS}
`;

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
