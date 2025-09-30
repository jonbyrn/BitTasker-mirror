import { UnsubscribeFromTopicStore } from "../plugins/houdini-svelte/stores/UnsubscribeFromTopic";
import { RevokeAllDevicesStore } from "../plugins/houdini-svelte/stores/RevokeAllDevices";
import { RegisterDeviceStore } from "../plugins/houdini-svelte/stores/RegisterDevice";
import { RevokeDeviceStore } from "../plugins/houdini-svelte/stores/RevokeDevice";
import { SendNotificationStore } from "../plugins/houdini-svelte/stores/SendNotification";
import { SubscribeToTopicStore } from "../plugins/houdini-svelte/stores/SubscribeToTopic";
import { UpdateDeviceStore } from "../plugins/houdini-svelte/stores/UpdateDevice";
import { VerifyTrunstileStore } from "../plugins/houdini-svelte/stores/VerifyTrunstile";
import { ChangePasswordStore } from "../plugins/houdini-svelte/stores/ChangePassword";
import { UpdateDeviceActivityStore } from "../plugins/houdini-svelte/stores/UpdateDeviceActivity";
import { DeleteTaskTemplateStore } from "../plugins/houdini-svelte/stores/DeleteTaskTemplate";
import { RegisterStore } from "../plugins/houdini-svelte/stores/Register";
import { LoginStore } from "../plugins/houdini-svelte/stores/Login";
import { CreateTaskStore } from "../plugins/houdini-svelte/stores/CreateTask";
import { UpdateUserStore } from "../plugins/houdini-svelte/stores/UpdateUser";
import { UpdateTaskTemplateStore } from "../plugins/houdini-svelte/stores/UpdateTaskTemplate";
import { MyDevicesStore } from "../plugins/houdini-svelte/stores/MyDevices";
import { TriggerSavedSearchCheckStore } from "../plugins/houdini-svelte/stores/TriggerSavedSearchCheck";
import { UpdateUserProfileStore } from "../plugins/houdini-svelte/stores/UpdateUserProfile";
import { GetUsernameHistoryStore } from "../plugins/houdini-svelte/stores/GetUsernameHistory";
import { CheckUsernameAvailabilityStore } from "../plugins/houdini-svelte/stores/CheckUsernameAvailability";
import { MyNotificationPreferencesStore } from "../plugins/houdini-svelte/stores/MyNotificationPreferences";
import { VerifyTokenStore } from "../plugins/houdini-svelte/stores/VerifyToken";
import { CheckOnboardingStatusStore } from "../plugins/houdini-svelte/stores/CheckOnboardingStatus";
import { MeStore } from "../plugins/houdini-svelte/stores/Me";
import { MyBidsStore } from "../plugins/houdini-svelte/stores/MyBids";
import { SearchTasksStore } from "../plugins/houdini-svelte/stores/SearchTasks";
import { TasksStore } from "../plugins/houdini-svelte/stores/Tasks";
import { MyTaskTemplatesStore } from "../plugins/houdini-svelte/stores/MyTaskTemplates";
import type { Cache as InternalCache } from "./cache/cache";
import type { CacheTypeDef } from "./generated";
import { Cache } from "./public";
export * from "./client";
export * from "./lib";

export function graphql(
    str: "mutation UnsubscribeFromTopic($input: SubscribeToTopicInput!) {\r\n\tunsubscribeFromTopic(input: $input) {\r\n\t\tsuccess\r\n\t\tmessage\r\n\t}\r\n}\r\n"
): UnsubscribeFromTopicStore;

export function graphql(
    str: "mutation RevokeAllDevices {\r\n  revokeAllDevices {\r\n    success\r\n    message\r\n  }\r\n} "
): RevokeAllDevicesStore;

export function graphql(
    str: "mutation RegisterDevice($input: RegisterDeviceInput!) {\r\n  registerDevice(input: $input) {\r\n    id\r\n    deviceId\r\n    platform\r\n    isActive\r\n    fcmToken\r\n    appVersion\r\n    lastTokenRefresh\r\n  }\r\n} "
): RegisterDeviceStore;

export function graphql(
    str: "mutation RevokeDevice($deviceId: String!) {\r\n  revokeDevice(deviceId: $deviceId) {\r\n    success\r\n    message\r\n  }\r\n} "
): RevokeDeviceStore;

