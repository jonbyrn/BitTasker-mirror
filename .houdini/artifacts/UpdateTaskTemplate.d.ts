import type { TaskVisibility } from "$houdini/graphql/enums";
import type { TaskType } from "$houdini/graphql/enums";
import type { TaskStatus } from "$houdini/graphql/enums";
import type { SkillImportance } from "$houdini/graphql/enums";
import type { BudgetType } from "$houdini/graphql/enums";
import type { ValueOf } from "$houdini/runtime/lib/types";
import type { RecurrenceFrequency } from "$houdini/graphql/enums";

export type UpdateTaskTemplate = {
    readonly "input": UpdateTaskTemplate$input;
    readonly "result": UpdateTaskTemplate$result;
};

export type UpdateTaskTemplate$result = {
    readonly updateTaskTemplate: {
        readonly id: string;
    };
};

type RecurrencePatternInput = {
    dayOfMonth?: number | null | undefined;
    daysOfWeek?: (number)[] | null | undefined;
    endDate?: string | null | undefined;
    frequency: ValueOf<typeof RecurrenceFrequency>;
    interval: number;
    maxOccurrences?: number | null | undefined;
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

type UpdateTaskInput = {
    addressLine1?: string | null | undefined;
    addressLine2?: string | null | undefined;
    attachments?: (AttachmentInput)[] | null | undefined;
    budget?: number | null | undefined;
    budgetType?: ValueOf<typeof BudgetType> | null | undefined;
    categoryIds?: (number)[] | null | undefined;
    city?: string | null | undefined;
    country?: string | null | undefined;
    dateRange?: DateRangeInput | null | undefined;
    deadlineDate?: string | null | undefined;
    description?: string | null | undefined;
    dropOffLocation?: LocationInput | null | undefined;
    estimatedHours?: number | null | undefined;
    imageUrls?: (string)[] | null | undefined;
    isRemovals?: boolean | null | undefined;
    latitude?: number | null | undefined;
    longitude?: number | null | undefined;
    pickupLocation?: LocationInput | null | undefined;
    postalCode?: string | null | undefined;
    skillIds?: (number)[] | null | undefined;
    skillImportance?: ValueOf<typeof SkillImportance> | null | undefined;
    state?: string | null | undefined;
    status?: ValueOf<typeof TaskStatus> | null | undefined;
    taskType?: ValueOf<typeof TaskType> | null | undefined;
    title?: string | null | undefined;
    visibility?: ValueOf<typeof TaskVisibility> | null | undefined;
};

type UpdateTaskTemplateInput = {
    recurrencePattern?: RecurrencePatternInput | null | undefined;
    task?: UpdateTaskInput | null | undefined;
};

export type UpdateTaskTemplate$input = {
    updateTaskTemplateId: number;
    input: UpdateTaskTemplateInput;
};

export type UpdateTaskTemplate$optimistic = {
    readonly updateTaskTemplate?: {
        readonly id?: string;
    };
};

export type UpdateTaskTemplate$artifact = {
    "name": "UpdateTaskTemplate";
    "kind": "HoudiniMutation";
    "hash": "1b486b96b92153ac20f6295c73d3bd19ca84ebf62c1914131066f61fc455a1e9";
    "raw": `mutation UpdateTaskTemplate($updateTaskTemplateId: Int!, $input: UpdateTaskTemplateInput!) {
  updateTaskTemplate(id: $updateTaskTemplateId, input: $input) {
    id
  }
}
`;
    "rootType": "Mutation";
    "stripVariables": [];
    "selection": {
        "fields": {
            "updateTaskTemplate": {
                "type": "TaskTemplateResponse";
                "keyRaw": "updateTaskTemplate(id: $updateTaskTemplateId, input: $input)";
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
            "updateTaskTemplateId": "Int";
            "input": "UpdateTaskTemplateInput";
        };
        "types": {
            "RecurrencePatternInput": {
                "dayOfMonth": "Int";
                "daysOfWeek": "Int";
                "endDate": "DateTime";
                "frequency": "RecurrenceFrequency";
                "interval": "Int";
                "maxOccurrences": "Int";
            };
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
            "UpdateTaskInput": {
                "addressLine1": "String";
                "addressLine2": "String";
                "attachments": "AttachmentInput";
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
                "skillIds": "Int";
                "skillImportance": "SkillImportance";
                "state": "String";
                "status": "TaskStatus";
                "taskType": "TaskType";
                "title": "String";
                "visibility": "TaskVisibility";
            };
            "UpdateTaskTemplateInput": {
                "recurrencePattern": "RecurrencePatternInput";
                "task": "UpdateTaskInput";
            };
        };
        "defaults": {};
        "runtimeScalars": {};
    };
};