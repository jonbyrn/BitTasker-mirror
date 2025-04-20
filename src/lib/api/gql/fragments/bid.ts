/**
 * Bid-related GraphQL fragments
 * 
 * Reusable field selections for Bid types to ensure consistency
 * across queries and mutations.
 */

import { gql } from '@apollo/client/core';

/**
 * Bid milestone fields
 */
export const BID_MILESTONE_FIELDS = gql`
  fragment BidMilestoneFields on BidMilestoneOutput {
    title
    description
    amount
    deliverables
    dueDate
    estimatedHours
    sequence
  }
`;

/**
 * Basic Bid fields for list views
 */
export const BID_BASIC_FIELDS = gql`
  fragment BidBasicFields on Bid {
    id
    amount
    currency
    status
    paymentType
    visibility
    createdAt
    updatedAt
    taskId
    freelancerId
  }
`;

/**
 * Detailed Bid fields including all information
 */
export const BID_DETAIL_FIELDS = gql`
  fragment BidDetailFields on Bid {
    ...BidBasicFields
    description
    coverLetter
    estimatedDuration
    estimatedHours
    hourlyRate
    proposedApproach
    responseTime
    milestones {
      ...BidMilestoneFields
    }
  }
`;
