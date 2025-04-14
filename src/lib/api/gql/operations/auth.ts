/**
 * Authentication-related GraphQL operations
 * 
 * Defines mutations and queries for authentication in BitTasker.
 */

import { gql } from '@apollo/client/core';
import { USER_PROFILE_FIELDS } from '../fragments/user';

/**
 * Login mutation - authenticate a user with credentials
 */
export const LOGIN = gql`
  mutation Login($input: LoginInput!) {
    login(input: $input) {
      access_token
      expires_in
      token_type
      user {
        ...UserProfileFields
      }
    }
  }
  ${USER_PROFILE_FIELDS}
`;

/**
 * Register mutation - create a new user account
 */
export const REGISTER = gql`
  mutation Register($input: RegisterInput!) {
    register(input: $input) {
      access_token
      expires_in
      token_type
      user {
        ...UserProfileFields
      }
    }
  }
  ${USER_PROFILE_FIELDS}
`;

/**
 * Change password mutation
 */
export const CHANGE_PASSWORD = gql`
  mutation ChangePassword($input: ChangePasswordInput!) {
    changePassword(input: $input)
  }
`;

/**
 * Current user query - get the authenticated user's profile
 */
export const CURRENT_USER = gql`
  query Me {
    me {
      ...UserProfileFields
    }
  }
  ${USER_PROFILE_FIELDS}
`;

/**
 * Verify JWT token query
 */
export const VERIFY_TOKEN = gql`
  query VerifyToken($token: String!) {
    verifyToken(token: $token) {
      isValid
      user {
        ...UserProfileFields
      }
    }
  }
  ${USER_PROFILE_FIELDS}
`;