export function graphql(
    str: "mutation SendNotification($input: SendNotificationInput!) {\r\n\tsendNotification(input: $input) {\r\n\t\tsuccess\r\n\t\tmessage\r\n\t}\r\n}\r\n"
): SendNotificationStore;

export function graphql(
    str: "mutation SubscribeToTopic($input: SubscribeToTopicInput!) {\r\n\tsubscribeToTopic(input: $input) {\r\n\t\tsuccess\r\n\t\tmessage\r\n\t}\r\n}\r\n"
): SubscribeToTopicStore;

export function graphql(
    str: "mutation UpdateDevice($deviceId: String!, $input: UpdateDeviceInput!) {\r\n\tupdateDevice(deviceId: $deviceId, input: $input) {\r\n\t\tid\r\n\t\tdeviceId\r\n\t\tplatform\r\n\t\tisActive\r\n\t\tfcmToken\r\n\t\tappVersion\r\n\t\tlastTokenRefresh\r\n\t}\r\n}\r\n"
): UpdateDeviceStore;

export function graphql(
    str: "mutation VerifyTrunstile($input: TurnstileVerificationInput!) {\r\n\tverifyTurnstileToken(input: $input) {\r\n\t\tsuccess\r\n\t\tmessage\r\n\t}\r\n}\r\n"
): VerifyTrunstileStore;

export function graphql(
    str: "mutation ChangePassword($input: ChangePasswordInput!) {\r\n  changePassword(input: $input)\r\n} "
): ChangePasswordStore;

export function graphql(
    str: "mutation UpdateDeviceActivity($deviceId: String!) {\r\n\tupdateDeviceActivity(deviceId: $deviceId) {\r\n\t\tsuccess\r\n\t\tmessage\r\n\t}\r\n}\r\n"
): UpdateDeviceActivityStore;

export function graphql(
    str: "mutation DeleteTaskTemplate($deleteTaskTemplateId: Int!) {\r\n\tdeleteTaskTemplate(id: $deleteTaskTemplateId)\r\n}\r\n"
): DeleteTaskTemplateStore;

export function graphql(
    str: "mutation Register($input: RegisterInput!) {\r\n  register(input: $input) {\r\n    access_token\r\n    expires_in\r\n    token_type\r\n    user {\r\n      id\r\n      email\r\n      name\r\n      profilePictureUrl\r\n      onboardingComplete\r\n      userRole\r\n      status\r\n      isEmailVerified\r\n      lastLoginAt\r\n      createdAt\r\n      updatedAt\r\n    }\r\n  }\r\n} "
): RegisterStore;

export function graphql(
    str: "mutation Login($input: LoginInput!) {\r\n  login(input: $input) {\r\n    access_token\r\n    expires_in\r\n    token_type\r\n    user {\r\n      id\r\n      email\r\n      name\r\n      profilePictureUrl\r\n      onboardingComplete\r\n      userRole\r\n      status\r\n      isEmailVerified\r\n      lastLoginAt\r\n      createdAt\r\n      updatedAt\r\n    }\r\n  }\r\n} "
): LoginStore;

export function graphql(
    str: "mutation CreateTask($input: CreateTaskInput!) {\r\n\tcreateTask(input: $input) {\r\n\t\tid\r\n\t}\r\n}\r\n"
): CreateTaskStore;

export function graphql(
    str: "mutation UpdateUser($input: UpdateUserProfileInput!) {\r\n\tupdateUserProfile(input: $input) {\r\n\t\tid\r\n\t\tname\r\n\t\temail\r\n\t\tprofilePictureUrl\r\n\t\tprofilePictureId\r\n\t\tonboardingComplete\r\n\t\tuserRole\r\n\t\tlocation {\r\n\t\t\tdisplayName\r\n\t\t\tlatitude\r\n\t\t\tlongitude\r\n\t\t\tzipCode\r\n\t\t}\r\n\t\tlastLoginAt\r\n\t\tisEmailVerified\r\n\t\tstatus\r\n\t\tcreatedAt\r\n\t\tupdatedAt\r\n\t}\r\n}\r\n"
): UpdateUserStore;

