/* eslint-disable */
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  /** A date-time string at UTC, such as 2019-12-03T09:54:33Z, compliant with the date-time format. */
  DateTime: { input: any; output: any; }
};

export type AttachmentInput = {
  fileName: Scalars['String']['input'];
  fileSize?: InputMaybe<Scalars['Float']['input']>;
  fileUrl: Scalars['String']['input'];
};

export type AttachmentOutput = {
  __typename?: 'AttachmentOutput';
  fileName: Scalars['String']['output'];
  fileSize?: Maybe<Scalars['Float']['output']>;
  fileUrl: Scalars['String']['output'];
};

export type Auth = {
  __typename?: 'Auth';
  access_token: Scalars['String']['output'];
  expires_in: Scalars['Int']['output'];
  token_type: Scalars['String']['output'];
  user: User;
};

export type Bid = {
  __typename?: 'Bid';
  amount: Scalars['Float']['output'];
  coverLetter?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  currency?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  estimatedDuration?: Maybe<Scalars['String']['output']>;
  estimatedHours?: Maybe<Scalars['Int']['output']>;
  freelancerId: Scalars['Int']['output'];
  hourlyRate?: Maybe<Scalars['Float']['output']>;
  id: Scalars['ID']['output'];
  milestones?: Maybe<Array<BidMilestoneOutput>>;
  paymentType: BidPaymentType;
  proposedApproach?: Maybe<Scalars['String']['output']>;
  responseTime?: Maybe<Scalars['Int']['output']>;
  status: BidStatus;
  taskId: Scalars['Int']['output'];
  updatedAt: Scalars['DateTime']['output'];
  visibility: BidVisibility;
};

export type BidMilestoneOutput = {
  __typename?: 'BidMilestoneOutput';
  amount: Scalars['Float']['output'];
  deliverables?: Maybe<Scalars['String']['output']>;
  description: Scalars['String']['output'];
  dueDate?: Maybe<Scalars['DateTime']['output']>;
  estimatedHours?: Maybe<Scalars['Int']['output']>;
  sequence?: Maybe<Scalars['Int']['output']>;
  title: Scalars['String']['output'];
};

export enum BidPaymentType {
  Fixed = 'FIXED',
  Hourly = 'HOURLY',
  MilestoneBased = 'MILESTONE_BASED'
}

export type BidResponse = {
  __typename?: 'BidResponse';
  bid: Bid;
  message: Scalars['String']['output'];
};

export enum BidStatus {
  Accepted = 'ACCEPTED',
  Approved = 'APPROVED',
  ClientCancelled = 'CLIENT_CANCELLED',
  Expired = 'EXPIRED',
  FreelancerCancelled = 'FREELANCER_CANCELLED',
  Negotiation = 'NEGOTIATION',
  Pending = 'PENDING',
  Rejected = 'REJECTED',
  Withdrawn = 'WITHDRAWN'
}

export enum BidVisibility {
  Featured = 'FEATURED',
  Private = 'PRIVATE',
  Public = 'PUBLIC'
}

export enum BudgetType {
  Fixed = 'FIXED',
  Hourly = 'HOURLY',
  Range = 'RANGE'
}

export type ChangePasswordInput = {
  currentPassword: Scalars['String']['input'];
  newPassword: Scalars['String']['input'];
};

export type CreateBidInput = {
  amount: Scalars['Float']['input'];
  coverLetter?: InputMaybe<Scalars['String']['input']>;
  currency?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  estimatedDuration?: InputMaybe<Scalars['String']['input']>;
  estimatedHours?: InputMaybe<Scalars['Int']['input']>;
  hourlyRate?: InputMaybe<Scalars['Float']['input']>;
  milestones?: InputMaybe<Array<CreateBidMilestoneInput>>;
  paymentType?: BidPaymentType;
  proposedApproach?: InputMaybe<Scalars['String']['input']>;
  responseTime?: InputMaybe<Scalars['Int']['input']>;
  taskId: Scalars['Int']['input'];
  visibility?: InputMaybe<BidVisibility>;
};

export type CreateBidMilestoneInput = {
  amount: Scalars['Float']['input'];
  deliverables?: InputMaybe<Scalars['String']['input']>;
  description: Scalars['String']['input'];
  dueDate?: InputMaybe<Scalars['DateTime']['input']>;
  estimatedHours?: InputMaybe<Scalars['Int']['input']>;
  sequence?: InputMaybe<Scalars['Int']['input']>;
  title: Scalars['String']['input'];
};

export type CreateTaskFromTemplateDto = {
  taskOverrides?: InputMaybe<UpdateTaskInput>;
};

export type CreateTaskInput = {
  addressLine1?: InputMaybe<Scalars['String']['input']>;
  addressLine2?: InputMaybe<Scalars['String']['input']>;
  attachments?: InputMaybe<Array<AttachmentInput>>;
  boostAmount?: InputMaybe<Scalars['Float']['input']>;
  boostDuration?: InputMaybe<Scalars['Int']['input']>;
  boostTask?: InputMaybe<Scalars['Boolean']['input']>;
  budget?: InputMaybe<Scalars['Float']['input']>;
  budgetType?: InputMaybe<BudgetType>;
  categoryIds?: InputMaybe<Array<Scalars['Int']['input']>>;
  city?: InputMaybe<Scalars['String']['input']>;
  country?: InputMaybe<Scalars['String']['input']>;
  dateRange?: InputMaybe<DateRangeInput>;
  deadlineDate?: InputMaybe<Scalars['String']['input']>;
  description: Scalars['String']['input'];
  dropOffLocation?: InputMaybe<LocationInput>;
  estimatedHours?: InputMaybe<Scalars['Float']['input']>;
  imageUrls?: InputMaybe<Array<Scalars['String']['input']>>;
  isRemovals?: InputMaybe<Scalars['Boolean']['input']>;
  latitude?: InputMaybe<Scalars['Float']['input']>;
  longitude?: InputMaybe<Scalars['Float']['input']>;
  pickupLocation?: InputMaybe<LocationInput>;
  postalCode?: InputMaybe<Scalars['String']['input']>;
  saveAsTemplate?: InputMaybe<Scalars['Boolean']['input']>;
  skillIds?: InputMaybe<Array<Scalars['Int']['input']>>;
  skillImportance?: InputMaybe<SkillImportance>;
  state?: InputMaybe<Scalars['String']['input']>;
  taskType?: InputMaybe<TaskType>;
  templateId?: InputMaybe<Scalars['Int']['input']>;
  templateName?: InputMaybe<Scalars['String']['input']>;
  title: Scalars['String']['input'];
  visibility?: InputMaybe<TaskVisibility>;
};

export type CreateTaskTemplateInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  existingTaskId?: InputMaybe<Scalars['Int']['input']>;
  isRecurring?: InputMaybe<Scalars['Boolean']['input']>;
  name: Scalars['String']['input'];
  recurrencePattern?: InputMaybe<RecurrencePatternInput>;
  recurrenceType?: InputMaybe<RecurrenceType>;
  task?: InputMaybe<CreateTaskInput>;
};

export type DateRangeInput = {
  end?: InputMaybe<Scalars['String']['input']>;
  start?: InputMaybe<Scalars['String']['input']>;
};

export type DateRangeOutput = {
  __typename?: 'DateRangeOutput';
  end?: Maybe<Scalars['String']['output']>;
  start?: Maybe<Scalars['String']['output']>;
};

export type LocationInput = {
  displayName: Scalars['String']['input'];
  latitude: Scalars['Float']['input'];
  /** Whether location data is loaded */
  locationLoaded?: Scalars['Boolean']['input'];
  longitude: Scalars['Float']['input'];
  zipCode?: InputMaybe<Scalars['String']['input']>;
};

