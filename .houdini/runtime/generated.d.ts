import type { Record } from "./public/record";
import { MyDevices$result, MyDevices$input } from "../../$houdini/artifacts/MyDevices";
import { MyDevicesStore } from "../plugins/houdini-svelte/stores/MyDevices";
import { GetUsernameHistory$result, GetUsernameHistory$input } from "../../$houdini/artifacts/GetUsernameHistory";
import { GetUsernameHistoryStore } from "../plugins/houdini-svelte/stores/GetUsernameHistory";
import { CheckUsernameAvailability$result, CheckUsernameAvailability$input } from "../../$houdini/artifacts/CheckUsernameAvailability";
import { CheckUsernameAvailabilityStore } from "../plugins/houdini-svelte/stores/CheckUsernameAvailability";
import { MyNotificationPreferences$result, MyNotificationPreferences$input } from "../../$houdini/artifacts/MyNotificationPreferences";
import { MyNotificationPreferencesStore } from "../plugins/houdini-svelte/stores/MyNotificationPreferences";
import { VerifyToken$result, VerifyToken$input } from "../../$houdini/artifacts/VerifyToken";
import { VerifyTokenStore } from "../plugins/houdini-svelte/stores/VerifyToken";
import { CheckOnboardingStatus$result, CheckOnboardingStatus$input } from "../../$houdini/artifacts/CheckOnboardingStatus";
import { CheckOnboardingStatusStore } from "../plugins/houdini-svelte/stores/CheckOnboardingStatus";
import { Me$result, Me$input } from "../../$houdini/artifacts/Me";
import { MeStore } from "../plugins/houdini-svelte/stores/Me";
import { MyBids$result, MyBids$input } from "../../$houdini/artifacts/MyBids";
import { MyBidsStore } from "../plugins/houdini-svelte/stores/MyBids";
import { SearchTasks$result, SearchTasks$input } from "../../$houdini/artifacts/SearchTasks";
import { SearchTasksStore } from "../plugins/houdini-svelte/stores/SearchTasks";
import { Tasks$result, Tasks$input } from "../../$houdini/artifacts/Tasks";
import { TasksStore } from "../plugins/houdini-svelte/stores/Tasks";
import { MyTaskTemplates$result, MyTaskTemplates$input } from "../../$houdini/artifacts/MyTaskTemplates";
import { MyTaskTemplatesStore } from "../plugins/houdini-svelte/stores/MyTaskTemplates";
import type { TaskType } from "$houdini/graphql/enums";
import type { TaskStatus } from "$houdini/graphql/enums";
import type { ValueOf } from "$houdini/runtime/lib/types";
import type { BudgetType } from "$houdini/graphql/enums";

type DateRangeInput = {
    end?: string | null | undefined;
    start?: string | null | undefined;
};

type SearchTasksDto = {
    budgetType?: (ValueOf<typeof BudgetType>)[] | null | undefined;
    categoryId?: number | null | undefined;
    categoryIds?: (number)[] | null | undefined;
    deadlineAfter?: string | null | undefined;
    deadlineBefore?: string | null | undefined;
    deadlineDateRange?: DateRangeInput | null | undefined;
    includeDeleted?: boolean | null | undefined;
    latitude?: number | null | undefined;
    limit?: number | null | undefined;
    location?: string | null | undefined;
    longitude?: number | null | undefined;
    maxBudget?: number | null | undefined;
    minBudget?: number | null | undefined;
    onlyBoostedTasks?: boolean | null | undefined;
    page?: number | null | undefined;
    radius?: number | null | undefined;
    search?: string | null | undefined;
    searchTerm?: string | null | undefined;
    skillIds?: (number)[] | null | undefined;
    sortBy?: string | null | undefined;
    sortOrder?: string | null | undefined;
    status?: (ValueOf<typeof TaskStatus>)[] | null | undefined;
    taskType?: (ValueOf<typeof TaskType>)[] | null | undefined;
};

