/**
 * User-related GraphQL fragments
 * 
 * Reusable field selections for User types to ensure consistency
 * across queries and mutations.
 */

import { gql } from '@apollo/client/core';

/**
 * Basic User fields for minimal representation
 */
export const USER_BASIC_FIELDS = gql`
  fragment UserBasicFields on User {
    id
    name
    email
    userRole
    status
    profilePicture
  }
`;

/**
 * Profile User fields for user profile views
 */
export const USER_PROFILE_FIELDS = gql`
  fragment UserProfileFields on User {
    ...UserBasicFields
    onboardingComplete
    verificationLevel
    biddingAllowed
    lastLoginAt
    createdAt
    updatedAt
  }
`;

/**
 * Extended User fields for detailed views
 */
export const USER_EXTENDED_FIELDS = gql`
  fragment UserExtendedFields on User {
    ...UserProfileFields
    isEmailVerified
    mobileNumber
    dob
  }
`;
