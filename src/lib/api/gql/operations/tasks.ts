/**
 * Task-related GraphQL operations
 * 
 * Defines queries and mutations for working with Tasks in BitTasker.
 */

import { gql } from '@apollo/client/core';
// Define fragments directly to ensure proper resolution

// Basic fields fragment
const TASK_BASIC_FIELDS = gql`
  fragment TaskBasicFields on Task {
    id
    title
    description
    status
    budget
    budgetType
    taskType
    visibility
    createdAt
    updatedAt
    clientId
  }
`;

// Location fields fragment
const TASK_LOCATION_FIELDS = gql`
  fragment TaskLocationFields on Task {
    isRemovals
    pickupLocation {
      displayName
      latitude
      longitude
      locationLoaded
      zipCode
    }
    dropOffLocation {
      displayName
      latitude
      longitude
      locationLoaded
      zipCode
    }
  }
`;

// Detail fields fragment (combines basic and location)
const TASK_DETAIL_FIELDS = gql`
  fragment TaskDetailFields on Task {
    ...TaskBasicFields
    ...TaskLocationFields
    dateRange {
      start
      end
    }
    deadlineDate
    estimatedHours
    freelancerId
    skillIds
    attachments {
      fileName
      fileUrl
      fileSize
    }
    imageUrls
  }
  ${TASK_BASIC_FIELDS}
  ${TASK_LOCATION_FIELDS}
`;

// Full fields fragment
const TASK_FULL_FIELDS = gql`
  fragment TaskFullFields on Task {
    ...TaskDetailFields
    categoryIds
    deletedAt
  }
  ${TASK_DETAIL_FIELDS}
`;

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