export type LocationOutput = {
  __typename?: 'LocationOutput';
  displayName: Scalars['String']['output'];
  latitude: Scalars['Float']['output'];
  /** Whether location data is loaded */
  locationLoaded: Scalars['Boolean']['output'];
  longitude: Scalars['Float']['output'];
  zipCode?: Maybe<Scalars['String']['output']>;
};

export type LoginInput = {
  email: Scalars['String']['input'];
  password: Scalars['String']['input'];
};

export type Mutation = {
  __typename?: 'Mutation';
  acceptBid: BidResponse;
  changePassword: Scalars['Boolean']['output'];
  changeTaskStatus: Task;
  createBid: BidResponse;
  createTask: Task;
  createTaskFromTemplate: Task;
  createTaskTemplate: TaskTemplateResponse;
  deleteTask: Scalars['Boolean']['output'];
  deleteTaskTemplate: Scalars['Boolean']['output'];
  login: Auth;
  register: Auth;
  rejectBid: BidResponse;
  updateBid: BidResponse;
  updateTask: Task;
  updateTaskTemplate: TaskTemplateResponse;
  updateUser: User;
  withdrawBid: Scalars['Boolean']['output'];
};


export type MutationAcceptBidArgs = {
  id: Scalars['Int']['input'];
};


export type MutationChangePasswordArgs = {
  input: ChangePasswordInput;
};


export type MutationChangeTaskStatusArgs = {
  status: TaskStatus;
  taskId: Scalars['ID']['input'];
};


export type MutationCreateBidArgs = {
  input: CreateBidInput;
};


export type MutationCreateTaskArgs = {
  input: CreateTaskInput;
};


export type MutationCreateTaskFromTemplateArgs = {
  input?: InputMaybe<CreateTaskFromTemplateDto>;
  templateId: Scalars['Int']['input'];
};


export type MutationCreateTaskTemplateArgs = {
  input: CreateTaskTemplateInput;
};


export type MutationDeleteTaskArgs = {
  id: Scalars['Int']['input'];
};


export type MutationDeleteTaskTemplateArgs = {
  id: Scalars['Int']['input'];
};


export type MutationLoginArgs = {
  input: LoginInput;
};


export type MutationRegisterArgs = {
  input: RegisterInput;
};


export type MutationRejectBidArgs = {
  id: Scalars['Int']['input'];
};


export type MutationUpdateBidArgs = {
  id: Scalars['Int']['input'];
  input: UpdateBidInput;
};


export type MutationUpdateTaskArgs = {
  id: Scalars['Int']['input'];
  input: UpdateTaskInput;
};


export type MutationUpdateTaskTemplateArgs = {
  id: Scalars['Int']['input'];
  input: UpdateTaskTemplateInput;
};


export type MutationUpdateUserArgs = {
  input: UpdateUserInput;
};


export type MutationWithdrawBidArgs = {
  id: Scalars['Int']['input'];
  reason?: InputMaybe<Scalars['String']['input']>;
};

export type PaginatedTasksResponse = {
  __typename?: 'PaginatedTasksResponse';
  items: Array<Task>;
  meta: PaginationMeta;
};

export type PaginationMeta = {
  __typename?: 'PaginationMeta';
  currentPage: Scalars['Int']['output'];
  itemCount: Scalars['Int']['output'];
  itemsPerPage: Scalars['Int']['output'];
  totalItems: Scalars['Int']['output'];
  totalPages: Scalars['Int']['output'];
};

export type Query = {
  __typename?: 'Query';
  bid: Bid;
  bids: Array<Bid>;
  bidsByTask: Array<Bid>;
  me: User;
  myTasks: Array<Task>;
  task: Task;
  taskTemplate: TaskTemplateResponse;
  taskTemplates: Array<TaskTemplateResponse>;
  tasks: PaginatedTasksResponse;
  user: User;
  users: Array<User>;
  verifyToken: TokenVerificationResult;
};


export type QueryBidArgs = {
  id: Scalars['Int']['input'];
};


export type QueryBidsByTaskArgs = {
  taskId: Scalars['Int']['input'];
};


export type QueryTaskArgs = {
  id: Scalars['Int']['input'];
};


export type QueryTaskTemplateArgs = {
  id: Scalars['Int']['input'];
};


export type QueryTasksArgs = {
  categoryId?: InputMaybe<Scalars['Float']['input']>;
  includeDeleted?: InputMaybe<Scalars['Boolean']['input']>;
  limit?: InputMaybe<Scalars['Float']['input']>;
  maxBudget?: InputMaybe<Scalars['Float']['input']>;
  minBudget?: InputMaybe<Scalars['Float']['input']>;
  page?: InputMaybe<Scalars['Float']['input']>;
  searchTerm?: InputMaybe<Scalars['String']['input']>;
  skillId?: InputMaybe<Scalars['Float']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
  taskType?: InputMaybe<Scalars['String']['input']>;
};


export type QueryUserArgs = {
  id: Scalars['Int']['input'];
};


export type QueryVerifyTokenArgs = {
  token: Scalars['String']['input'];
};

export enum RecurrenceFrequency {
  Biweekly = 'BIWEEKLY',
  Custom = 'CUSTOM',
  Daily = 'DAILY',
  Monthly = 'MONTHLY',
  Weekly = 'WEEKLY'
}

export type RecurrencePattern = {
  __typename?: 'RecurrencePattern';
  dayOfMonth?: Maybe<Scalars['Int']['output']>;
  daysOfWeek?: Maybe<Array<Scalars['Int']['output']>>;
  endDate?: Maybe<Scalars['DateTime']['output']>;
  frequency: RecurrenceFrequency;
  interval: Scalars['Int']['output'];
  maxOccurrences?: Maybe<Scalars['Int']['output']>;
};

export type RecurrencePatternInput = {
  dayOfMonth?: InputMaybe<Scalars['Int']['input']>;
  daysOfWeek?: InputMaybe<Array<Scalars['Int']['input']>>;
  endDate?: InputMaybe<Scalars['DateTime']['input']>;
  frequency: RecurrenceFrequency;
  interval: Scalars['Int']['input'];
  maxOccurrences?: InputMaybe<Scalars['Int']['input']>;
};

export enum RecurrenceType {
  Biweekly = 'BIWEEKLY',
  Custom = 'CUSTOM',
  Daily = 'DAILY',
  Monthly = 'MONTHLY',
  Weekly = 'WEEKLY'
}

export type RegisterInput = {
  email: Scalars['String']['input'];
  name?: InputMaybe<Scalars['String']['input']>;
  password: Scalars['String']['input'];
};

export enum SkillImportance {
  Bonus = 'BONUS',
  Preferred = 'PREFERRED',
  Required = 'REQUIRED'
}

export type Task = {
  __typename?: 'Task';
  attachments?: Maybe<Array<AttachmentOutput>>;
  budget?: Maybe<Scalars['Float']['output']>;
  budgetType: BudgetType;
  categoryIds?: Maybe<Array<Scalars['Int']['output']>>;
  clientId: Scalars['Int']['output'];
  createdAt: Scalars['DateTime']['output'];
  dateRange?: Maybe<DateRangeOutput>;
  deadlineDate?: Maybe<Scalars['String']['output']>;
  deletedAt?: Maybe<Scalars['DateTime']['output']>;
  description: Scalars['String']['output'];
  dropOffLocation?: Maybe<LocationOutput>;
  estimatedHours?: Maybe<Scalars['Int']['output']>;
  freelancerId?: Maybe<Scalars['Int']['output']>;
  id: Scalars['ID']['output'];
  imageUrls?: Maybe<Array<Scalars['String']['output']>>;
  isRemovals: Scalars['Boolean']['output'];
  pickupLocation?: Maybe<LocationOutput>;
  skillIds?: Maybe<Array<Scalars['Int']['output']>>;
  status: TaskStatus;
  taskType: TaskType;
  title: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
  visibility: TaskVisibility;
};