export function graphql(
    str: "mutation UpdateTaskTemplate($updateTaskTemplateId: Int!, $input: UpdateTaskTemplateInput!) {\r\n\tupdateTaskTemplate(id: $updateTaskTemplateId, input: $input) {\r\n\t\tid\r\n\t}\r\n}"
): UpdateTaskTemplateStore;

export function graphql(
    str: "query MyDevices {\r\n\tmyDevices {\r\n\t\tid\r\n\t\tdeviceId\r\n\t\tdeviceName\r\n\t\tplatform\r\n\t\tisActive\r\n\t\tfcmToken\r\n\t\tappVersion\r\n\t\tlastUsedAt\r\n\t}\r\n}\r\n"
): MyDevicesStore;

export function graphql(
    str: "mutation TriggerSavedSearchCheck($task: TaskBodyInput!) {\r\n\ttriggerSavedSearchCheck(task: $task) {\r\n\t\tsuccess\r\n\t\tmatchCount\r\n\t\tmessage\r\n\t}\r\n}\r\n"
): TriggerSavedSearchCheckStore;

export function graphql(
    str: "mutation UpdateUserProfile($input: UpdateUserProfileInput!) {\r\n  updateUserProfile(input: $input) {\r\n    id\r\n    username\r\n    displayName\r\n    name\r\n    email\r\n    profilePictureUrl\r\n    profilePictureId\r\n    onboardingComplete\r\n    userRole\r\n    location {\r\n      displayName\r\n      latitude\r\n      longitude\r\n      zipCode\r\n    }\r\n    lastLoginAt\r\n    isEmailVerified\r\n    status\r\n    createdAt\r\n    updatedAt\r\n  }\r\n} "
): UpdateUserProfileStore;

export function graphql(
    str: "query GetUsernameHistory($userId: Int!) {\r\n  getUsernameHistory(userId: $userId)\r\n} "
): GetUsernameHistoryStore;

export function graphql(
    str: "query CheckUsernameAvailability($username: String!) {\r\n  checkUsernameAvailability(username: $username)\r\n} "
): CheckUsernameAvailabilityStore;

export function graphql(
    str: "query MyNotificationPreferences {\r\n\tmyNotificationPreferences {\r\n\t\tid\r\n\t\tpushTaskMatches\r\n\t\tpushBidUpdates\r\n\t\tpushMessages\r\n\t\tpushPayments\r\n\t\tpushSystemUpdates\r\n\t\temail\r\n\t\tinApp\r\n\t\tpush\r\n\t\tcreatedAt\r\n\t\tupdatedAt\r\n\t}\r\n}\r\n"
): MyNotificationPreferencesStore;

export function graphql(
    str: "query VerifyToken($token: String!) {\r\n  verifyToken(token: $token) {\r\n    isValid\r\n    user {\r\n      id\r\n      email\r\n      name\r\n      profilePictureUrl\r\n      onboardingComplete\r\n      userRole\r\n      status\r\n      isEmailVerified\r\n      lastLoginAt\r\n      createdAt\r\n      updatedAt\r\n    }\r\n  }\r\n} "
): VerifyTokenStore;

export function graphql(
    str: "query CheckOnboardingStatus {\r\n\tIsOnboardingComplete {\r\n\t\tisComplete\r\n\t\tmissingFields\r\n\t}\r\n}\r\n"
): CheckOnboardingStatusStore;

export function graphql(
    str: "query Me {\r\n\tme {\r\n\t\tid\r\n\t\temail\r\n\t\tname\r\n\t\tdisplayName\r\n\t\tusername\r\n\t\tprofilePictureUrl\r\n\t\tprofilePictureId\r\n\t\tonboardingComplete\r\n\t\tbiddingAllowed\r\n\t\tisEmailVerified\r\n\t\tstatus\r\n\t\tuserRole\r\n\t\tdob\r\n\t\tlocation {\r\n\t\t\tdisplayName\r\n\t\t\tlatitude\r\n\t\t\tlongitude\r\n\t\t\tzipCode\r\n\t\t}\r\n\t\tskills {\r\n\t\t\tid\r\n\t\t\tname\r\n\t\t}\r\n\t\tmobileNumber\r\n\t\tlastLoginAt\r\n\t\tcreatedAt\r\n\t\tupdatedAt\r\n\t}\r\n}\r\n"
): MeStore;

