import gql from 'graphql-tag';
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
  DateTime: { input: string; output: string; }
  JSON: { input: any; output: any; }
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

export type CreateTaskFromTemplateInput = {
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
  createTaskTemplate: TaskTemplate;
  deleteTask: Scalars['Boolean']['output'];
  deleteTaskTemplate: Scalars['Boolean']['output'];
  login: Auth;
  register: Auth;
  rejectBid: BidResponse;
  updateBid: BidResponse;
  updateTask: Task;
  updateTaskTemplate: TaskTemplate;
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
  input?: InputMaybe<CreateTaskFromTemplateInput>;
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
  taskTemplate: TaskTemplate;
  taskTemplates: Array<TaskTemplate>;
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
  categoryId?: InputMaybe<Scalars['Int']['input']>;
  includeDeleted?: InputMaybe<Scalars['Boolean']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  maxBudget?: InputMaybe<Scalars['Float']['input']>;
  minBudget?: InputMaybe<Scalars['Float']['input']>;
  page?: InputMaybe<Scalars['Int']['input']>;
  searchTerm?: InputMaybe<Scalars['String']['input']>;
  skillId?: InputMaybe<Scalars['Int']['input']>;
  status?: InputMaybe<TaskStatus>;
  taskType?: InputMaybe<TaskType>;
};


export type QueryUserArgs = {
  id: Scalars['Int']['input'];
};


export type QueryVerifyTokenArgs = {
  token: Scalars['String']['input'];
};