export enum TaskStatus {
  Cancelled = 'CANCELLED',
  Completed = 'COMPLETED',
  Disputed = 'DISPUTED',
  Draft = 'DRAFT',
  InProgress = 'IN_PROGRESS',
  Open = 'OPEN'
}

export type TaskTemplateResponse = {
  __typename?: 'TaskTemplateResponse';
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  userId: Scalars['Int']['output'];
};

export enum TaskType {
  InPerson = 'IN_PERSON',
  Remote = 'REMOTE'
}

export enum TaskVisibility {
  FollowersOnly = 'FOLLOWERS_ONLY',
  InviteOnly = 'INVITE_ONLY',
  Private = 'PRIVATE',
  Public = 'PUBLIC'
}

export type TokenVerificationResult = {
  __typename?: 'TokenVerificationResult';
  isValid: Scalars['Boolean']['output'];
  user?: Maybe<User>;
};

export type UpdateBidInput = {
  amount?: InputMaybe<Scalars['Float']['input']>;
  coverLetter?: InputMaybe<Scalars['String']['input']>;
  currency?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  estimatedDuration?: InputMaybe<Scalars['String']['input']>;
  estimatedHours?: InputMaybe<Scalars['Int']['input']>;
  hourlyRate?: InputMaybe<Scalars['Float']['input']>;
  milestones?: InputMaybe<Array<CreateBidMilestoneInput>>;
  paymentType?: InputMaybe<BidPaymentType>;
  proposedApproach?: InputMaybe<Scalars['String']['input']>;
  responseTime?: InputMaybe<Scalars['Int']['input']>;
  visibility?: InputMaybe<BidVisibility>;
};

export type UpdateTaskInput = {
  addressLine1?: InputMaybe<Scalars['String']['input']>;
  addressLine2?: InputMaybe<Scalars['String']['input']>;
  attachments?: InputMaybe<Array<AttachmentInput>>;
  budget?: InputMaybe<Scalars['Float']['input']>;
  budgetType?: InputMaybe<BudgetType>;
  categoryIds?: InputMaybe<Array<Scalars['Int']['input']>>;
  city?: InputMaybe<Scalars['String']['input']>;
  country?: InputMaybe<Scalars['String']['input']>;
  dateRange?: InputMaybe<DateRangeInput>;
  deadlineDate?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  dropOffLocation?: InputMaybe<LocationInput>;
  estimatedHours?: InputMaybe<Scalars['Float']['input']>;
  imageUrls?: InputMaybe<Array<Scalars['String']['input']>>;
  isRemovals?: InputMaybe<Scalars['Boolean']['input']>;
  latitude?: InputMaybe<Scalars['Float']['input']>;
  longitude?: InputMaybe<Scalars['Float']['input']>;
  pickupLocation?: InputMaybe<LocationInput>;
  postalCode?: InputMaybe<Scalars['String']['input']>;
  skillIds?: InputMaybe<Array<Scalars['Int']['input']>>;
  skillImportance?: InputMaybe<SkillImportance>;
  state?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<TaskStatus>;
  taskType?: InputMaybe<TaskType>;
  title?: InputMaybe<Scalars['String']['input']>;
  visibility?: InputMaybe<TaskVisibility>;
};

export type UpdateTaskTemplateInput = {
  recurrencePattern?: InputMaybe<RecurrencePatternInput>;
  task?: InputMaybe<UpdateTaskInput>;
};

export type UpdateUserInput = {
  biddingAllowed?: InputMaybe<Scalars['Boolean']['input']>;
  dob?: InputMaybe<Scalars['DateTime']['input']>;
  email?: InputMaybe<Scalars['String']['input']>;
  isEmailVerified?: InputMaybe<Scalars['Boolean']['input']>;
  mobileNumber?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  onboardingComplete?: InputMaybe<Scalars['Boolean']['input']>;
  profilePicture?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<UserStatus>;
  userRole?: InputMaybe<UserRole>;
};

export type User = {
  __typename?: 'User';
  biddingAllowed: Scalars['Boolean']['output'];
  createdAt: Scalars['DateTime']['output'];
  deletedAt?: Maybe<Scalars['DateTime']['output']>;
  dob?: Maybe<Scalars['DateTime']['output']>;
  email?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  isEmailVerified: Scalars['Boolean']['output'];
  lastLoginAt?: Maybe<Scalars['DateTime']['output']>;
  mobileNumber?: Maybe<Scalars['String']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  onboardingComplete: Scalars['Boolean']['output'];
  profilePicture?: Maybe<Scalars['String']['output']>;
  status: UserStatus;
  updatedAt: Scalars['DateTime']['output'];
  userRole: UserRole;
  verificationLevel: VerificationLevel;
};

export enum UserRole {
  Admin = 'ADMIN',
  Both = 'BOTH',
  Client = 'CLIENT',
  Freelancer = 'FREELANCER'
}

export enum UserStatus {
  Active = 'ACTIVE',
  Banned = 'BANNED',
  Inactive = 'INACTIVE',
  Suspended = 'SUSPENDED'
}

export enum VerificationLevel {
  Basic = 'BASIC',
  None = 'NONE',
  Premium = 'PREMIUM',
  Verified = 'VERIFIED'
}

export type BidMilestoneFieldsFragment = { __typename?: 'BidMilestoneOutput', title: string, description: string, amount: number, deliverables?: string | null, dueDate?: any | null, estimatedHours?: number | null, sequence?: number | null } & { ' $fragmentName'?: 'BidMilestoneFieldsFragment' };

export type BidBasicFieldsFragment = { __typename?: 'Bid', id: string, amount: number, currency?: string | null, status: BidStatus, paymentType: BidPaymentType, visibility: BidVisibility, createdAt: any, updatedAt: any, taskId: number, freelancerId: number } & { ' $fragmentName'?: 'BidBasicFieldsFragment' };

export type BidDetailFieldsFragment = (
  { __typename?: 'Bid', description?: string | null, coverLetter?: string | null, estimatedDuration?: string | null, estimatedHours?: number | null, hourlyRate?: number | null, proposedApproach?: string | null, responseTime?: number | null, milestones?: Array<(
    { __typename?: 'BidMilestoneOutput' }
    & { ' $fragmentRefs'?: { 'BidMilestoneFieldsFragment': BidMilestoneFieldsFragment } }
  )> | null }
  & { ' $fragmentRefs'?: { 'BidBasicFieldsFragment': BidBasicFieldsFragment } }
) & { ' $fragmentName'?: 'BidDetailFieldsFragment' };

export type TaskBasicFieldsFragment = { __typename?: 'Task', id: string, title: string, description: string, status: TaskStatus, budget?: number | null, budgetType: BudgetType, taskType: TaskType, visibility: TaskVisibility, createdAt: any, updatedAt: any, clientId: number } & { ' $fragmentName'?: 'TaskBasicFieldsFragment' };

export type TaskLocationFieldsFragment = { __typename?: 'Task', isRemovals: boolean, pickupLocation?: { __typename?: 'LocationOutput', displayName: string, latitude: number, longitude: number, locationLoaded: boolean, zipCode?: string | null } | null, dropOffLocation?: { __typename?: 'LocationOutput', displayName: string, latitude: number, longitude: number, locationLoaded: boolean, zipCode?: string | null } | null } & { ' $fragmentName'?: 'TaskLocationFieldsFragment' };