export declare type CacheTypeDef = {
    types: {
        AttachmentOutput: {
            idFields: never;
            fields: {
                fileName: {
                    type: string;
                    args: never;
                };
                fileSize: {
                    type: number | null;
                    args: never;
                };
                fileUrl: {
                    type: string;
                    args: never;
                };
            };
            fragments: [];
        };
        Auth: {
            idFields: never;
            fields: {
                access_token: {
                    type: string;
                    args: never;
                };
                expires_in: {
                    type: number;
                    args: never;
                };
                token_type: {
                    type: string;
                    args: never;
                };
                user: {
                    type: Record<CacheTypeDef, "User">;
                    args: never;
                };
            };
            fragments: [];
        };
        Bid: {
            idFields: {
                id: string;
            };
            fields: {
                amount: {
                    type: number;
                    args: never;
                };
                clicks: {
                    type: number;
                    args: never;
                };
                clientResponse: {
                    type: string | null;
                    args: never;
                };
                clientViewed: {
                    type: boolean;
                    args: never;
                };
                clientViewedAt: {
                    type: string | null;
                    args: never;
                };
                competitiveScore: {
                    type: number | null;
                    args: never;
                };
                coverLetter: {
                    type: string | null;
                    args: never;
                };
                createdAt: {
                    type: string;
                    args: never;
                };
                currency: {
                    type: string | null;
                    args: never;
                };
                description: {
                    type: string | null;
                    args: never;
                };
                estimatedDuration: {
                    type: string | null;
                    args: never;
                };
                estimatedHours: {
                    type: number | null;
                    args: never;
                };
                expiresAt: {
                    type: string | null;
                    args: never;
                };
                featured: {
                    type: boolean;
                    args: never;
                };
                freelancerId: {
                    type: number | null;
                    args: never;
                };
                hourlyRate: {
                    type: number | null;
                    args: never;
                };
                id: {
                    type: string;
                    args: never;
                };
                impressions: {
                    type: number;
                    args: never;
                };
                isWithdrawn: {
                    type: boolean;
                    args: never;
                };
                milestones: {
                    type: (Record<CacheTypeDef, "BidMilestoneOutput">)[] | null;
                    args: never;
                };
                paymentType: {
                    type: BidPaymentType;
                    args: never;
                };
                proposedApproach: {
                    type: string | null;
                    args: never;
                };
                rank: {
                    type: number | null;
                    args: never;
                };
                responseTime: {
                    type: number | null;
                    args: never;
                };
                status: {
                    type: BidStatus;
                    args: never;
                };
                updatedAt: {
                    type: string;
                    args: never;
                };
                userProfile: {
                    type: Record<CacheTypeDef, "UserProfileOutput"> | null;
                    args: never;
                };
                userProfileId: {
                    type: number | null;
                    args: never;
                };
                visibility: {
                    type: BidVisibility;
                    args: never;
                };
                withdrawnReason: {
                    type: string | null;
                    args: never;
                };
            };
            fragments: [];
        };
        BidMilestoneOutput: {
            idFields: never;
            fields: {
                amount: {
                    type: number;
                    args: never;
                };
                deliverables: {
                    type: string | null;
                    args: never;
                };
                description: {
                    type: string;
                    args: never;
                };
                dueDate: {
                    type: string | null;
                    args: never;
                };
                estimatedHours: {
                    type: number | null;
                    args: never;
                };
                sequence: {
                    type: number | null;
                    args: never;
                };
                title: {
                    type: string;
                    args: never;
                };
            };
            fragments: [];
        };
        BidPaginationDto: {
            idFields: never;
            fields: {
                hasNextPage: {
                    type: boolean;
                    args: never;
                };
                hasPreviousPage: {
                    type: boolean;
                    args: never;
                };
                limit: {
                    type: number;
                    args: never;
                };
                page: {
                    type: number;
                    args: never;
                };
                total: {
                    type: number;
                    args: never;
                };
                totalPages: {
                    type: number;
                    args: never;
                };
            };
            fragments: [];
        };
        BidResponse: {
            idFields: never;
            fields: {
                bid: {
                    type: Record<CacheTypeDef, "Bid">;
                    args: never;
                };
                message: {
                    type: string;
                    args: never;
                };
            };
            fragments: [];
        };
        BidsWithPaginationDto: {
            idFields: never;
            fields: {
                data: {
                    type: (Record<CacheTypeDef, "Bid">)[];
                    args: never;
                };
                pagination: {
                    type: Record<CacheTypeDef, "BidPaginationDto">;
                    args: never;
                };
            };
            fragments: [];
        };
        Category: {
            idFields: {
                id: string;
            };
            fields: {
                createdAt: {
                    type: string;
                    args: never;
                };
                description: {
                    type: string | null;
                    args: never;
                };
                displayOrder: {
                    type: number;
                    args: never;
                };
                icon: {
                    type: string | null;
                    args: never;
                };
                id: {
                    type: string;
                    args: never;
                };
                isActive: {
                    type: boolean;
                    args: never;
                };
                name: {
                    type: string;
                    args: never;
                };
                parentId: {
                    type: number | null;
                    args: never;
                };
                slug: {
                    type: string;
                    args: never;
                };
                updatedAt: {
                    type: string;
                    args: never;
                };
            };
            fragments: [];
        };
        DateRangeOutput: {
            idFields: never;
            fields: {
                end: {
                    type: string | null;
                    args: never;
                };
                start: {
                    type: string | null;
                    args: never;
                };
            };
            fragments: [];
        };
        DeviceStatistics: {
            idFields: never;
            fields: {
                activeDevices: {
                    type: number;
                    args: never;
                };
                platformDistribution: {
                    type: (Record<CacheTypeDef, "PlatformDistribution">)[];
                    args: never;
                };
                totalDevices: {
                    type: number;
                    args: never;
                };
            };
            fragments: [];
        };
        LegacyEncryptedDataDto: {
            idFields: never;
            fields: {
                authTag: {
                    type: string;
                    args: never;
                };
                encryptedPrivateKey: {
                    type: string;
                    args: never;
                };
                iterations: {
                    type: number;
                    args: never;
                };
                iv: {
                    type: string;
                    args: never;
                };
                salt: {
                    type: string;
                    args: never;
                };
            };
            fragments: [];
        };
        LocationOutput: {
            idFields: never;
            fields: {
                displayName: {
                    type: string | null;
                    args: never;
                };
                latitude: {
                    type: number | null;
                    args: never;
                };
                locationLoaded: {
                    type: boolean;
                    args: never;
                };
                longitude: {
                    type: number | null;
                    args: never;
                };
                zipCode: {
                    type: string | null;
                    args: never;
                };
            };
            fragments: [];
        };
        NotificationResponse: {
            idFields: never;
            fields: {
                message: {
                    type: string;
                    args: never;
                };
                success: {
                    type: boolean;
                    args: never;
                };
            };
            fragments: [];
        };
        OnboardingStatusDto: {
            idFields: never;
            fields: {
                isComplete: {
                    type: boolean;
                    args: never;
                };
                missingFields: {
                    type: (string)[];
                    args: never;
                };
            };
            fragments: [];
        };
        PaginatedTasksResponse: {
            idFields: never;
            fields: {
                items: {
                    type: (Record<CacheTypeDef, "Task">)[];
                    args: never;
                };
                meta: {
                    type: Record<CacheTypeDef, "PaginationMeta">;
                    args: never;
                };
            };
            fragments: [];
        };
        PaginationMeta: {
            idFields: never;
            fields: {
                currentPage: {
                    type: number;
                    args: never;
                };
                hasNextPage: {
                    type: boolean;
                    args: never;
                };
                hasPreviousPage: {
                    type: boolean;
                    args: never;
                };
                itemCount: {
                    type: number;
                    args: never;
                };
                itemsPerPage: {
                    type: number;
                    args: never;
                };
                totalItems: {
                    type: number;
                    args: never;
                };
                totalPages: {
                    type: number;
                    args: never;
                };
            };
            fragments: [];
        };
        PlatformDistribution: {
            idFields: never;
            fields: {
                count: {
                    type: number;
                    args: never;
                };
                platform: {
                    type: string;
                    args: never;
                };
            };
            fragments: [];
        };
        __ROOT__: {
            idFields: {};
            fields: {
                IsOnboardingComplete: {
                    type: Record<CacheTypeDef, "OnboardingStatusDto">;
                    args: never;
                };
                bid: {
                    type: Record<CacheTypeDef, "Bid">;
                    args: {
                        id: number;
                    };
                };
                bids: {
                    type: Record<CacheTypeDef, "UserBidsResponse">;
                    args: never;
                };
                bidsByTask: {
                    type: (Record<CacheTypeDef, "Bid">)[];
                    args: {
                        taskId: number;
                    };
                };
                categories: {
                    type: (Record<CacheTypeDef, "Category">)[];
                    args: never;
                };
                category: {
                    type: Record<CacheTypeDef, "Category"> | null;
                    args: {
                        id: number;
                    };
                };
                checkUsernameAvailability: {
                    type: boolean;
                    args: {
                        username: string;
                    };
                };
                deviceStatistics: {
                    type: Record<CacheTypeDef, "DeviceStatistics">;
                    args: never;
                };
                getUserSavedSearches: {
                    type: (Record<CacheTypeDef, "SavedSearchInfo">)[];
                    args: never;
                };
                getUsernameHistory: {
                    type: (string)[];
                    args: {
                        userId: number;
                    };
                };
                me: {
                    type: Record<CacheTypeDef, "User">;
                    args: never;
                };
                myDevices: {
                    type: (Record<CacheTypeDef, "UserDevice">)[];
                    args: never;
                };
                myNotificationPreferences: {
                    type: Record<CacheTypeDef, "UserNotificationPreferences"> | null;
                    args: never;
                };
                myTasks: {
                    type: (Record<CacheTypeDef, "Task">)[];
                    args: never;
                };
                searchSkills: {
                    type: (string)[];
                    args: {
                        query: string;
                    };
                };
                skill: {
                    type: Record<CacheTypeDef, "Skill"> | null;
                    args: {
                        id: number;
                    };
                };
                skills: {
                    type: (Record<CacheTypeDef, "Skill">)[];
                    args: never;
                };
                task: {
                    type: Record<CacheTypeDef, "Task">;
                    args: {
                        id: number;
                    };
                };
                taskTemplateById: {
                    type: Record<CacheTypeDef, "TaskTemplateResponse">;
                    args: {
                        id: number;
                    };
                };
                taskTemplates: {
                    type: (Record<CacheTypeDef, "TaskTemplateResponse">)[];
                    args: never;
                };
                tasks: {
                    type: Record<CacheTypeDef, "PaginatedTasksResponse">;
                    args: {
                        input: SearchTasksDto;
                    };
                };
                user: {
                    type: Record<CacheTypeDef, "User">;
                    args: {
                        id: number;
                    };
                };
                users: {
                    type: (Record<CacheTypeDef, "User">)[];
                    args: never;
                };
                verifyToken: {
                    type: Record<CacheTypeDef, "TokenVerificationResult">;
                    args: {
                        token: string;
                    };
                };
            };
            fragments: [];
        };
        RecurrencePattern: {
            idFields: never;
            fields: {
                dayOfMonth: {
                    type: number | null;
                    args: never;
                };
                daysOfWeek: {
                    type: (number)[] | null;
                    args: never;
                };
                endDate: {
                    type: string | null;
                    args: never;
                };
                frequency: {
                    type: RecurrenceFrequency;
                    args: never;
                };
                interval: {
                    type: number;
                    args: never;
                };
                maxOccurrences: {
                    type: number | null;
                    args: never;
                };
            };
            fragments: [];
        };
        SavedSearchInfo: {
            idFields: {
                id: string;
            };
            fields: {
                createdAt: {
                    type: string;
                    args: never;
                };
                id: {
                    type: string;
                    args: never;
                };
                isActive: {
                    type: boolean;
                    args: never;
                };
                name: {
                    type: string;
                    args: never;
                };
                notificationFrequency: {
                    type: NotificationFrequency;
                    args: never;
                };
                notifyOnMatch: {
                    type: boolean;
                    args: never;
                };
                unreadNotifications: {
                    type: number;
                    args: never;
                };
            };
            fragments: [];
        };
        SavedSearchNotificationResult: {
            idFields: never;
            fields: {
                matchCount: {
                    type: number | null;
                    args: never;
                };
                message: {
                    type: string | null;
                    args: never;
                };
                success: {
                    type: boolean;
                    args: never;
                };
            };
            fragments: [];
        };
        Skill: {
            idFields: {
                id: string;
            };
            fields: {
                approved: {
                    type: boolean | null;
                    args: never;
                };
                categoryId: {
                    type: number | null;
                    args: never;
                };
                createdAt: {
                    type: string;
                    args: never;
                };
                id: {
                    type: string;
                    args: never;
                };
                isVerifiable: {
                    type: boolean | null;
                    args: never;
                };
                name: {
                    type: string;
                    args: never;
                };
                updatedAt: {
                    type: string;
                    args: never;
                };
            };
            fragments: [];
        };
        Task: {
            idFields: {
                id: string;
            };
            fields: {
                attachments: {
                    type: (Record<CacheTypeDef, "AttachmentOutput">)[] | null;
                    args: never;
                };
                bids: {
                    type: (Record<CacheTypeDef, "Bid">)[] | null;
                    args: never;
                };
                budget: {
                    type: number | null;
                    args: never;
                };
                budgetType: {
                    type: BudgetType;
                    args: never;
                };
                categoryIds: {
                    type: (number)[] | null;
                    args: never;
                };
                createdAt: {
                    type: string;
                    args: never;
                };
                dateRange: {
                    type: Record<CacheTypeDef, "DateRangeOutput"> | null;
                    args: never;
                };
                deadlineDate: {
                    type: string | null;
                    args: never;
                };
                deletedAt: {
                    type: string | null;
                    args: never;
                };
                description: {
                    type: string;
                    args: never;
                };
                dropOffLocation: {
                    type: Record<CacheTypeDef, "LocationOutput"> | null;
                    args: never;
                };
                estimatedHours: {
                    type: number | null;
                    args: never;
                };
                id: {
                    type: string;
                    args: never;
                };
                imageUrls: {
                    type: (string)[] | null;
                    args: never;
                };
                isRemovals: {
                    type: boolean;
                    args: never;
                };
                pickupLocation: {
                    type: Record<CacheTypeDef, "LocationOutput"> | null;
                    args: never;
                };
                skillIds: {
                    type: (number)[] | null;
                    args: never;
                };
                status: {
                    type: TaskStatus;
                    args: never;
                };
                taskType: {
                    type: TaskType;
                    args: never;
                };
                title: {
                    type: string;
                    args: never;
                };
                updatedAt: {
                    type: string;
                    args: never;
                };
                userProfile: {
                    type: Record<CacheTypeDef, "UserProfileOutput">;
                    args: never;
                };
                userProfileId: {
                    type: number;
                    args: never;
                };
                visibility: {
                    type: TaskVisibility;
                    args: never;
                };
            };
            fragments: [];
        };
        TaskTemplateResponse: {
            idFields: {
                id: string;
            };
            fields: {
                createdAt: {
                    type: string | null;
                    args: never;
                };
                description: {
                    type: string | null;
                    args: never;
                };
                id: {
                    type: string;
                    args: never;
                };
                isRecurring: {
                    type: boolean;
                    args: never;
                };
                name: {
                    type: string | null;
                    args: never;
                };
                recurrencePattern: {
                    type: Record<CacheTypeDef, "RecurrencePattern"> | null;
                    args: never;
                };
                task: {
                    type: Record<CacheTypeDef, "Task">;
                    args: never;
                };
                updatedAt: {
                    type: string | null;
                    args: never;
                };
                userId: {
                    type: number | null;
                    args: never;
                };
            };
            fragments: [];
        };
        TokenVerificationResult: {
            idFields: never;
            fields: {
                isValid: {
                    type: boolean;
                    args: never;
                };
                user: {
                    type: Record<CacheTypeDef, "User"> | null;
                    args: never;
                };
            };
            fragments: [];
        };
        TurnstileVerificationResult: {
            idFields: never;
            fields: {
                message: {
                    type: string | null;
                    args: never;
                };
                success: {
                    type: boolean;
                    args: never;
                };
            };
            fragments: [];
        };
        User: {
            idFields: {
                id: string;
            };
            fields: {
                biddingAllowed: {
                    type: boolean;
                    args: never;
                };
                createdAt: {
                    type: string;
                    args: never;
                };
                deletedAt: {
                    type: string | null;
                    args: never;
                };
                displayName: {
                    type: string | null;
                    args: never;
                };
                dob: {
                    type: string | null;
                    args: never;
                };
                email: {
                    type: string | null;
                    args: never;
                };
                id: {
                    type: string;
                    args: never;
                };
                isEmailVerified: {
                    type: boolean;
                    args: never;
                };
                lastLoginAt: {
                    type: string | null;
                    args: never;
                };
                location: {
                    type: Record<CacheTypeDef, "UserLocation"> | null;
                    args: never;
                };
                mobileNumber: {
                    type: string | null;
                    args: never;
                };
                name: {
                    type: string | null;
                    args: never;
                };
                onboardingComplete: {
                    type: boolean;
                    args: never;
                };
                profilePictureId: {
                    type: string | null;
                    args: never;
                };
                profilePictureUrl: {
                    type: string | null;
                    args: never;
                };
                skills: {
                    type: (Record<CacheTypeDef, "Skill">)[];
                    args: never;
                };
                status: {
                    type: UserStatus;
                    args: never;
                };
                updatedAt: {
                    type: string;
                    args: never;
                };
                userProfile: {
                    type: Record<CacheTypeDef, "UserProfileOutput"> | null;
                    args: never;
                };
                userRole: {
                    type: UserRole;
                    args: never;
                };
                username: {
                    type: string | null;
                    args: never;
                };
            };
            fragments: [];
        };
        UserBidsResponse: {
            idFields: never;
            fields: {
                received: {
                    type: Record<CacheTypeDef, "BidsWithPaginationDto">;
                    args: never;
                };
                submitted: {
                    type: Record<CacheTypeDef, "BidsWithPaginationDto">;
                    args: never;
                };
            };
            fragments: [];
        };
        UserDevice: {
            idFields: {
                id: string;
            };
            fields: {
                appVersion: {
                    type: string | null;
                    args: never;
                };
                createdAt: {
                    type: string;
                    args: never;
                };
                credentialId: {
                    type: string | null;
                    args: never;
                };
                deviceId: {
                    type: string;
                    args: never;
                };
                deviceName: {
                    type: string | null;
                    args: never;
                };
                fcmToken: {
                    type: string | null;
                    args: never;
                };
                id: {
                    type: string;
                    args: never;
                };
                isActive: {
                    type: boolean;
                    args: never;
                };
                lastTokenRefresh: {
                    type: string | null;
                    args: never;
                };
                lastUsedAt: {
                    type: string | null;
                    args: never;
                };
                platform: {
                    type: string | null;
                    args: never;
                };
                pushToken: {
                    type: string | null;
                    args: never;
                };
                revokedAt: {
                    type: string | null;
                    args: never;
                };
                updatedAt: {
                    type: string;
                    args: never;
                };
                userId: {
                    type: number;
                    args: never;
                };
            };
            fragments: [];
        };
        UserLocation: {
            idFields: never;
            fields: {
                createdAt: {
                    type: string;
                    args: never;
                };
                displayName: {
                    type: string;
                    args: never;
                };
                latitude: {
                    type: number;
                    args: never;
                };
                longitude: {
                    type: number;
                    args: never;
                };
                serviceRadius: {
                    type: number | null;
                    args: never;
                };
                updatedAt: {
                    type: string;
                    args: never;
                };
                zipCode: {
                    type: string | null;
                    args: never;
                };
            };
            fragments: [];
        };
        UserNotificationPreferences: {
            idFields: {
                id: string;
            };
            fields: {
                createdAt: {
                    type: string;
                    args: never;
                };
                email: {
                    type: boolean;
                    args: never;
                };
                id: {
                    type: string;
                    args: never;
                };
                inApp: {
                    type: boolean;
                    args: never;
                };
                push: {
                    type: boolean;
                    args: never;
                };
                pushBidUpdates: {
                    type: boolean;
                    args: never;
                };
                pushMessages: {
                    type: boolean;
                    args: never;
                };
                pushPayments: {
                    type: boolean;
                    args: never;
                };
                pushSystemUpdates: {
                    type: boolean;
                    args: never;
                };
                pushTaskMatches: {
                    type: boolean;
                    args: never;
                };
                updatedAt: {
                    type: string;
                    args: never;
                };
                userId: {
                    type: number;
                    args: never;
                };
            };
            fragments: [];
        };
        UserProfileOutput: {
            idFields: {
                id: string;
            };
            fields: {
                averageRating: {
                    type: number | null;
                    args: never;
                };
                createdAt: {
                    type: string | null;
                    args: never;
                };
                experiencePoints: {
                    type: number | null;
                    args: never;
                };
                feeDiscount: {
                    type: number | null;
                    args: never;
                };
                id: {
                    type: string;
                    args: never;
                };
                identityVerified: {
                    type: boolean | null;
                    args: never;
                };
                level: {
                    type: number | null;
                    args: never;
                };
                monthlyActivityPoints: {
                    type: number | null;
                    args: never;
                };
                professionalTitle: {
                    type: string | null;
                    args: never;
                };
                profileDescription: {
                    type: string | null;
                    args: never;
                };
                promotionalVideo: {
                    type: string | null;
                    args: never;
                };
                reputationScore: {
                    type: number | null;
                    args: never;
                };
                standardRates: {
                    type: number | null;
                    args: never;
                };
                successRate: {
                    type: number | null;
                    args: never;
                };
                tasksCompleted: {
                    type: number | null;
                    args: never;
                };
                tasksPosted: {
                    type: number | null;
                    args: never;
                };
                updatedAt: {
                    type: string | null;
                    args: never;
                };
                user: {
                    type: Record<CacheTypeDef, "User"> | null;
                    args: never;
                };
                userId: {
                    type: string;
                    args: never;
                };
                verificationLevel: {
                    type: number | null;
                    args: never;
                };
                yearsExperience: {
                    type: number | null;
                    args: never;
                };
            };
            fragments: [];
        };
    };
    lists: {};
    queries: [[MyTaskTemplatesStore, MyTaskTemplates$result, MyTaskTemplates$input], [TasksStore, Tasks$result, Tasks$input], [SearchTasksStore, SearchTasks$result, SearchTasks$input], [MyBidsStore, MyBids$result, MyBids$input], [MeStore, Me$result, Me$input], [CheckOnboardingStatusStore, CheckOnboardingStatus$result, CheckOnboardingStatus$input], [VerifyTokenStore, VerifyToken$result, VerifyToken$input], [MyNotificationPreferencesStore, MyNotificationPreferences$result, MyNotificationPreferences$input], [CheckUsernameAvailabilityStore, CheckUsernameAvailability$result, CheckUsernameAvailability$input], [GetUsernameHistoryStore, GetUsernameHistory$result, GetUsernameHistory$input], [MyDevicesStore, MyDevices$result, MyDevices$input]];
};