export function graphql(
    str: "query MyBids {\r\n  bids {\r\n    received {\r\n      data {\r\n        id\r\n        userProfile {\r\n          user {\r\n            name\r\n          }\r\n        }\r\n        amount\r\n        currency\r\n        status\r\n        description\r\n      }\r\n    }\r\n    submitted {\r\n      data {\r\n        id\r\n        userProfile {\r\n          user {\r\n            name\r\n          }\r\n        }\r\n        amount\r\n        currency\r\n        status\r\n        description\r\n      }\r\n    }\r\n  }\r\n}"
): MyBidsStore;

export function graphql(
    str: "query SearchTasks($input: SearchTasksDto!) {\r\n\t\t\t\ttasks(input: $input) {\r\n\t\t\t\t\titems {\r\n\t\t\t\t\t\tid\r\n\t\t\t\t\t\ttitle\r\n\t\t\t\t\t\tdescription\r\n\t\t\t\t\t\tbudget\r\n\t\t\t\t\t\tstatus\r\n\t\t\t\t\t\tcreatedAt\r\n\t\t\t\t\t\tdeadlineDate\r\n\t\t\t\t\t\ttaskType\r\n\t\t\t\t\t\tdateRange {\r\n\t\t\t\t\t\t\tstart\r\n\t\t\t\t\t\t\tend\r\n\t\t\t\t\t\t}\r\n\t\t\t\t\t\tskillIds\r\n\t\t\t\t\t\tpickupLocation {\r\n\t\t\t\t\t\t\tdisplayName\r\n\t\t\t\t\t\t\tzipCode\r\n\t\t\t\t\t\t}\r\n\t\t\t\t\t\tuserProfile {\r\n\t\t\t\t\t\t\tid\r\n\t\t\t\t\t\t\tuser {\r\n\t\t\t\t\t\t\t\tid\r\n\t\t\t\t\t\t\t\tusername\r\n\t\t\t\t\t\t\t}\r\n\t\t\t\t\t\t}\r\n\t\t\t\t\t\tbids {\r\n\t\t\t\t\t\t\tid\r\n\t\t\t\t\t\t}\r\n\t\t\t\t\t}\r\n\t\t\t\t\tmeta {\r\n\t\t\t\t\t\tcurrentPage\r\n\t\t\t\t\t\titemCount\r\n\t\t\t\t\t\titemsPerPage\r\n\t\t\t\t\t\ttotalItems\r\n\t\t\t\t\t\ttotalPages\r\n\t\t\t\t\t\thasNextPage\r\n\t\t\t\t\t\thasPreviousPage\r\n\t\t\t\t\t}\r\n\t\t\t\t}\r\n\t\t\t}"
): SearchTasksStore;

export function graphql(
    str: "query Tasks {\r\n\tmyTasks {\r\n\t\tid\r\n\t\ttitle\r\n\t\tdescription\r\n\t\tuserProfileId\r\n\t\tstatus\r\n\t\ttaskType\r\n\t\tpickupLocation {\r\n\t\t\tzipCode\r\n\t\t}\r\n\t\tbudget\r\n\t\tbudgetType\r\n\t\tdeadlineDate\r\n\t\tdateRange {\r\n\t\t\tstart\r\n\t\t\tend\r\n\t\t}\r\n\t\tbids {\r\n\t\t\tid\r\n\t\t}\r\n\t}\r\n}\r\n"
): TasksStore;

export function graphql(
    str: "query MyTaskTemplates {\r\n\ttaskTemplates {\r\n\t\tid\r\n\t\tname\r\n\t\tdescription\r\n\t\tcreatedAt\r\n\t\trecurrencePattern {\r\n\t\t\tfrequency\r\n\t\t\tdaysOfWeek\r\n\t\t\tdayOfMonth\r\n\t\t\tinterval\r\n\t\t\tendDate\r\n\t\t\tmaxOccurrences\r\n\t\t}\r\n\t\ttask {\r\n\t\t\ttitle\r\n\t\t\tdescription\r\n\t\t\tbudget\r\n\t\t\tstatus\r\n\t\t}\r\n\t}\r\n}\r\n"
): MyTaskTemplatesStore;

export declare function graphql<_Payload, _Result = _Payload>(str: TemplateStringsArray): _Result;
export declare const cache: Cache<CacheTypeDef>;
export declare function getCache(): InternalCache;