export type TaskDetailFieldsFragment = (
  { __typename?: 'Task', deadlineDate?: string | null, estimatedHours?: number | null, freelancerId?: number | null, skillIds?: Array<number> | null, imageUrls?: Array<string> | null, dateRange?: { __typename?: 'DateRangeOutput', start?: string | null, end?: string | null } | null, attachments?: Array<{ __typename?: 'AttachmentOutput', fileName: string, fileUrl: string, fileSize?: number | null }> | null }
  & { ' $fragmentRefs'?: { 'TaskBasicFieldsFragment': TaskBasicFieldsFragment;'TaskLocationFieldsFragment': TaskLocationFieldsFragment } }
) & { ' $fragmentName'?: 'TaskDetailFieldsFragment' };

export type TaskFullFieldsFragment = (
  { __typename?: 'Task', categoryIds?: Array<number> | null, deletedAt?: any | null }
  & { ' $fragmentRefs'?: { 'TaskDetailFieldsFragment': TaskDetailFieldsFragment } }
) & { ' $fragmentName'?: 'TaskFullFieldsFragment' };

export type UserBasicFieldsFragment = { __typename?: 'User', id: string, name?: string | null, email?: string | null, userRole: UserRole, status: UserStatus, profilePicture?: string | null } & { ' $fragmentName'?: 'UserBasicFieldsFragment' };

export type UserProfileFieldsFragment = (
  { __typename?: 'User', onboardingComplete: boolean, verificationLevel: VerificationLevel, biddingAllowed: boolean, lastLoginAt?: any | null, createdAt: any, updatedAt: any }
  & { ' $fragmentRefs'?: { 'UserBasicFieldsFragment': UserBasicFieldsFragment } }
) & { ' $fragmentName'?: 'UserProfileFieldsFragment' };

export type UserExtendedFieldsFragment = (
  { __typename?: 'User', isEmailVerified: boolean, mobileNumber?: string | null, dob?: any | null }
  & { ' $fragmentRefs'?: { 'UserProfileFieldsFragment': UserProfileFieldsFragment } }
) & { ' $fragmentName'?: 'UserExtendedFieldsFragment' };

export type LoginMutationVariables = Exact<{
  input: LoginInput;
}>;


export type LoginMutation = { __typename?: 'Mutation', login: { __typename?: 'Auth', access_token: string, expires_in: number, token_type: string, user: (
      { __typename?: 'User' }
      & { ' $fragmentRefs'?: { 'UserProfileFieldsFragment': UserProfileFieldsFragment } }
    ) } };

export type RegisterMutationVariables = Exact<{
  input: RegisterInput;
}>;


export type RegisterMutation = { __typename?: 'Mutation', register: { __typename?: 'Auth', access_token: string, expires_in: number, token_type: string, user: (
      { __typename?: 'User' }
      & { ' $fragmentRefs'?: { 'UserProfileFieldsFragment': UserProfileFieldsFragment } }
    ) } };

export type ChangePasswordMutationVariables = Exact<{
  input: ChangePasswordInput;
}>;


export type ChangePasswordMutation = { __typename?: 'Mutation', changePassword: boolean };

export type MeQueryVariables = Exact<{ [key: string]: never; }>;


export type MeQuery = { __typename?: 'Query', me: (
    { __typename?: 'User' }
    & { ' $fragmentRefs'?: { 'UserProfileFieldsFragment': UserProfileFieldsFragment } }
  ) };

export type VerifyTokenQueryVariables = Exact<{
  token: Scalars['String']['input'];
}>;


export type VerifyTokenQuery = { __typename?: 'Query', verifyToken: { __typename?: 'TokenVerificationResult', isValid: boolean, user?: (
      { __typename?: 'User' }
      & { ' $fragmentRefs'?: { 'UserProfileFieldsFragment': UserProfileFieldsFragment } }
    ) | null } };

export type BidsQueryVariables = Exact<{ [key: string]: never; }>;


export type BidsQuery = { __typename?: 'Query', bids: Array<(
    { __typename?: 'Bid' }
    & { ' $fragmentRefs'?: { 'BidBasicFieldsFragment': BidBasicFieldsFragment } }
  )> };

export type BidQueryVariables = Exact<{
  id: Scalars['Int']['input'];
}>;


export type BidQuery = { __typename?: 'Query', bid: (
    { __typename?: 'Bid' }
    & { ' $fragmentRefs'?: { 'BidDetailFieldsFragment': BidDetailFieldsFragment } }
  ) };

export type BidsByTaskQueryVariables = Exact<{
  taskId: Scalars['Int']['input'];
}>;


export type BidsByTaskQuery = { __typename?: 'Query', bidsByTask: Array<(
    { __typename?: 'Bid' }
    & { ' $fragmentRefs'?: { 'BidDetailFieldsFragment': BidDetailFieldsFragment } }
  )> };

export type CreateBidMutationVariables = Exact<{
  input: CreateBidInput;
}>;


export type CreateBidMutation = { __typename?: 'Mutation', createBid: { __typename?: 'BidResponse', message: string, bid: (
      { __typename?: 'Bid' }
      & { ' $fragmentRefs'?: { 'BidDetailFieldsFragment': BidDetailFieldsFragment } }
    ) } };

export type UpdateBidMutationVariables = Exact<{
  id: Scalars['Int']['input'];
  input: UpdateBidInput;
}>;


export type UpdateBidMutation = { __typename?: 'Mutation', updateBid: { __typename?: 'BidResponse', message: string, bid: (
      { __typename?: 'Bid' }
      & { ' $fragmentRefs'?: { 'BidDetailFieldsFragment': BidDetailFieldsFragment } }
    ) } };

export type AcceptBidMutationVariables = Exact<{
  id: Scalars['Int']['input'];
}>;


export type AcceptBidMutation = { __typename?: 'Mutation', acceptBid: { __typename?: 'BidResponse', message: string, bid: (
      { __typename?: 'Bid' }
      & { ' $fragmentRefs'?: { 'BidBasicFieldsFragment': BidBasicFieldsFragment } }
    ) } };

export type WithdrawBidMutationVariables = Exact<{
  id: Scalars['Int']['input'];
  reason?: InputMaybe<Scalars['String']['input']>;
}>;


export type WithdrawBidMutation = { __typename?: 'Mutation', withdrawBid: boolean };

export type TasksQueryVariables = Exact<{
  page?: InputMaybe<Scalars['Float']['input']>;
  limit?: InputMaybe<Scalars['Float']['input']>;
  searchTerm?: InputMaybe<Scalars['String']['input']>;
  categoryId?: InputMaybe<Scalars['Float']['input']>;
  skillId?: InputMaybe<Scalars['Float']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
  taskType?: InputMaybe<Scalars['String']['input']>;
  minBudget?: InputMaybe<Scalars['Float']['input']>;
  maxBudget?: InputMaybe<Scalars['Float']['input']>;
  includeDeleted?: InputMaybe<Scalars['Boolean']['input']>;
}>;


export type TasksQuery = { __typename?: 'Query', tasks: { __typename?: 'PaginatedTasksResponse', items: Array<(
      { __typename?: 'Task' }
      & { ' $fragmentRefs'?: { 'TaskBasicFieldsFragment': TaskBasicFieldsFragment } }
    )>, meta: { __typename?: 'PaginationMeta', currentPage: number, itemCount: number, itemsPerPage: number, totalItems: number, totalPages: number } } };

export type TaskQueryVariables = Exact<{
  id: Scalars['Int']['input'];
}>;


export type TaskQuery = { __typename?: 'Query', task: (
    { __typename?: 'Task' }
    & { ' $fragmentRefs'?: { 'TaskFullFieldsFragment': TaskFullFieldsFragment } }
  ) };

export type MyTasksQueryVariables = Exact<{ [key: string]: never; }>;


export type MyTasksQuery = { __typename?: 'Query', myTasks: Array<(
    { __typename?: 'Task' }
    & { ' $fragmentRefs'?: { 'TaskDetailFieldsFragment': TaskDetailFieldsFragment } }
  )> };

export type CreateTaskMutationVariables = Exact<{
  input: CreateTaskInput;
}>;