export enum RecurrenceType {
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

export type TaskTemplate = {
  __typename?: 'TaskTemplate';
  createdAt: Scalars['DateTime']['output'];
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  isRecurring: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  recurrenceData?: Maybe<Scalars['JSON']['output']>;
  recurrenceType?: Maybe<RecurrenceType>;
  templateData: Scalars['JSON']['output'];
  updatedAt: Scalars['DateTime']['output'];
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

export type BidMilestoneFieldsFragment = { __typename?: 'BidMilestoneOutput', title: string, description: string, amount: number, deliverables?: string | null, dueDate?: string | null, estimatedHours?: number | null, sequence?: number | null };

export type BidBasicFieldsFragment = { __typename?: 'Bid', id: string, amount: number, currency?: string | null, status: BidStatus, paymentType: BidPaymentType, visibility: BidVisibility, createdAt: string, updatedAt: string, taskId: number, freelancerId: number };

export type BidDetailFieldsFragment = (
  { __typename?: 'Bid', description?: string | null, coverLetter?: string | null, estimatedDuration?: string | null, estimatedHours?: number | null, hourlyRate?: number | null, proposedApproach?: string | null, responseTime?: number | null, milestones?: Array<(
    { __typename?: 'BidMilestoneOutput' }
    & BidMilestoneFieldsFragment
  )> | null }
  & BidBasicFieldsFragment
);

export type TaskBasicFieldsFragment = { __typename?: 'Task', id: string, title: string, description: string, status: TaskStatus, budget?: number | null, budgetType: BudgetType, taskType: TaskType, visibility: TaskVisibility, createdAt: string, updatedAt: string, clientId: number };

export type TaskLocationFieldsFragment = { __typename?: 'Task', isRemovals: boolean, pickupLocation?: { __typename?: 'LocationOutput', displayName: string, latitude: number, longitude: number, locationLoaded: boolean, zipCode?: string | null } | null, dropOffLocation?: { __typename?: 'LocationOutput', displayName: string, latitude: number, longitude: number, locationLoaded: boolean, zipCode?: string | null } | null };

export type TaskDetailFieldsFragment = (
  { __typename?: 'Task', deadlineDate?: string | null, estimatedHours?: number | null, freelancerId?: number | null, skillIds?: Array<number> | null, imageUrls?: Array<string> | null, dateRange?: { __typename?: 'DateRangeOutput', start?: string | null, end?: string | null } | null, attachments?: Array<{ __typename?: 'AttachmentOutput', fileName: string, fileUrl: string, fileSize?: number | null }> | null }
  & TaskBasicFieldsFragment
  & TaskLocationFieldsFragment
);

export type TaskFullFieldsFragment = (
  { __typename?: 'Task', categoryIds?: Array<number> | null, deletedAt?: string | null }
  & TaskDetailFieldsFragment
);

export type UserBasicFieldsFragment = { __typename?: 'User', id: string, name?: string | null, email?: string | null, userRole: UserRole, status: UserStatus, profilePicture?: string | null };

export type UserProfileFieldsFragment = (
  { __typename?: 'User', onboardingComplete: boolean, verificationLevel: VerificationLevel, biddingAllowed: boolean, lastLoginAt?: string | null, createdAt: string, updatedAt: string }
  & UserBasicFieldsFragment
);

export type UserExtendedFieldsFragment = (
  { __typename?: 'User', isEmailVerified: boolean, mobileNumber?: string | null, dob?: string | null }
  & UserProfileFieldsFragment
);

export type LoginMutationVariables = Exact<{
  input: LoginInput;
}>;


export type LoginMutation = { __typename?: 'Mutation', login: { __typename?: 'Auth', access_token: string, expires_in: number, token_type: string, user: (
      { __typename?: 'User' }
      & UserProfileFieldsFragment
    ) } };

export type RegisterMutationVariables = Exact<{
  input: RegisterInput;
}>;


export type RegisterMutation = { __typename?: 'Mutation', register: { __typename?: 'Auth', access_token: string, expires_in: number, token_type: string, user: (
      { __typename?: 'User' }
      & UserProfileFieldsFragment
    ) } };

export type ChangePasswordMutationVariables = Exact<{
  input: ChangePasswordInput;
}>;


export type ChangePasswordMutation = { __typename?: 'Mutation', changePassword: boolean };

export type MeQueryVariables = Exact<{ [key: string]: never; }>;


export type MeQuery = { __typename?: 'Query', me: (
    { __typename?: 'User' }
    & UserProfileFieldsFragment
  ) };

export type VerifyTokenQueryVariables = Exact<{
  token: Scalars['String']['input'];
}>;


export type VerifyTokenQuery = { __typename?: 'Query', verifyToken: { __typename?: 'TokenVerificationResult', isValid: boolean, user?: (
      { __typename?: 'User' }
      & UserProfileFieldsFragment
    ) | null } };

export type BidsQueryVariables = Exact<{ [key: string]: never; }>;


export type BidsQuery = { __typename?: 'Query', bids: Array<(
    { __typename?: 'Bid' }
    & BidBasicFieldsFragment
  )> };

export type BidQueryVariables = Exact<{
  id: Scalars['Int']['input'];
}>;


export type BidQuery = { __typename?: 'Query', bid: (
    { __typename?: 'Bid' }
    & BidDetailFieldsFragment
  ) };

export type BidsByTaskQueryVariables = Exact<{
  taskId: Scalars['Int']['input'];
}>;


export type BidsByTaskQuery = { __typename?: 'Query', bidsByTask: Array<(
    { __typename?: 'Bid' }
    & BidDetailFieldsFragment
  )> };

export type CreateBidMutationVariables = Exact<{
  input: CreateBidInput;
}>;


export type CreateBidMutation = { __typename?: 'Mutation', createBid: { __typename?: 'BidResponse', message: string, bid: (
      { __typename?: 'Bid' }
      & BidDetailFieldsFragment
    ) } };

export type UpdateBidMutationVariables = Exact<{
  id: Scalars['Int']['input'];
  input: UpdateBidInput;
}>;


export type UpdateBidMutation = { __typename?: 'Mutation', updateBid: { __typename?: 'BidResponse', message: string, bid: (
      { __typename?: 'Bid' }
      & BidDetailFieldsFragment
    ) } };

export type AcceptBidMutationVariables = Exact<{
  id: Scalars['Int']['input'];
}>;


export type AcceptBidMutation = { __typename?: 'Mutation', acceptBid: { __typename?: 'BidResponse', message: string, bid: (
      { __typename?: 'Bid' }
      & BidBasicFieldsFragment
    ) } };

export type WithdrawBidMutationVariables = Exact<{
  id: Scalars['Int']['input'];
  reason?: InputMaybe<Scalars['String']['input']>;
}>;


export type WithdrawBidMutation = { __typename?: 'Mutation', withdrawBid: boolean };

export type TasksQueryVariables = Exact<{
  page?: InputMaybe<Scalars['Int']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  searchTerm?: InputMaybe<Scalars['String']['input']>;
  categoryId?: InputMaybe<Scalars['Int']['input']>;
  skillId?: InputMaybe<Scalars['Int']['input']>;
  status?: InputMaybe<TaskStatus>;
  taskType?: InputMaybe<TaskType>;
  minBudget?: InputMaybe<Scalars['Float']['input']>;
  maxBudget?: InputMaybe<Scalars['Float']['input']>;
  includeDeleted?: InputMaybe<Scalars['Boolean']['input']>;
}>;


export type TasksQuery = { __typename?: 'Query', tasks: { __typename?: 'PaginatedTasksResponse', items: Array<(
      { __typename?: 'Task' }
      & TaskBasicFieldsFragment
    )>, meta: { __typename?: 'PaginationMeta', currentPage: number, itemCount: number, itemsPerPage: number, totalItems: number, totalPages: number } } };

export type TaskQueryVariables = Exact<{
  id: Scalars['Int']['input'];
}>;


export type TaskQuery = { __typename?: 'Query', task: (
    { __typename?: 'Task' }
    & TaskFullFieldsFragment
  ) };

export type MyTasksQueryVariables = Exact<{ [key: string]: never; }>;


export type MyTasksQuery = { __typename?: 'Query', myTasks: Array<(
    { __typename?: 'Task' }
    & TaskDetailFieldsFragment
  )> };

export type CreateTaskMutationVariables = Exact<{
  input: CreateTaskInput;
}>;


export type CreateTaskMutation = { __typename?: 'Mutation', createTask: (
    { __typename?: 'Task' }
    & TaskDetailFieldsFragment
  ) };

export type UpdateTaskMutationVariables = Exact<{
  id: Scalars['Int']['input'];
  input: UpdateTaskInput;
}>;


export type UpdateTaskMutation = { __typename?: 'Mutation', updateTask: (
    { __typename?: 'Task' }
    & TaskDetailFieldsFragment
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

export const BidBasicFields = /*#__PURE__*/ gql`
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
export const BidMilestoneFields = /*#__PURE__*/ gql`
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
export const BidDetailFields = /*#__PURE__*/ gql`
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
export const TaskBasicFields = /*#__PURE__*/ gql`
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
export const TaskLocationFields = /*#__PURE__*/ gql`
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
export const TaskDetailFields = /*#__PURE__*/ gql`
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
export const TaskFullFields = /*#__PURE__*/ gql`
    fragment TaskFullFields on Task {
  ...TaskDetailFields
  categoryIds
  deletedAt
}
    `;
export const UserBasicFields = /*#__PURE__*/ gql`
    fragment UserBasicFields on User {
  id
  name
  email
  userRole
  status
  profilePicture
}
    `;
export const UserProfileFields = /*#__PURE__*/ gql`
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
export const UserExtendedFields = /*#__PURE__*/ gql`
    fragment UserExtendedFields on User {
  ...UserProfileFields
  isEmailVerified
  mobileNumber
  dob
}
    `;
export const Login = /*#__PURE__*/ gql`
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
    ${UserProfileFields}
${UserBasicFields}`;
export const Register = /*#__PURE__*/ gql`
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
    ${UserProfileFields}
${UserBasicFields}`;
export const ChangePassword = /*#__PURE__*/ gql`
    mutation ChangePassword($input: ChangePasswordInput!) {
  changePassword(input: $input)
}
    `;
export const Me = /*#__PURE__*/ gql`
    query Me {
  me {
    ...UserProfileFields
  }
}
    ${UserProfileFields}
${UserBasicFields}`;
export const VerifyToken = /*#__PURE__*/ gql`
    query VerifyToken($token: String!) {
  verifyToken(token: $token) {
    isValid
    user {
      ...UserProfileFields
    }
  }
}
    ${UserProfileFields}
${UserBasicFields}`;
export const Bids = /*#__PURE__*/ gql`
    query Bids {
  bids {
    ...BidBasicFields
  }
}
    ${BidBasicFields}`;
export const Bid = /*#__PURE__*/ gql`
    query Bid($id: Int!) {
  bid(id: $id) {
    ...BidDetailFields
  }
}
    ${BidDetailFields}
${BidBasicFields}
${BidMilestoneFields}`;
export const BidsByTask = /*#__PURE__*/ gql`
    query BidsByTask($taskId: Int!) {
  bidsByTask(taskId: $taskId) {
    ...BidDetailFields
  }
}
    ${BidDetailFields}
${BidBasicFields}
${BidMilestoneFields}`;
export const CreateBid = /*#__PURE__*/ gql`
    mutation CreateBid($input: CreateBidInput!) {
  createBid(input: $input) {
    bid {
      ...BidDetailFields
    }
    message
  }
}
    ${BidDetailFields}
${BidBasicFields}
${BidMilestoneFields}`;
export const UpdateBid = /*#__PURE__*/ gql`
    mutation UpdateBid($id: Int!, $input: UpdateBidInput!) {
  updateBid(id: $id, input: $input) {
    bid {
      ...BidDetailFields
    }
    message
  }
}
    ${BidDetailFields}
${BidBasicFields}
${BidMilestoneFields}`;
export const AcceptBid = /*#__PURE__*/ gql`
    mutation AcceptBid($id: Int!) {
  acceptBid(id: $id) {
    bid {
      ...BidBasicFields
    }
    message
  }
}
    ${BidBasicFields}`;
export const WithdrawBid = /*#__PURE__*/ gql`
    mutation WithdrawBid($id: Int!, $reason: String) {
  withdrawBid(id: $id, reason: $reason)
}
    `;
export const Tasks = /*#__PURE__*/ gql`
    query Tasks($page: Int = 1, $limit: Int = 10, $searchTerm: String, $categoryId: Int, $skillId: Int, $status: TaskStatus, $taskType: TaskType, $minBudget: Float, $maxBudget: Float, $includeDeleted: Boolean = false) {
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
    ${TaskBasicFields}`;
export const Task = /*#__PURE__*/ gql`
    query Task($id: Int!) {
  task(id: $id) {
    ...TaskFullFields
  }
}
    ${TaskFullFields}
${TaskDetailFields}
${TaskBasicFields}
${TaskLocationFields}`;
export const MyTasks = /*#__PURE__*/ gql`
    query MyTasks {
  myTasks {
    ...TaskDetailFields
  }
}
    ${TaskDetailFields}
${TaskBasicFields}
${TaskLocationFields}`;
export const CreateTask = /*#__PURE__*/ gql`
    mutation CreateTask($input: CreateTaskInput!) {
  createTask(input: $input) {
    ...TaskDetailFields
  }
}
    ${TaskDetailFields}
${TaskBasicFields}
${TaskLocationFields}`;
export const UpdateTask = /*#__PURE__*/ gql`
    mutation UpdateTask($id: Int!, $input: UpdateTaskInput!) {
  updateTask(id: $id, input: $input) {
    ...TaskDetailFields
  }
}
    ${TaskDetailFields}
${TaskBasicFields}
${TaskLocationFields}`;
export const ChangeTaskStatus = /*#__PURE__*/ gql`
    mutation ChangeTaskStatus($taskId: ID!, $status: TaskStatus!) {
  changeTaskStatus(taskId: $taskId, status: $status) {
    id
    status
  }
}
    `;
export const DeleteTask = /*#__PURE__*/ gql`
    mutation DeleteTask($id: Int!) {
  deleteTask(id: $id)
}
    `;