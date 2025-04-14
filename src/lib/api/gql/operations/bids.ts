/**
 * Bid-related GraphQL operations
 * 
 * Defines queries and mutations for working with Bids in BitTasker.
 */

import { gql } from '@apollo/client/core';
import { 
  BID_BASIC_FIELDS, 
  BID_DETAIL_FIELDS,
  BID_MILESTONE_FIELDS 
} from '../fragments/bid';

/**
 * Get all bids
 */
export const GET_BIDS = gql`
  query Bids {
    bids {
      ...BidBasicFields
    }
  }
  ${BID_BASIC_FIELDS}
`;

/**
 * Get a single bid by ID
 */
export const GET_BID = gql`
  query Bid($id: Int!) {
    bid(id: $id) {
      ...BidDetailFields
    }
  }
  ${BID_DETAIL_FIELDS}
`;

/**
 * Get bids for a specific task
 */
export const GET_BIDS_BY_TASK = gql`
  query BidsByTask($taskId: Int!) {
    bidsByTask(taskId: $taskId) {
      ...BidDetailFields
    }
  }
  ${BID_DETAIL_FIELDS}
`;

/**
 * Create a new bid
 */
export const CREATE_BID = gql`
  mutation CreateBid($input: CreateBidInput!) {
    createBid(input: $input) {
      bid {
        ...BidDetailFields
      }
      message
    }
  }
  ${BID_DETAIL_FIELDS}
`;

/**
 * Update an existing bid
 */
export const UPDATE_BID = gql`
  mutation UpdateBid($id: Int!, $input: UpdateBidInput!) {
    updateBid(id: $id, input: $input) {
      bid {
        ...BidDetailFields
      }
      message
    }
  }
  ${BID_DETAIL_FIELDS}
`;

/**
 * Accept a bid
 */
export const ACCEPT_BID = gql`
  mutation AcceptBid($id: Int!) {
    acceptBid(id: $id) {
      bid {
        ...BidBasicFields
      }
      message
    }
  }
  ${BID_BASIC_FIELDS}
`;

/**
 * Withdraw a bid
 */
export const WITHDRAW_BID = gql`
  mutation WithdrawBid($id: Int!, $reason: String) {
    withdrawBid(id: $id, reason: $reason)
  }
`;