export type CreateTaskMutation = { __typename?: 'Mutation', createTask: (
    { __typename?: 'Task' }
    & { ' $fragmentRefs'?: { 'TaskDetailFieldsFragment': TaskDetailFieldsFragment } }
  ) };

export type UpdateTaskMutationVariables = Exact<{
  id: Scalars['Int']['input'];
  input: UpdateTaskInput;
}>;


export type UpdateTaskMutation = { __typename?: 'Mutation', updateTask: (
    { __typename?: 'Task' }
    & { ' $fragmentRefs'?: { 'TaskDetailFieldsFragment': TaskDetailFieldsFragment } }
  ) };

export type ChangeTaskStatusMutationVariables = Exact<{
  taskId: Scalars['ID']['input'];
  status: TaskStatus;
}>;


export type ChangeTaskStatusMutation = { __typename?: 'Mutation', changeTaskStatus: { __typename?: 'Task', id: string, status: TaskStatus } };

export type DeleteTaskMutationVariables = Exact<{
  id: Scalars['Int']['input'];
}>;


export type DeleteTaskMutation = { __typename?: 'Mutation', deleteTask: boolean };

export const BidBasicFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"BidBasicFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Bid"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"amount"}},{"kind":"Field","name":{"kind":"Name","value":"currency"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"paymentType"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"taskId"}},{"kind":"Field","name":{"kind":"Name","value":"freelancerId"}}]}}]} as unknown as DocumentNode<BidBasicFieldsFragment, unknown>;
export const BidMilestoneFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"BidMilestoneFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"BidMilestoneOutput"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"amount"}},{"kind":"Field","name":{"kind":"Name","value":"deliverables"}},{"kind":"Field","name":{"kind":"Name","value":"dueDate"}},{"kind":"Field","name":{"kind":"Name","value":"estimatedHours"}},{"kind":"Field","name":{"kind":"Name","value":"sequence"}}]}}]} as unknown as DocumentNode<BidMilestoneFieldsFragment, unknown>;
export const BidDetailFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"BidDetailFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Bid"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"BidBasicFields"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"coverLetter"}},{"kind":"Field","name":{"kind":"Name","value":"estimatedDuration"}},{"kind":"Field","name":{"kind":"Name","value":"estimatedHours"}},{"kind":"Field","name":{"kind":"Name","value":"hourlyRate"}},{"kind":"Field","name":{"kind":"Name","value":"proposedApproach"}},{"kind":"Field","name":{"kind":"Name","value":"responseTime"}},{"kind":"Field","name":{"kind":"Name","value":"milestones"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"BidMilestoneFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"BidBasicFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Bid"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"amount"}},{"kind":"Field","name":{"kind":"Name","value":"currency"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"paymentType"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"taskId"}},{"kind":"Field","name":{"kind":"Name","value":"freelancerId"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"BidMilestoneFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"BidMilestoneOutput"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"amount"}},{"kind":"Field","name":{"kind":"Name","value":"deliverables"}},{"kind":"Field","name":{"kind":"Name","value":"dueDate"}},{"kind":"Field","name":{"kind":"Name","value":"estimatedHours"}},{"kind":"Field","name":{"kind":"Name","value":"sequence"}}]}}]} as unknown as DocumentNode<BidDetailFieldsFragment, unknown>;
export const TaskBasicFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TaskBasicFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Task"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"budget"}},{"kind":"Field","name":{"kind":"Name","value":"budgetType"}},{"kind":"Field","name":{"kind":"Name","value":"taskType"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"clientId"}}]}}]} as unknown as DocumentNode<TaskBasicFieldsFragment, unknown>;
export const TaskLocationFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TaskLocationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Task"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"isRemovals"}},{"kind":"Field","name":{"kind":"Name","value":"pickupLocation"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"latitude"}},{"kind":"Field","name":{"kind":"Name","value":"longitude"}},{"kind":"Field","name":{"kind":"Name","value":"locationLoaded"}},{"kind":"Field","name":{"kind":"Name","value":"zipCode"}}]}},{"kind":"Field","name":{"kind":"Name","value":"dropOffLocation"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"latitude"}},{"kind":"Field","name":{"kind":"Name","value":"longitude"}},{"kind":"Field","name":{"kind":"Name","value":"locationLoaded"}},{"kind":"Field","name":{"kind":"Name","value":"zipCode"}}]}}]}}]} as unknown as DocumentNode<TaskLocationFieldsFragment, unknown>;
export const TaskDetailFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TaskDetailFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Task"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TaskBasicFields"}},{"kind":"FragmentSpread","name":{"kind":"Name","value":"TaskLocationFields"}},{"kind":"Field","name":{"kind":"Name","value":"dateRange"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"start"}},{"kind":"Field","name":{"kind":"Name","value":"end"}}]}},{"kind":"Field","name":{"kind":"Name","value":"deadlineDate"}},{"kind":"Field","name":{"kind":"Name","value":"estimatedHours"}},{"kind":"Field","name":{"kind":"Name","value":"freelancerId"}},{"kind":"Field","name":{"kind":"Name","value":"skillIds"}},{"kind":"Field","name":{"kind":"Name","value":"attachments"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"fileName"}},{"kind":"Field","name":{"kind":"Name","value":"fileUrl"}},{"kind":"Field","name":{"kind":"Name","value":"fileSize"}}]}},{"kind":"Field","name":{"kind":"Name","value":"imageUrls"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TaskBasicFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Task"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"budget"}},{"kind":"Field","name":{"kind":"Name","value":"budgetType"}},{"kind":"Field","name":{"kind":"Name","value":"taskType"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"clientId"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TaskLocationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Task"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"isRemovals"}},{"kind":"Field","name":{"kind":"Name","value":"pickupLocation"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"latitude"}},{"kind":"Field","name":{"kind":"Name","value":"longitude"}},{"kind":"Field","name":{"kind":"Name","value":"locationLoaded"}},{"kind":"Field","name":{"kind":"Name","value":"zipCode"}}]}},{"kind":"Field","name":{"kind":"Name","value":"dropOffLocation"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"latitude"}},{"kind":"Field","name":{"kind":"Name","value":"longitude"}},{"kind":"Field","name":{"kind":"Name","value":"locationLoaded"}},{"kind":"Field","name":{"kind":"Name","value":"zipCode"}}]}}]}}]} as unknown as DocumentNode<TaskDetailFieldsFragment, unknown>;
export const TaskFullFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TaskFullFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Task"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TaskDetailFields"}},{"kind":"Field","name":{"kind":"Name","value":"categoryIds"}},{"kind":"Field","name":{"kind":"Name","value":"deletedAt"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TaskBasicFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Task"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"budget"}},{"kind":"Field","name":{"kind":"Name","value":"budgetType"}},{"kind":"Field","name":{"kind":"Name","value":"taskType"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"clientId"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TaskLocationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Task"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"isRemovals"}},{"kind":"Field","name":{"kind":"Name","value":"pickupLocation"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"latitude"}},{"kind":"Field","name":{"kind":"Name","value":"longitude"}},{"kind":"Field","name":{"kind":"Name","value":"locationLoaded"}},{"kind":"Field","name":{"kind":"Name","value":"zipCode"}}]}},{"kind":"Field","name":{"kind":"Name","value":"dropOffLocation"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"latitude"}},{"kind":"Field","name":{"kind":"Name","value":"longitude"}},{"kind":"Field","name":{"kind":"Name","value":"locationLoaded"}},{"kind":"Field","name":{"kind":"Name","value":"zipCode"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TaskDetailFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Task"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TaskBasicFields"}},{"kind":"FragmentSpread","name":{"kind":"Name","value":"TaskLocationFields"}},{"kind":"Field","name":{"kind":"Name","value":"dateRange"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"start"}},{"kind":"Field","name":{"kind":"Name","value":"end"}}]}},{"kind":"Field","name":{"kind":"Name","value":"deadlineDate"}},{"kind":"Field","name":{"kind":"Name","value":"estimatedHours"}},{"kind":"Field","name":{"kind":"Name","value":"freelancerId"}},{"kind":"Field","name":{"kind":"Name","value":"skillIds"}},{"kind":"Field","name":{"kind":"Name","value":"attachments"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"fileName"}},{"kind":"Field","name":{"kind":"Name","value":"fileUrl"}},{"kind":"Field","name":{"kind":"Name","value":"fileSize"}}]}},{"kind":"Field","name":{"kind":"Name","value":"imageUrls"}}]}}]} as unknown as DocumentNode<TaskFullFieldsFragment, unknown>;
export const UserBasicFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"UserBasicFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"User"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"userRole"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"profilePicture"}}]}}]} as unknown as DocumentNode<UserBasicFieldsFragment, unknown>;
export const UserProfileFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"UserProfileFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"User"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"UserBasicFields"}},{"kind":"Field","name":{"kind":"Name","value":"onboardingComplete"}},{"kind":"Field","name":{"kind":"Name","value":"verificationLevel"}},{"kind":"Field","name":{"kind":"Name","value":"biddingAllowed"}},{"kind":"Field","name":{"kind":"Name","value":"lastLoginAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"UserBasicFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"User"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"userRole"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"profilePicture"}}]}}]} as unknown as DocumentNode<UserProfileFieldsFragment, unknown>;
export const UserExtendedFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"UserExtendedFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"User"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"UserProfileFields"}},{"kind":"Field","name":{"kind":"Name","value":"isEmailVerified"}},{"kind":"Field","name":{"kind":"Name","value":"mobileNumber"}},{"kind":"Field","name":{"kind":"Name","value":"dob"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"UserBasicFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"User"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"userRole"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"profilePicture"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"UserProfileFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"User"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"UserBasicFields"}},{"kind":"Field","name":{"kind":"Name","value":"onboardingComplete"}},{"kind":"Field","name":{"kind":"Name","value":"verificationLevel"}},{"kind":"Field","name":{"kind":"Name","value":"biddingAllowed"}},{"kind":"Field","name":{"kind":"Name","value":"lastLoginAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<UserExtendedFieldsFragment, unknown>;
export const LoginDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"Login"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"LoginInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"login"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"access_token"}},{"kind":"Field","name":{"kind":"Name","value":"expires_in"}},{"kind":"Field","name":{"kind":"Name","value":"token_type"}},{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"UserProfileFields"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"UserBasicFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"User"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"userRole"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"profilePicture"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"UserProfileFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"User"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"UserBasicFields"}},{"kind":"Field","name":{"kind":"Name","value":"onboardingComplete"}},{"kind":"Field","name":{"kind":"Name","value":"verificationLevel"}},{"kind":"Field","name":{"kind":"Name","value":"biddingAllowed"}},{"kind":"Field","name":{"kind":"Name","value":"lastLoginAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<LoginMutation, LoginMutationVariables>;
export const RegisterDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"Register"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"RegisterInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"register"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"access_token"}},{"kind":"Field","name":{"kind":"Name","value":"expires_in"}},{"kind":"Field","name":{"kind":"Name","value":"token_type"}},{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"UserProfileFields"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"UserBasicFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"User"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"userRole"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"profilePicture"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"UserProfileFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"User"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"UserBasicFields"}},{"kind":"Field","name":{"kind":"Name","value":"onboardingComplete"}},{"kind":"Field","name":{"kind":"Name","value":"verificationLevel"}},{"kind":"Field","name":{"kind":"Name","value":"biddingAllowed"}},{"kind":"Field","name":{"kind":"Name","value":"lastLoginAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<RegisterMutation, RegisterMutationVariables>;
export const ChangePasswordDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ChangePassword"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ChangePasswordInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"changePassword"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}]}]}}]} as unknown as DocumentNode<ChangePasswordMutation, ChangePasswordMutationVariables>;
export const MeDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Me"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"me"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"UserProfileFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"UserBasicFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"User"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"userRole"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"profilePicture"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"UserProfileFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"User"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"UserBasicFields"}},{"kind":"Field","name":{"kind":"Name","value":"onboardingComplete"}},{"kind":"Field","name":{"kind":"Name","value":"verificationLevel"}},{"kind":"Field","name":{"kind":"Name","value":"biddingAllowed"}},{"kind":"Field","name":{"kind":"Name","value":"lastLoginAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<MeQuery, MeQueryVariables>;
export const VerifyTokenDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"VerifyToken"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"token"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"verifyToken"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"token"},"value":{"kind":"Variable","name":{"kind":"Name","value":"token"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"isValid"}},{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"UserProfileFields"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"UserBasicFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"User"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"userRole"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"profilePicture"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"UserProfileFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"User"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"UserBasicFields"}},{"kind":"Field","name":{"kind":"Name","value":"onboardingComplete"}},{"kind":"Field","name":{"kind":"Name","value":"verificationLevel"}},{"kind":"Field","name":{"kind":"Name","value":"biddingAllowed"}},{"kind":"Field","name":{"kind":"Name","value":"lastLoginAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<VerifyTokenQuery, VerifyTokenQueryVariables>;
export const BidsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Bids"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"bids"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"BidBasicFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"BidBasicFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Bid"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"amount"}},{"kind":"Field","name":{"kind":"Name","value":"currency"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"paymentType"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"taskId"}},{"kind":"Field","name":{"kind":"Name","value":"freelancerId"}}]}}]} as unknown as DocumentNode<BidsQuery, BidsQueryVariables>;
export const BidDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Bid"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"bid"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"BidDetailFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"BidBasicFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Bid"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"amount"}},{"kind":"Field","name":{"kind":"Name","value":"currency"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"paymentType"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"taskId"}},{"kind":"Field","name":{"kind":"Name","value":"freelancerId"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"BidMilestoneFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"BidMilestoneOutput"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"amount"}},{"kind":"Field","name":{"kind":"Name","value":"deliverables"}},{"kind":"Field","name":{"kind":"Name","value":"dueDate"}},{"kind":"Field","name":{"kind":"Name","value":"estimatedHours"}},{"kind":"Field","name":{"kind":"Name","value":"sequence"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"BidDetailFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Bid"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"BidBasicFields"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"coverLetter"}},{"kind":"Field","name":{"kind":"Name","value":"estimatedDuration"}},{"kind":"Field","name":{"kind":"Name","value":"estimatedHours"}},{"kind":"Field","name":{"kind":"Name","value":"hourlyRate"}},{"kind":"Field","name":{"kind":"Name","value":"proposedApproach"}},{"kind":"Field","name":{"kind":"Name","value":"responseTime"}},{"kind":"Field","name":{"kind":"Name","value":"milestones"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"BidMilestoneFields"}}]}}]}}]} as unknown as DocumentNode<BidQuery, BidQueryVariables>;
export const BidsByTaskDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"BidsByTask"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"taskId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"bidsByTask"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"taskId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"taskId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"BidDetailFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"BidBasicFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Bid"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"amount"}},{"kind":"Field","name":{"kind":"Name","value":"currency"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"paymentType"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"taskId"}},{"kind":"Field","name":{"kind":"Name","value":"freelancerId"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"BidMilestoneFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"BidMilestoneOutput"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"amount"}},{"kind":"Field","name":{"kind":"Name","value":"deliverables"}},{"kind":"Field","name":{"kind":"Name","value":"dueDate"}},{"kind":"Field","name":{"kind":"Name","value":"estimatedHours"}},{"kind":"Field","name":{"kind":"Name","value":"sequence"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"BidDetailFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Bid"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"BidBasicFields"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"coverLetter"}},{"kind":"Field","name":{"kind":"Name","value":"estimatedDuration"}},{"kind":"Field","name":{"kind":"Name","value":"estimatedHours"}},{"kind":"Field","name":{"kind":"Name","value":"hourlyRate"}},{"kind":"Field","name":{"kind":"Name","value":"proposedApproach"}},{"kind":"Field","name":{"kind":"Name","value":"responseTime"}},{"kind":"Field","name":{"kind":"Name","value":"milestones"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"BidMilestoneFields"}}]}}]}}]} as unknown as DocumentNode<BidsByTaskQuery, BidsByTaskQueryVariables>;
export const CreateBidDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateBid"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateBidInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createBid"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"bid"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"BidDetailFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"message"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"BidBasicFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Bid"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"amount"}},{"kind":"Field","name":{"kind":"Name","value":"currency"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"paymentType"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"taskId"}},{"kind":"Field","name":{"kind":"Name","value":"freelancerId"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"BidMilestoneFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"BidMilestoneOutput"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"amount"}},{"kind":"Field","name":{"kind":"Name","value":"deliverables"}},{"kind":"Field","name":{"kind":"Name","value":"dueDate"}},{"kind":"Field","name":{"kind":"Name","value":"estimatedHours"}},{"kind":"Field","name":{"kind":"Name","value":"sequence"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"BidDetailFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Bid"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"BidBasicFields"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"coverLetter"}},{"kind":"Field","name":{"kind":"Name","value":"estimatedDuration"}},{"kind":"Field","name":{"kind":"Name","value":"estimatedHours"}},{"kind":"Field","name":{"kind":"Name","value":"hourlyRate"}},{"kind":"Field","name":{"kind":"Name","value":"proposedApproach"}},{"kind":"Field","name":{"kind":"Name","value":"responseTime"}},{"kind":"Field","name":{"kind":"Name","value":"milestones"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"BidMilestoneFields"}}]}}]}}]} as unknown as DocumentNode<CreateBidMutation, CreateBidMutationVariables>;
export const UpdateBidDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateBid"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UpdateBidInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateBid"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}},{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"bid"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"BidDetailFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"message"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"BidBasicFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Bid"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"amount"}},{"kind":"Field","name":{"kind":"Name","value":"currency"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"paymentType"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"taskId"}},{"kind":"Field","name":{"kind":"Name","value":"freelancerId"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"BidMilestoneFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"BidMilestoneOutput"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"amount"}},{"kind":"Field","name":{"kind":"Name","value":"deliverables"}},{"kind":"Field","name":{"kind":"Name","value":"dueDate"}},{"kind":"Field","name":{"kind":"Name","value":"estimatedHours"}},{"kind":"Field","name":{"kind":"Name","value":"sequence"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"BidDetailFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Bid"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"BidBasicFields"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"coverLetter"}},{"kind":"Field","name":{"kind":"Name","value":"estimatedDuration"}},{"kind":"Field","name":{"kind":"Name","value":"estimatedHours"}},{"kind":"Field","name":{"kind":"Name","value":"hourlyRate"}},{"kind":"Field","name":{"kind":"Name","value":"proposedApproach"}},{"kind":"Field","name":{"kind":"Name","value":"responseTime"}},{"kind":"Field","name":{"kind":"Name","value":"milestones"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"BidMilestoneFields"}}]}}]}}]} as unknown as DocumentNode<UpdateBidMutation, UpdateBidMutationVariables>;
export const AcceptBidDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"AcceptBid"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"acceptBid"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"bid"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"BidBasicFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"message"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"BidBasicFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Bid"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"amount"}},{"kind":"Field","name":{"kind":"Name","value":"currency"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"paymentType"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"taskId"}},{"kind":"Field","name":{"kind":"Name","value":"freelancerId"}}]}}]} as unknown as DocumentNode<AcceptBidMutation, AcceptBidMutationVariables>;
export const WithdrawBidDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"WithdrawBid"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"reason"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"withdrawBid"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}},{"kind":"Argument","name":{"kind":"Name","value":"reason"},"value":{"kind":"Variable","name":{"kind":"Name","value":"reason"}}}]}]}}]} as unknown as DocumentNode<WithdrawBidMutation, WithdrawBidMutationVariables>;
export const TasksDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Tasks"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"page"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Float"}},"defaultValue":{"kind":"IntValue","value":"1"}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Float"}},"defaultValue":{"kind":"IntValue","value":"10"}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"searchTerm"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"categoryId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Float"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"skillId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Float"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"status"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"taskType"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"minBudget"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Float"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"maxBudget"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Float"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"includeDeleted"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Boolean"}},"defaultValue":{"kind":"BooleanValue","value":false}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"tasks"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"page"},"value":{"kind":"Variable","name":{"kind":"Name","value":"page"}}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}},{"kind":"Argument","name":{"kind":"Name","value":"searchTerm"},"value":{"kind":"Variable","name":{"kind":"Name","value":"searchTerm"}}},{"kind":"Argument","name":{"kind":"Name","value":"categoryId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"categoryId"}}},{"kind":"Argument","name":{"kind":"Name","value":"skillId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"skillId"}}},{"kind":"Argument","name":{"kind":"Name","value":"status"},"value":{"kind":"Variable","name":{"kind":"Name","value":"status"}}},{"kind":"Argument","name":{"kind":"Name","value":"taskType"},"value":{"kind":"Variable","name":{"kind":"Name","value":"taskType"}}},{"kind":"Argument","name":{"kind":"Name","value":"minBudget"},"value":{"kind":"Variable","name":{"kind":"Name","value":"minBudget"}}},{"kind":"Argument","name":{"kind":"Name","value":"maxBudget"},"value":{"kind":"Variable","name":{"kind":"Name","value":"maxBudget"}}},{"kind":"Argument","name":{"kind":"Name","value":"includeDeleted"},"value":{"kind":"Variable","name":{"kind":"Name","value":"includeDeleted"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"items"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TaskBasicFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"meta"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"currentPage"}},{"kind":"Field","name":{"kind":"Name","value":"itemCount"}},{"kind":"Field","name":{"kind":"Name","value":"itemsPerPage"}},{"kind":"Field","name":{"kind":"Name","value":"totalItems"}},{"kind":"Field","name":{"kind":"Name","value":"totalPages"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TaskBasicFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Task"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"budget"}},{"kind":"Field","name":{"kind":"Name","value":"budgetType"}},{"kind":"Field","name":{"kind":"Name","value":"taskType"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"clientId"}}]}}]} as unknown as DocumentNode<TasksQuery, TasksQueryVariables>;
export const TaskDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Task"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"task"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TaskFullFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TaskBasicFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Task"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"budget"}},{"kind":"Field","name":{"kind":"Name","value":"budgetType"}},{"kind":"Field","name":{"kind":"Name","value":"taskType"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"clientId"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TaskLocationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Task"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"isRemovals"}},{"kind":"Field","name":{"kind":"Name","value":"pickupLocation"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"latitude"}},{"kind":"Field","name":{"kind":"Name","value":"longitude"}},{"kind":"Field","name":{"kind":"Name","value":"locationLoaded"}},{"kind":"Field","name":{"kind":"Name","value":"zipCode"}}]}},{"kind":"Field","name":{"kind":"Name","value":"dropOffLocation"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"latitude"}},{"kind":"Field","name":{"kind":"Name","value":"longitude"}},{"kind":"Field","name":{"kind":"Name","value":"locationLoaded"}},{"kind":"Field","name":{"kind":"Name","value":"zipCode"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TaskDetailFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Task"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TaskBasicFields"}},{"kind":"FragmentSpread","name":{"kind":"Name","value":"TaskLocationFields"}},{"kind":"Field","name":{"kind":"Name","value":"dateRange"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"start"}},{"kind":"Field","name":{"kind":"Name","value":"end"}}]}},{"kind":"Field","name":{"kind":"Name","value":"deadlineDate"}},{"kind":"Field","name":{"kind":"Name","value":"estimatedHours"}},{"kind":"Field","name":{"kind":"Name","value":"freelancerId"}},{"kind":"Field","name":{"kind":"Name","value":"skillIds"}},{"kind":"Field","name":{"kind":"Name","value":"attachments"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"fileName"}},{"kind":"Field","name":{"kind":"Name","value":"fileUrl"}},{"kind":"Field","name":{"kind":"Name","value":"fileSize"}}]}},{"kind":"Field","name":{"kind":"Name","value":"imageUrls"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TaskFullFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Task"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TaskDetailFields"}},{"kind":"Field","name":{"kind":"Name","value":"categoryIds"}},{"kind":"Field","name":{"kind":"Name","value":"deletedAt"}}]}}]} as unknown as DocumentNode<TaskQuery, TaskQueryVariables>;
export const MyTasksDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"MyTasks"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"myTasks"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TaskDetailFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TaskBasicFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Task"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"budget"}},{"kind":"Field","name":{"kind":"Name","value":"budgetType"}},{"kind":"Field","name":{"kind":"Name","value":"taskType"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"clientId"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TaskLocationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Task"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"isRemovals"}},{"kind":"Field","name":{"kind":"Name","value":"pickupLocation"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"latitude"}},{"kind":"Field","name":{"kind":"Name","value":"longitude"}},{"kind":"Field","name":{"kind":"Name","value":"locationLoaded"}},{"kind":"Field","name":{"kind":"Name","value":"zipCode"}}]}},{"kind":"Field","name":{"kind":"Name","value":"dropOffLocation"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"latitude"}},{"kind":"Field","name":{"kind":"Name","value":"longitude"}},{"kind":"Field","name":{"kind":"Name","value":"locationLoaded"}},{"kind":"Field","name":{"kind":"Name","value":"zipCode"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TaskDetailFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Task"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TaskBasicFields"}},{"kind":"FragmentSpread","name":{"kind":"Name","value":"TaskLocationFields"}},{"kind":"Field","name":{"kind":"Name","value":"dateRange"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"start"}},{"kind":"Field","name":{"kind":"Name","value":"end"}}]}},{"kind":"Field","name":{"kind":"Name","value":"deadlineDate"}},{"kind":"Field","name":{"kind":"Name","value":"estimatedHours"}},{"kind":"Field","name":{"kind":"Name","value":"freelancerId"}},{"kind":"Field","name":{"kind":"Name","value":"skillIds"}},{"kind":"Field","name":{"kind":"Name","value":"attachments"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"fileName"}},{"kind":"Field","name":{"kind":"Name","value":"fileUrl"}},{"kind":"Field","name":{"kind":"Name","value":"fileSize"}}]}},{"kind":"Field","name":{"kind":"Name","value":"imageUrls"}}]}}]} as unknown as DocumentNode<MyTasksQuery, MyTasksQueryVariables>;
export const CreateTaskDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateTask"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateTaskInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createTask"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TaskDetailFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TaskBasicFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Task"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"budget"}},{"kind":"Field","name":{"kind":"Name","value":"budgetType"}},{"kind":"Field","name":{"kind":"Name","value":"taskType"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"clientId"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TaskLocationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Task"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"isRemovals"}},{"kind":"Field","name":{"kind":"Name","value":"pickupLocation"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"latitude"}},{"kind":"Field","name":{"kind":"Name","value":"longitude"}},{"kind":"Field","name":{"kind":"Name","value":"locationLoaded"}},{"kind":"Field","name":{"kind":"Name","value":"zipCode"}}]}},{"kind":"Field","name":{"kind":"Name","value":"dropOffLocation"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"latitude"}},{"kind":"Field","name":{"kind":"Name","value":"longitude"}},{"kind":"Field","name":{"kind":"Name","value":"locationLoaded"}},{"kind":"Field","name":{"kind":"Name","value":"zipCode"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TaskDetailFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Task"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TaskBasicFields"}},{"kind":"FragmentSpread","name":{"kind":"Name","value":"TaskLocationFields"}},{"kind":"Field","name":{"kind":"Name","value":"dateRange"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"start"}},{"kind":"Field","name":{"kind":"Name","value":"end"}}]}},{"kind":"Field","name":{"kind":"Name","value":"deadlineDate"}},{"kind":"Field","name":{"kind":"Name","value":"estimatedHours"}},{"kind":"Field","name":{"kind":"Name","value":"freelancerId"}},{"kind":"Field","name":{"kind":"Name","value":"skillIds"}},{"kind":"Field","name":{"kind":"Name","value":"attachments"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"fileName"}},{"kind":"Field","name":{"kind":"Name","value":"fileUrl"}},{"kind":"Field","name":{"kind":"Name","value":"fileSize"}}]}},{"kind":"Field","name":{"kind":"Name","value":"imageUrls"}}]}}]} as unknown as DocumentNode<CreateTaskMutation, CreateTaskMutationVariables>;
export const UpdateTaskDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateTask"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UpdateTaskInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateTask"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}},{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TaskDetailFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TaskBasicFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Task"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"budget"}},{"kind":"Field","name":{"kind":"Name","value":"budgetType"}},{"kind":"Field","name":{"kind":"Name","value":"taskType"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"clientId"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TaskLocationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Task"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"isRemovals"}},{"kind":"Field","name":{"kind":"Name","value":"pickupLocation"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"latitude"}},{"kind":"Field","name":{"kind":"Name","value":"longitude"}},{"kind":"Field","name":{"kind":"Name","value":"locationLoaded"}},{"kind":"Field","name":{"kind":"Name","value":"zipCode"}}]}},{"kind":"Field","name":{"kind":"Name","value":"dropOffLocation"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"latitude"}},{"kind":"Field","name":{"kind":"Name","value":"longitude"}},{"kind":"Field","name":{"kind":"Name","value":"locationLoaded"}},{"kind":"Field","name":{"kind":"Name","value":"zipCode"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TaskDetailFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Task"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TaskBasicFields"}},{"kind":"FragmentSpread","name":{"kind":"Name","value":"TaskLocationFields"}},{"kind":"Field","name":{"kind":"Name","value":"dateRange"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"start"}},{"kind":"Field","name":{"kind":"Name","value":"end"}}]}},{"kind":"Field","name":{"kind":"Name","value":"deadlineDate"}},{"kind":"Field","name":{"kind":"Name","value":"estimatedHours"}},{"kind":"Field","name":{"kind":"Name","value":"freelancerId"}},{"kind":"Field","name":{"kind":"Name","value":"skillIds"}},{"kind":"Field","name":{"kind":"Name","value":"attachments"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"fileName"}},{"kind":"Field","name":{"kind":"Name","value":"fileUrl"}},{"kind":"Field","name":{"kind":"Name","value":"fileSize"}}]}},{"kind":"Field","name":{"kind":"Name","value":"imageUrls"}}]}}]} as unknown as DocumentNode<UpdateTaskMutation, UpdateTaskMutationVariables>;
export const ChangeTaskStatusDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ChangeTaskStatus"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"taskId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"status"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"TaskStatus"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"changeTaskStatus"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"taskId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"taskId"}}},{"kind":"Argument","name":{"kind":"Name","value":"status"},"value":{"kind":"Variable","name":{"kind":"Name","value":"status"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"status"}}]}}]}}]} as unknown as DocumentNode<ChangeTaskStatusMutation, ChangeTaskStatusMutationVariables>;
export const DeleteTaskDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DeleteTask"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"deleteTask"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}]}]}}]} as unknown as DocumentNode<DeleteTaskMutation, DeleteTaskMutationVariables>;