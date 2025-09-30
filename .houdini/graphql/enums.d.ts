
type ValuesOf<T> = T[keyof T]
	
export declare const BidPaymentType: {
    readonly FIXED: "FIXED";
    readonly HOURLY: "HOURLY";
    readonly MILESTONE_BASED: "MILESTONE_BASED";
}

export type BidPaymentType$options = ValuesOf<typeof BidPaymentType>
 
export declare const BidStatus: {
    readonly ACCEPTED: "ACCEPTED";
    readonly APPROVED: "APPROVED";
    readonly CLIENT_CANCELLED: "CLIENT_CANCELLED";
    readonly EXPIRED: "EXPIRED";
    readonly FREELANCER_CANCELLED: "FREELANCER_CANCELLED";
    readonly NEGOTIATION: "NEGOTIATION";
    readonly PENDING: "PENDING";
    readonly REJECTED: "REJECTED";
    readonly WITHDRAWN: "WITHDRAWN";
}

export type BidStatus$options = ValuesOf<typeof BidStatus>
 
export declare const BidVisibility: {
    readonly FEATURED: "FEATURED";
    readonly PRIVATE: "PRIVATE";
    readonly PUBLIC: "PUBLIC";
}

export type BidVisibility$options = ValuesOf<typeof BidVisibility>
 
export declare const BudgetType: {
    readonly FIXED: "FIXED";
    readonly HOURLY: "HOURLY";
    readonly RANGE: "RANGE";
}

export type BudgetType$options = ValuesOf<typeof BudgetType>
 
/** The type of budget (fixed or hourly) */
export declare const BudgetTypeEnum: {
    readonly FIXED: "FIXED";
    readonly HOURLY: "HOURLY";
}

/** The type of budget (fixed or hourly) */
export type BudgetTypeEnum$options = ValuesOf<typeof BudgetTypeEnum>
 
export declare const DedupeMatchMode: {
    readonly Variables: "Variables";
    readonly Operation: "Operation";
    readonly None: "None";
}

export type DedupeMatchMode$options = ValuesOf<typeof DedupeMatchMode>
 
/** Device platform types */
export declare const DevicePlatform: {
    readonly ANDROID: "ANDROID";
    readonly IOS: "IOS";
    readonly WEB: "WEB";
}

/** Device platform types */
export type DevicePlatform$options = ValuesOf<typeof DevicePlatform>
 
/** The frequency of notifications for saved searches */
export declare const NotificationFrequency: {
    readonly DAILY: "DAILY";
    readonly INSTANT: "INSTANT";
    readonly WEEKLY: "WEEKLY";
}

/** The frequency of notifications for saved searches */
export type NotificationFrequency$options = ValuesOf<typeof NotificationFrequency>
 
export declare const RecurrenceFrequency: {
    readonly BIWEEKLY: "BIWEEKLY";
    readonly CUSTOM: "CUSTOM";
    readonly DAILY: "DAILY";
    readonly MONTHLY: "MONTHLY";
    readonly WEEKLY: "WEEKLY";
}

export type RecurrenceFrequency$options = ValuesOf<typeof RecurrenceFrequency>
 
export declare const RecurrenceType: {
    readonly BIWEEKLY: "BIWEEKLY";
    readonly CUSTOM: "CUSTOM";
    readonly DAILY: "DAILY";
    readonly MONTHLY: "MONTHLY";
    readonly WEEKLY: "WEEKLY";
}

export type RecurrenceType$options = ValuesOf<typeof RecurrenceType>
 
export declare const SkillImportance: {
    readonly BONUS: "BONUS";
    readonly PREFERRED: "PREFERRED";
    readonly REQUIRED: "REQUIRED";
}

export type SkillImportance$options = ValuesOf<typeof SkillImportance>
 
export declare const TaskStatus: {
    readonly CANCELLED: "CANCELLED";
    readonly COMPLETED: "COMPLETED";
    readonly DISPUTED: "DISPUTED";
    readonly DRAFT: "DRAFT";
    readonly IN_PROGRESS: "IN_PROGRESS";
    readonly OPEN: "OPEN";
}

export type TaskStatus$options = ValuesOf<typeof TaskStatus>
 
export declare const TaskType: {
    readonly IN_PERSON: "IN_PERSON";
    readonly REMOTE: "REMOTE";
}

export type TaskType$options = ValuesOf<typeof TaskType>
 
export declare const TaskVisibility: {
    readonly FOLLOWERS_ONLY: "FOLLOWERS_ONLY";
    readonly INVITE_ONLY: "INVITE_ONLY";
    readonly PRIVATE: "PRIVATE";
    readonly PUBLIC: "PUBLIC";
}

export type TaskVisibility$options = ValuesOf<typeof TaskVisibility>
 
export declare const UserRole: {
    readonly ADMIN: "ADMIN";
    readonly USER: "USER";
}

export type UserRole$options = ValuesOf<typeof UserRole>
 
export declare const UserStatus: {
    readonly ACTIVE: "ACTIVE";
    readonly BANNED: "BANNED";
    readonly INACTIVE: "INACTIVE";
    readonly SUSPENDED: "SUSPENDED";
}

export type UserStatus$options = ValuesOf<typeof UserStatus>
 