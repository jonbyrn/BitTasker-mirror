/**
 * Task-related GraphQL fragments
 * 
 * Reusable field selections for Task types to ensure consistency
 * across queries and mutations.
 */

import { gql } from '@apollo/client/core';

/**
 * Basic Task fields that are commonly needed
 */
export const TASK_BASIC_FIELDS = gql`
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

/**
 * Location-related Task fields
 */
export const TASK_LOCATION_FIELDS = gql`
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

/**
 * Detailed Task fields including attachments and timing
 */
export const TASK_DETAIL_FIELDS = gql`
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
`;

/**
 * Full Task representation with all available fields
 */
export const TASK_FULL_FIELDS = gql`
  fragment TaskFullFields on Task {
    ...TaskDetailFields
    categoryIds
    deletedAt
  }
`;
