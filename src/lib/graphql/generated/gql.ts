/* eslint-disable */
import * as types from './graphql';
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "\n  fragment BidMilestoneFields on BidMilestoneOutput {\n    title\n    description\n    amount\n    deliverables\n    dueDate\n    estimatedHours\n    sequence\n  }\n": typeof types.BidMilestoneFieldsFragmentDoc,
    "\n  fragment BidBasicFields on Bid {\n    id\n    amount\n    currency\n    status\n    paymentType\n    visibility\n    createdAt\n    updatedAt\n    taskId\n    freelancerId\n  }\n": typeof types.BidBasicFieldsFragmentDoc,
    "\n  fragment BidDetailFields on Bid {\n    ...BidBasicFields\n    description\n    coverLetter\n    estimatedDuration\n    estimatedHours\n    hourlyRate\n    proposedApproach\n    responseTime\n    milestones {\n      ...BidMilestoneFields\n    }\n  }\n": typeof types.BidDetailFieldsFragmentDoc,
    "\n  fragment TaskBasicFields on Task {\n    id\n    title\n    description\n    status\n    budget\n    budgetType\n    taskType\n    visibility\n    createdAt\n    updatedAt\n    clientId\n  }\n": typeof types.TaskBasicFieldsFragmentDoc,
    "\n  fragment TaskLocationFields on Task {\n    isRemovals\n    pickupLocation {\n      displayName\n      latitude\n      longitude\n      locationLoaded\n      zipCode\n    }\n    dropOffLocation {\n      displayName\n      latitude\n      longitude\n      locationLoaded\n      zipCode\n    }\n  }\n": typeof types.TaskLocationFieldsFragmentDoc,
    "\n  fragment TaskDetailFields on Task {\n    ...TaskBasicFields\n    ...TaskLocationFields\n    dateRange {\n      start\n      end\n    }\n    deadlineDate\n    estimatedHours\n    freelancerId\n    skillIds\n    attachments {\n      fileName\n      fileUrl\n      fileSize\n    }\n    imageUrls\n  }\n": typeof types.TaskDetailFieldsFragmentDoc,
    "\n  fragment TaskFullFields on Task {\n    ...TaskDetailFields\n    categoryIds\n    deletedAt\n  }\n": typeof types.TaskFullFieldsFragmentDoc,
    "\n  fragment UserBasicFields on User {\n    id\n    name\n    email\n    userRole\n    status\n    profilePicture\n  }\n": typeof types.UserBasicFieldsFragmentDoc,
    "\n  fragment UserProfileFields on User {\n    ...UserBasicFields\n    onboardingComplete\n    verificationLevel\n    biddingAllowed\n    lastLoginAt\n    createdAt\n    updatedAt\n  }\n": typeof types.UserProfileFieldsFragmentDoc,
    "\n  fragment UserExtendedFields on User {\n    ...UserProfileFields\n    isEmailVerified\n    mobileNumber\n    dob\n  }\n": typeof types.UserExtendedFieldsFragmentDoc,
    "\n  mutation Login($input: LoginInput!) {\n    login(input: $input) {\n      access_token\n      expires_in\n      token_type\n      user {\n        ...UserProfileFields\n      }\n    }\n  }\n  \n": typeof types.LoginDocument,
    "\n  mutation Register($input: RegisterInput!) {\n    register(input: $input) {\n      access_token\n      expires_in\n      token_type\n      user {\n        ...UserProfileFields\n      }\n    }\n  }\n  \n": typeof types.RegisterDocument,
    "\n  mutation ChangePassword($input: ChangePasswordInput!) {\n    changePassword(input: $input)\n  }\n": typeof types.ChangePasswordDocument,
    "\n  query Me {\n    me {\n      ...UserProfileFields\n    }\n  }\n  \n": typeof types.MeDocument,
    "\n  query VerifyToken($token: String!) {\n    verifyToken(token: $token) {\n      isValid\n      user {\n        ...UserProfileFields\n      }\n    }\n  }\n  \n": typeof types.VerifyTokenDocument,
    "\n  query Bids {\n    bids {\n      ...BidBasicFields\n    }\n  }\n  \n": typeof types.BidsDocument,
    "\n  query Bid($id: Int!) {\n    bid(id: $id) {\n      ...BidDetailFields\n    }\n  }\n  \n": typeof types.BidDocument,
    "\n  query BidsByTask($taskId: Int!) {\n    bidsByTask(taskId: $taskId) {\n      ...BidDetailFields\n    }\n  }\n  \n": typeof types.BidsByTaskDocument,
    "\n  mutation CreateBid($input: CreateBidInput!) {\n    createBid(input: $input) {\n      bid {\n        ...BidDetailFields\n      }\n      message\n    }\n  }\n  \n": typeof types.CreateBidDocument,
    "\n  mutation UpdateBid($id: Int!, $input: UpdateBidInput!) {\n    updateBid(id: $id, input: $input) {\n      bid {\n        ...BidDetailFields\n      }\n      message\n    }\n  }\n  \n": typeof types.UpdateBidDocument,
    "\n  mutation AcceptBid($id: Int!) {\n    acceptBid(id: $id) {\n      bid {\n        ...BidBasicFields\n      }\n      message\n    }\n  }\n  \n": typeof types.AcceptBidDocument,
    "\n  mutation WithdrawBid($id: Int!, $reason: String) {\n    withdrawBid(id: $id, reason: $reason)\n  }\n": typeof types.WithdrawBidDocument,
    "\n\tquery Tasks(\n\t\t$page: Float = 1\n\t\t$limit: Float = 10\n\t\t$searchTerm: String\n\t\t$categoryId: Float\n\t\t$skillId: Float\n\t\t$status: String\n\t\t$taskType: String\n\t\t$minBudget: Float\n\t\t$maxBudget: Float\n\t\t$includeDeleted: Boolean = false\n\t) {\n\t\ttasks(\n\t\t\tpage: $page\n\t\t\tlimit: $limit\n\t\t\tsearchTerm: $searchTerm\n\t\t\tcategoryId: $categoryId\n\t\t\tskillId: $skillId\n\t\t\tstatus: $status\n\t\t\ttaskType: $taskType\n\t\t\tminBudget: $minBudget\n\t\t\tmaxBudget: $maxBudget\n\t\t\tincludeDeleted: $includeDeleted\n\t\t) {\n\t\t\titems {\n\t\t\t\t...TaskBasicFields\n\t\t\t}\n\t\t\tmeta {\n\t\t\t\tcurrentPage\n\t\t\t\titemCount\n\t\t\t\titemsPerPage\n\t\t\t\ttotalItems\n\t\t\t\ttotalPages\n\t\t\t}\n\t\t}\n\t}\n": typeof types.TasksDocument,
    "\n\tquery Task($id: Int!) {\n\t\ttask(id: $id) {\n\t\t\t...TaskFullFields\n\t\t}\n\t}\n": typeof types.TaskDocument,
    "\n\tquery MyTasks {\n\t\tmyTasks {\n\t\t\t...TaskDetailFields\n\t\t}\n\t}\n": typeof types.MyTasksDocument,
    "\n\tmutation CreateTask($input: CreateTaskInput!) {\n\t\tcreateTask(input: $input) {\n\t\t\t...TaskDetailFields\n\t\t}\n\t}\n": typeof types.CreateTaskDocument,
    "\n\tmutation UpdateTask($id: Int!, $input: UpdateTaskInput!) {\n\t\tupdateTask(id: $id, input: $input) {\n\t\t\t...TaskDetailFields\n\t\t}\n\t}\n": typeof types.UpdateTaskDocument,
    "\n\tmutation ChangeTaskStatus($taskId: ID!, $status: TaskStatus!) {\n\t\tchangeTaskStatus(taskId: $taskId, status: $status) {\n\t\t\tid\n\t\t\tstatus\n\t\t}\n\t}\n": typeof types.ChangeTaskStatusDocument,
    "\n\tmutation DeleteTask($id: Int!) {\n\t\tdeleteTask(id: $id)\n\t}\n": typeof types.DeleteTaskDocument,
};
const documents: Documents = {
    "\n  fragment BidMilestoneFields on BidMilestoneOutput {\n    title\n    description\n    amount\n    deliverables\n    dueDate\n    estimatedHours\n    sequence\n  }\n": types.BidMilestoneFieldsFragmentDoc,
    "\n  fragment BidBasicFields on Bid {\n    id\n    amount\n    currency\n    status\n    paymentType\n    visibility\n    createdAt\n    updatedAt\n    taskId\n    freelancerId\n  }\n": types.BidBasicFieldsFragmentDoc,
    "\n  fragment BidDetailFields on Bid {\n    ...BidBasicFields\n    description\n    coverLetter\n    estimatedDuration\n    estimatedHours\n    hourlyRate\n    proposedApproach\n    responseTime\n    milestones {\n      ...BidMilestoneFields\n    }\n  }\n": types.BidDetailFieldsFragmentDoc,
    "\n  fragment TaskBasicFields on Task {\n    id\n    title\n    description\n    status\n    budget\n    budgetType\n    taskType\n    visibility\n    createdAt\n    updatedAt\n    clientId\n  }\n": types.TaskBasicFieldsFragmentDoc,
    "\n  fragment TaskLocationFields on Task {\n    isRemovals\n    pickupLocation {\n      displayName\n      latitude\n      longitude\n      locationLoaded\n      zipCode\n    }\n    dropOffLocation {\n      displayName\n      latitude\n      longitude\n      locationLoaded\n      zipCode\n    }\n  }\n": types.TaskLocationFieldsFragmentDoc,
    "\n  fragment TaskDetailFields on Task {\n    ...TaskBasicFields\n    ...TaskLocationFields\n    dateRange {\n      start\n      end\n    }\n    deadlineDate\n    estimatedHours\n    freelancerId\n    skillIds\n    attachments {\n      fileName\n      fileUrl\n      fileSize\n    }\n    imageUrls\n  }\n": types.TaskDetailFieldsFragmentDoc,
    "\n  fragment TaskFullFields on Task {\n    ...TaskDetailFields\n    categoryIds\n    deletedAt\n  }\n": types.TaskFullFieldsFragmentDoc,
    "\n  fragment UserBasicFields on User {\n    id\n    name\n    email\n    userRole\n    status\n    profilePicture\n  }\n": types.UserBasicFieldsFragmentDoc,
    "\n  fragment UserProfileFields on User {\n    ...UserBasicFields\n    onboardingComplete\n    verificationLevel\n    biddingAllowed\n    lastLoginAt\n    createdAt\n    updatedAt\n  }\n": types.UserProfileFieldsFragmentDoc,
    "\n  fragment UserExtendedFields on User {\n    ...UserProfileFields\n    isEmailVerified\n    mobileNumber\n    dob\n  }\n": types.UserExtendedFieldsFragmentDoc,
    "\n  mutation Login($input: LoginInput!) {\n    login(input: $input) {\n      access_token\n      expires_in\n      token_type\n      user {\n        ...UserProfileFields\n      }\n    }\n  }\n  \n": types.LoginDocument,
    "\n  mutation Register($input: RegisterInput!) {\n    register(input: $input) {\n      access_token\n      expires_in\n      token_type\n      user {\n        ...UserProfileFields\n      }\n    }\n  }\n  \n": types.RegisterDocument,
    "\n  mutation ChangePassword($input: ChangePasswordInput!) {\n    changePassword(input: $input)\n  }\n": types.ChangePasswordDocument,
    "\n  query Me {\n    me {\n      ...UserProfileFields\n    }\n  }\n  \n": types.MeDocument,
    "\n  query VerifyToken($token: String!) {\n    verifyToken(token: $token) {\n      isValid\n      user {\n        ...UserProfileFields\n      }\n    }\n  }\n  \n": types.VerifyTokenDocument,
    "\n  query Bids {\n    bids {\n      ...BidBasicFields\n    }\n  }\n  \n": types.BidsDocument,
    "\n  query Bid($id: Int!) {\n    bid(id: $id) {\n      ...BidDetailFields\n    }\n  }\n  \n": types.BidDocument,
    "\n  query BidsByTask($taskId: Int!) {\n    bidsByTask(taskId: $taskId) {\n      ...BidDetailFields\n    }\n  }\n  \n": types.BidsByTaskDocument,
    "\n  mutation CreateBid($input: CreateBidInput!) {\n    createBid(input: $input) {\n      bid {\n        ...BidDetailFields\n      }\n      message\n    }\n  }\n  \n": types.CreateBidDocument,
    "\n  mutation UpdateBid($id: Int!, $input: UpdateBidInput!) {\n    updateBid(id: $id, input: $input) {\n      bid {\n        ...BidDetailFields\n      }\n      message\n    }\n  }\n  \n": types.UpdateBidDocument,
    "\n  mutation AcceptBid($id: Int!) {\n    acceptBid(id: $id) {\n      bid {\n        ...BidBasicFields\n      }\n      message\n    }\n  }\n  \n": types.AcceptBidDocument,
    "\n  mutation WithdrawBid($id: Int!, $reason: String) {\n    withdrawBid(id: $id, reason: $reason)\n  }\n": types.WithdrawBidDocument,
    "\n\tquery Tasks(\n\t\t$page: Float = 1\n\t\t$limit: Float = 10\n\t\t$searchTerm: String\n\t\t$categoryId: Float\n\t\t$skillId: Float\n\t\t$status: String\n\t\t$taskType: String\n\t\t$minBudget: Float\n\t\t$maxBudget: Float\n\t\t$includeDeleted: Boolean = false\n\t) {\n\t\ttasks(\n\t\t\tpage: $page\n\t\t\tlimit: $limit\n\t\t\tsearchTerm: $searchTerm\n\t\t\tcategoryId: $categoryId\n\t\t\tskillId: $skillId\n\t\t\tstatus: $status\n\t\t\ttaskType: $taskType\n\t\t\tminBudget: $minBudget\n\t\t\tmaxBudget: $maxBudget\n\t\t\tincludeDeleted: $includeDeleted\n\t\t) {\n\t\t\titems {\n\t\t\t\t...TaskBasicFields\n\t\t\t}\n\t\t\tmeta {\n\t\t\t\tcurrentPage\n\t\t\t\titemCount\n\t\t\t\titemsPerPage\n\t\t\t\ttotalItems\n\t\t\t\ttotalPages\n\t\t\t}\n\t\t}\n\t}\n": types.TasksDocument,
    "\n\tquery Task($id: Int!) {\n\t\ttask(id: $id) {\n\t\t\t...TaskFullFields\n\t\t}\n\t}\n": types.TaskDocument,
    "\n\tquery MyTasks {\n\t\tmyTasks {\n\t\t\t...TaskDetailFields\n\t\t}\n\t}\n": types.MyTasksDocument,
    "\n\tmutation CreateTask($input: CreateTaskInput!) {\n\t\tcreateTask(input: $input) {\n\t\t\t...TaskDetailFields\n\t\t}\n\t}\n": types.CreateTaskDocument,
    "\n\tmutation UpdateTask($id: Int!, $input: UpdateTaskInput!) {\n\t\tupdateTask(id: $id, input: $input) {\n\t\t\t...TaskDetailFields\n\t\t}\n\t}\n": types.UpdateTaskDocument,
    "\n\tmutation ChangeTaskStatus($taskId: ID!, $status: TaskStatus!) {\n\t\tchangeTaskStatus(taskId: $taskId, status: $status) {\n\t\t\tid\n\t\t\tstatus\n\t\t}\n\t}\n": types.ChangeTaskStatusDocument,
    "\n\tmutation DeleteTask($id: Int!) {\n\t\tdeleteTask(id: $id)\n\t}\n": types.DeleteTaskDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = graphql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function graphql(source: string): unknown;

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment BidMilestoneFields on BidMilestoneOutput {\n    title\n    description\n    amount\n    deliverables\n    dueDate\n    estimatedHours\n    sequence\n  }\n"): (typeof documents)["\n  fragment BidMilestoneFields on BidMilestoneOutput {\n    title\n    description\n    amount\n    deliverables\n    dueDate\n    estimatedHours\n    sequence\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment BidBasicFields on Bid {\n    id\n    amount\n    currency\n    status\n    paymentType\n    visibility\n    createdAt\n    updatedAt\n    taskId\n    freelancerId\n  }\n"): (typeof documents)["\n  fragment BidBasicFields on Bid {\n    id\n    amount\n    currency\n    status\n    paymentType\n    visibility\n    createdAt\n    updatedAt\n    taskId\n    freelancerId\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment BidDetailFields on Bid {\n    ...BidBasicFields\n    description\n    coverLetter\n    estimatedDuration\n    estimatedHours\n    hourlyRate\n    proposedApproach\n    responseTime\n    milestones {\n      ...BidMilestoneFields\n    }\n  }\n"): (typeof documents)["\n  fragment BidDetailFields on Bid {\n    ...BidBasicFields\n    description\n    coverLetter\n    estimatedDuration\n    estimatedHours\n    hourlyRate\n    proposedApproach\n    responseTime\n    milestones {\n      ...BidMilestoneFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment TaskBasicFields on Task {\n    id\n    title\n    description\n    status\n    budget\n    budgetType\n    taskType\n    visibility\n    createdAt\n    updatedAt\n    clientId\n  }\n"): (typeof documents)["\n  fragment TaskBasicFields on Task {\n    id\n    title\n    description\n    status\n    budget\n    budgetType\n    taskType\n    visibility\n    createdAt\n    updatedAt\n    clientId\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment TaskLocationFields on Task {\n    isRemovals\n    pickupLocation {\n      displayName\n      latitude\n      longitude\n      locationLoaded\n      zipCode\n    }\n    dropOffLocation {\n      displayName\n      latitude\n      longitude\n      locationLoaded\n      zipCode\n    }\n  }\n"): (typeof documents)["\n  fragment TaskLocationFields on Task {\n    isRemovals\n    pickupLocation {\n      displayName\n      latitude\n      longitude\n      locationLoaded\n      zipCode\n    }\n    dropOffLocation {\n      displayName\n      latitude\n      longitude\n      locationLoaded\n      zipCode\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment TaskDetailFields on Task {\n    ...TaskBasicFields\n    ...TaskLocationFields\n    dateRange {\n      start\n      end\n    }\n    deadlineDate\n    estimatedHours\n    freelancerId\n    skillIds\n    attachments {\n      fileName\n      fileUrl\n      fileSize\n    }\n    imageUrls\n  }\n"): (typeof documents)["\n  fragment TaskDetailFields on Task {\n    ...TaskBasicFields\n    ...TaskLocationFields\n    dateRange {\n      start\n      end\n    }\n    deadlineDate\n    estimatedHours\n    freelancerId\n    skillIds\n    attachments {\n      fileName\n      fileUrl\n      fileSize\n    }\n    imageUrls\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment TaskFullFields on Task {\n    ...TaskDetailFields\n    categoryIds\n    deletedAt\n  }\n"): (typeof documents)["\n  fragment TaskFullFields on Task {\n    ...TaskDetailFields\n    categoryIds\n    deletedAt\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment UserBasicFields on User {\n    id\n    name\n    email\n    userRole\n    status\n    profilePicture\n  }\n"): (typeof documents)["\n  fragment UserBasicFields on User {\n    id\n    name\n    email\n    userRole\n    status\n    profilePicture\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment UserProfileFields on User {\n    ...UserBasicFields\n    onboardingComplete\n    verificationLevel\n    biddingAllowed\n    lastLoginAt\n    createdAt\n    updatedAt\n  }\n"): (typeof documents)["\n  fragment UserProfileFields on User {\n    ...UserBasicFields\n    onboardingComplete\n    verificationLevel\n    biddingAllowed\n    lastLoginAt\n    createdAt\n    updatedAt\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment UserExtendedFields on User {\n    ...UserProfileFields\n    isEmailVerified\n    mobileNumber\n    dob\n  }\n"): (typeof documents)["\n  fragment UserExtendedFields on User {\n    ...UserProfileFields\n    isEmailVerified\n    mobileNumber\n    dob\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation Login($input: LoginInput!) {\n    login(input: $input) {\n      access_token\n      expires_in\n      token_type\n      user {\n        ...UserProfileFields\n      }\n    }\n  }\n  \n"): (typeof documents)["\n  mutation Login($input: LoginInput!) {\n    login(input: $input) {\n      access_token\n      expires_in\n      token_type\n      user {\n        ...UserProfileFields\n      }\n    }\n  }\n  \n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation Register($input: RegisterInput!) {\n    register(input: $input) {\n      access_token\n      expires_in\n      token_type\n      user {\n        ...UserProfileFields\n      }\n    }\n  }\n  \n"): (typeof documents)["\n  mutation Register($input: RegisterInput!) {\n    register(input: $input) {\n      access_token\n      expires_in\n      token_type\n      user {\n        ...UserProfileFields\n      }\n    }\n  }\n  \n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation ChangePassword($input: ChangePasswordInput!) {\n    changePassword(input: $input)\n  }\n"): (typeof documents)["\n  mutation ChangePassword($input: ChangePasswordInput!) {\n    changePassword(input: $input)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Me {\n    me {\n      ...UserProfileFields\n    }\n  }\n  \n"): (typeof documents)["\n  query Me {\n    me {\n      ...UserProfileFields\n    }\n  }\n  \n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query VerifyToken($token: String!) {\n    verifyToken(token: $token) {\n      isValid\n      user {\n        ...UserProfileFields\n      }\n    }\n  }\n  \n"): (typeof documents)["\n  query VerifyToken($token: String!) {\n    verifyToken(token: $token) {\n      isValid\n      user {\n        ...UserProfileFields\n      }\n    }\n  }\n  \n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Bids {\n    bids {\n      ...BidBasicFields\n    }\n  }\n  \n"): (typeof documents)["\n  query Bids {\n    bids {\n      ...BidBasicFields\n    }\n  }\n  \n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Bid($id: Int!) {\n    bid(id: $id) {\n      ...BidDetailFields\n    }\n  }\n  \n"): (typeof documents)["\n  query Bid($id: Int!) {\n    bid(id: $id) {\n      ...BidDetailFields\n    }\n  }\n  \n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query BidsByTask($taskId: Int!) {\n    bidsByTask(taskId: $taskId) {\n      ...BidDetailFields\n    }\n  }\n  \n"): (typeof documents)["\n  query BidsByTask($taskId: Int!) {\n    bidsByTask(taskId: $taskId) {\n      ...BidDetailFields\n    }\n  }\n  \n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreateBid($input: CreateBidInput!) {\n    createBid(input: $input) {\n      bid {\n        ...BidDetailFields\n      }\n      message\n    }\n  }\n  \n"): (typeof documents)["\n  mutation CreateBid($input: CreateBidInput!) {\n    createBid(input: $input) {\n      bid {\n        ...BidDetailFields\n      }\n      message\n    }\n  }\n  \n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateBid($id: Int!, $input: UpdateBidInput!) {\n    updateBid(id: $id, input: $input) {\n      bid {\n        ...BidDetailFields\n      }\n      message\n    }\n  }\n  \n"): (typeof documents)["\n  mutation UpdateBid($id: Int!, $input: UpdateBidInput!) {\n    updateBid(id: $id, input: $input) {\n      bid {\n        ...BidDetailFields\n      }\n      message\n    }\n  }\n  \n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation AcceptBid($id: Int!) {\n    acceptBid(id: $id) {\n      bid {\n        ...BidBasicFields\n      }\n      message\n    }\n  }\n  \n"): (typeof documents)["\n  mutation AcceptBid($id: Int!) {\n    acceptBid(id: $id) {\n      bid {\n        ...BidBasicFields\n      }\n      message\n    }\n  }\n  \n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation WithdrawBid($id: Int!, $reason: String) {\n    withdrawBid(id: $id, reason: $reason)\n  }\n"): (typeof documents)["\n  mutation WithdrawBid($id: Int!, $reason: String) {\n    withdrawBid(id: $id, reason: $reason)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tquery Tasks(\n\t\t$page: Float = 1\n\t\t$limit: Float = 10\n\t\t$searchTerm: String\n\t\t$categoryId: Float\n\t\t$skillId: Float\n\t\t$status: String\n\t\t$taskType: String\n\t\t$minBudget: Float\n\t\t$maxBudget: Float\n\t\t$includeDeleted: Boolean = false\n\t) {\n\t\ttasks(\n\t\t\tpage: $page\n\t\t\tlimit: $limit\n\t\t\tsearchTerm: $searchTerm\n\t\t\tcategoryId: $categoryId\n\t\t\tskillId: $skillId\n\t\t\tstatus: $status\n\t\t\ttaskType: $taskType\n\t\t\tminBudget: $minBudget\n\t\t\tmaxBudget: $maxBudget\n\t\t\tincludeDeleted: $includeDeleted\n\t\t) {\n\t\t\titems {\n\t\t\t\t...TaskBasicFields\n\t\t\t}\n\t\t\tmeta {\n\t\t\t\tcurrentPage\n\t\t\t\titemCount\n\t\t\t\titemsPerPage\n\t\t\t\ttotalItems\n\t\t\t\ttotalPages\n\t\t\t}\n\t\t}\n\t}\n"): (typeof documents)["\n\tquery Tasks(\n\t\t$page: Float = 1\n\t\t$limit: Float = 10\n\t\t$searchTerm: String\n\t\t$categoryId: Float\n\t\t$skillId: Float\n\t\t$status: String\n\t\t$taskType: String\n\t\t$minBudget: Float\n\t\t$maxBudget: Float\n\t\t$includeDeleted: Boolean = false\n\t) {\n\t\ttasks(\n\t\t\tpage: $page\n\t\t\tlimit: $limit\n\t\t\tsearchTerm: $searchTerm\n\t\t\tcategoryId: $categoryId\n\t\t\tskillId: $skillId\n\t\t\tstatus: $status\n\t\t\ttaskType: $taskType\n\t\t\tminBudget: $minBudget\n\t\t\tmaxBudget: $maxBudget\n\t\t\tincludeDeleted: $includeDeleted\n\t\t) {\n\t\t\titems {\n\t\t\t\t...TaskBasicFields\n\t\t\t}\n\t\t\tmeta {\n\t\t\t\tcurrentPage\n\t\t\t\titemCount\n\t\t\t\titemsPerPage\n\t\t\t\ttotalItems\n\t\t\t\ttotalPages\n\t\t\t}\n\t\t}\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tquery Task($id: Int!) {\n\t\ttask(id: $id) {\n\t\t\t...TaskFullFields\n\t\t}\n\t}\n"): (typeof documents)["\n\tquery Task($id: Int!) {\n\t\ttask(id: $id) {\n\t\t\t...TaskFullFields\n\t\t}\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tquery MyTasks {\n\t\tmyTasks {\n\t\t\t...TaskDetailFields\n\t\t}\n\t}\n"): (typeof documents)["\n\tquery MyTasks {\n\t\tmyTasks {\n\t\t\t...TaskDetailFields\n\t\t}\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tmutation CreateTask($input: CreateTaskInput!) {\n\t\tcreateTask(input: $input) {\n\t\t\t...TaskDetailFields\n\t\t}\n\t}\n"): (typeof documents)["\n\tmutation CreateTask($input: CreateTaskInput!) {\n\t\tcreateTask(input: $input) {\n\t\t\t...TaskDetailFields\n\t\t}\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tmutation UpdateTask($id: Int!, $input: UpdateTaskInput!) {\n\t\tupdateTask(id: $id, input: $input) {\n\t\t\t...TaskDetailFields\n\t\t}\n\t}\n"): (typeof documents)["\n\tmutation UpdateTask($id: Int!, $input: UpdateTaskInput!) {\n\t\tupdateTask(id: $id, input: $input) {\n\t\t\t...TaskDetailFields\n\t\t}\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tmutation ChangeTaskStatus($taskId: ID!, $status: TaskStatus!) {\n\t\tchangeTaskStatus(taskId: $taskId, status: $status) {\n\t\t\tid\n\t\t\tstatus\n\t\t}\n\t}\n"): (typeof documents)["\n\tmutation ChangeTaskStatus($taskId: ID!, $status: TaskStatus!) {\n\t\tchangeTaskStatus(taskId: $taskId, status: $status) {\n\t\t\tid\n\t\t\tstatus\n\t\t}\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tmutation DeleteTask($id: Int!) {\n\t\tdeleteTask(id: $id)\n\t}\n"): (typeof documents)["\n\tmutation DeleteTask($id: Int!) {\n\t\tdeleteTask(id: $id)\n\t}\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;