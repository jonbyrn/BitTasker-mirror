import type { TaskType } from "$houdini/graphql/enums";
import type { ValueOf } from "$houdini/runtime/lib/types";
import type { BudgetTypeEnum } from "$houdini/graphql/enums";

export type TriggerSavedSearchCheck = {
    readonly "input": TriggerSavedSearchCheck$input;
    readonly "result": TriggerSavedSearchCheck$result;
};

export type TriggerSavedSearchCheck$result = {
    readonly triggerSavedSearchCheck: {
        readonly success: boolean;
        readonly matchCount: number | null;
        readonly message: string | null;
    };
};

type BudgetInput = {
    currency?: string | null | undefined;
    tier?: string | null | undefined;
    type?: ValueOf<typeof BudgetTypeEnum> | null | undefined;
};

type LocationInput = {
    displayName?: string | null | undefined;
    latitude?: number | null | undefined;
    locationLoaded: boolean;
    longitude?: number | null | undefined;
    zipCode?: string | null | undefined;
};

type TaskBodyInput = {
    budget?: BudgetInput | null | undefined;
    categories: (string)[];
    dateRange?: string | null | undefined;
    deadline?: string | null | undefined;
    description: string;
    dropOffLocation?: LocationInput | null | undefined;
    eventId?: string | null | undefined;
    pickupLocation?: LocationInput | null | undefined;
    skills: (string)[];
    taskType: ValueOf<typeof TaskType>;
    title: string;
};

export type TriggerSavedSearchCheck$input = {
    task: TaskBodyInput;
};

export type TriggerSavedSearchCheck$optimistic = {
    readonly triggerSavedSearchCheck?: {
        readonly success?: boolean;
        readonly matchCount?: number | null;
        readonly message?: string | null;
    };
};

export type TriggerSavedSearchCheck$artifact = {
    "name": "TriggerSavedSearchCheck";
    "kind": "HoudiniMutation";
    "hash": "90f3dcc819b660472ebe4f4d293694758d58db83ce784aff24a8901f831a2350";
    "raw": `mutation TriggerSavedSearchCheck($task: TaskBodyInput!) {
  triggerSavedSearchCheck(task: $task) {
    success
    matchCount
    message
  }
}
`;
    "rootType": "Mutation";
    "stripVariables": [];
    "selection": {
        "fields": {
            "triggerSavedSearchCheck": {
                "type": "SavedSearchNotificationResult";
                "keyRaw": "triggerSavedSearchCheck(task: $task)";
                "selection": {
                    "fields": {
                        "success": {
                            "type": "Boolean";
                            "keyRaw": "success";
                            "visible": true;
                        };
                        "matchCount": {
                            "type": "Int";
                            "keyRaw": "matchCount";
                            "nullable": true;
                            "visible": true;
                        };
                        "message": {
                            "type": "String";
                            "keyRaw": "message";
                            "nullable": true;
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
            "task": "TaskBodyInput";
        };
        "types": {
            "BudgetInput": {
                "currency": "String";
                "tier": "String";
                "type": "BudgetTypeEnum";
            };
            "LocationInput": {
                "displayName": "String";
                "latitude": "Float";
                "locationLoaded": "Boolean";
                "longitude": "Float";
                "zipCode": "String";
            };
            "TaskBodyInput": {
                "budget": "BudgetInput";
                "categories": "String";
                "dateRange": "String";
                "deadline": "String";
                "description": "String";
                "dropOffLocation": "LocationInput";
                "eventId": "String";
                "pickupLocation": "LocationInput";
                "skills": "String";
                "taskType": "TaskType";
                "title": "String";
            };
        };
        "defaults": {};
        "runtimeScalars": {};
    };
};