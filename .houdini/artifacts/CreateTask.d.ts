import type { TaskVisibility } from "$houdini/graphql/enums";
import type { TaskType } from "$houdini/graphql/enums";
import type { SkillImportance } from "$houdini/graphql/enums";
import type { ValueOf } from "$houdini/runtime/lib/types";
import type { BudgetType } from "$houdini/graphql/enums";

export type CreateTask = {
    readonly "input": CreateTask$input;
    readonly "result": CreateTask$result;
};

export type CreateTask$result = {
    readonly createTask: {
        readonly id: string;
    };
};

type AttachmentInput = {
    fileName: string;
    fileSize?: number | null | undefined;
    fileUrl: string;
};

type DateRangeInput = {
    end?: string | null | undefined;
    start?: string | null | undefined;
};

type LocationInput = {
    displayName?: string | null | undefined;
    latitude?: number | null | undefined;
    locationLoaded: boolean;
    longitude?: number | null | undefined;
    zipCode?: string | null | undefined;
};

type CreateTaskInput = {
    addressLine1?: string | null | undefined;
    addressLine2?: string | null | undefined;
    attachments?: (AttachmentInput)[] | null | undefined;
    boostAmount?: number | null | undefined;
    boostDuration?: number | null | undefined;
    boostTask?: boolean | null | undefined;
    budget?: number | null | undefined;
    budgetType?: ValueOf<typeof BudgetType> | null | undefined;
    categoryIds?: (number)[] | null | undefined;
    city?: string | null | undefined;
    country?: string | null | undefined;
    dateRange?: DateRangeInput | null | undefined;
    deadlineDate?: string | null | undefined;
    description: string;
    dropOffLocation?: LocationInput | null | undefined;
    estimatedHours?: number | null | undefined;
    imageUrls?: (string)[] | null | undefined;
    isRemovals?: boolean | null | undefined;
    latitude?: number | null | undefined;
    longitude?: number | null | undefined;
    pickupLocation?: LocationInput | null | undefined;
    postalCode?: string | null | undefined;
    saveAsTemplate?: boolean | null | undefined;
    skillIds?: (number)[] | null | undefined;
    skillImportance?: ValueOf<typeof SkillImportance> | null | undefined;
    state?: string | null | undefined;
    taskType?: ValueOf<typeof TaskType> | null | undefined;
    templateId?: number | null | undefined;
    templateName?: string | null | undefined;
    title: string;
    visibility?: ValueOf<typeof TaskVisibility> | null | undefined;
};

export type CreateTask$input = {
    input: CreateTaskInput;
};

export type CreateTask$optimistic = {
    readonly createTask?: {
        readonly id?: string;
    };
};

export type CreateTask$artifact = {
    "name": "CreateTask";
    "kind": "HoudiniMutation";
    "hash": "3ba4a2530b44883cac5d4a52cf06ea00f286897c6f67a4b51e5b99cd99d9cecd";
    "raw": `mutation CreateTask($input: CreateTaskInput!) {
  createTask(input: $input) {
    id
  }
}
`;
    "rootType": "Mutation";
    "stripVariables": [];
    "selection": {
        "fields": {
            "createTask": {
                "type": "Task";
                "keyRaw": "createTask(input: $input)";
                "selection": {
                    "fields": {
                        "id": {
                            "type": "ID";
                            "keyRaw": "id";
                            "visible": true;
                        };
                    };
                };
                "visible": true;
            };
        };
    };
    "pluginData": {
        "houdini-svelte": {};
    };
    "input": {
        "fields": {
            "input": "CreateTaskInput";
        };
        "types": {
            "AttachmentInput": {
                "fileName": "String";
                "fileSize": "Float";
                "fileUrl": "String";
            };
            "DateRangeInput": {
                "end": "String";
                "start": "String";
            };
            "LocationInput": {
                "displayName": "String";
                "latitude": "Float";
                "locationLoaded": "Boolean";
                "longitude": "Float";
                "zipCode": "String";
            };
            "CreateTaskInput": {
                "addressLine1": "String";
                "addressLine2": "String";
                "attachments": "AttachmentInput";
                "boostAmount": "Float";
                "boostDuration": "Int";
                "boostTask": "Boolean";
                "budget": "Float";
                "budgetType": "BudgetType";
                "categoryIds": "Int";
                "city": "String";
                "country": "String";
                "dateRange": "DateRangeInput";
                "deadlineDate": "String";
                "description": "String";
                "dropOffLocation": "LocationInput";
                "estimatedHours": "Float";
                "imageUrls": "String";
                "isRemovals": "Boolean";
                "latitude": "Float";
                "longitude": "Float";
                "pickupLocation": "LocationInput";
                "postalCode": "String";
                "saveAsTemplate": "Boolean";
                "skillIds": "Int";
                "skillImportance": "SkillImportance";
                "state": "String";
                "taskType": "TaskType";
                "templateId": "Int";
                "templateName": "String";
                "title": "String";
                "visibility": "TaskVisibility";
            };
        };
        "defaults": {};
        "runtimeScalars": {};
    };
};