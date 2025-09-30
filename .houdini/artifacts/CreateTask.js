export default {
    "name": "CreateTask",
    "kind": "HoudiniMutation",
    "hash": "3ba4a2530b44883cac5d4a52cf06ea00f286897c6f67a4b51e5b99cd99d9cecd",

    "raw": `mutation CreateTask($input: CreateTaskInput!) {
  createTask(input: $input) {
    id
  }
}
`,

    "rootType": "Mutation",
    "stripVariables": [],

    "selection": {
        "fields": {
            "createTask": {
                "type": "Task",
                "keyRaw": "createTask(input: $input)",

                "selection": {
                    "fields": {
                        "id": {
                            "type": "ID",
                            "keyRaw": "id",
                            "visible": true
                        }
                    }
                },

                "visible": true
            }
        }
    },

    "pluginData": {
        "houdini-svelte": {}
    },

    "input": {
        "fields": {
            "input": "CreateTaskInput"
        },

        "types": {
            "AttachmentInput": {
                "fileName": "String",
                "fileSize": "Float",
                "fileUrl": "String"
            },

            "DateRangeInput": {
                "end": "String",
                "start": "String"
            },

            "LocationInput": {
                "displayName": "String",
                "latitude": "Float",
                "locationLoaded": "Boolean",
                "longitude": "Float",
                "zipCode": "String"
            },

            "CreateTaskInput": {
                "addressLine1": "String",
                "addressLine2": "String",
                "attachments": "AttachmentInput",
                "boostAmount": "Float",
                "boostDuration": "Int",
                "boostTask": "Boolean",
                "budget": "Float",
                "budgetType": "BudgetType",
                "categoryIds": "Int",
                "city": "String",
                "country": "String",
                "dateRange": "DateRangeInput",
                "deadlineDate": "String",
                "description": "String",
                "dropOffLocation": "LocationInput",
                "estimatedHours": "Float",
                "imageUrls": "String",
                "isRemovals": "Boolean",
                "latitude": "Float",
                "longitude": "Float",
                "pickupLocation": "LocationInput",
                "postalCode": "String",
                "saveAsTemplate": "Boolean",
                "skillIds": "Int",
                "skillImportance": "SkillImportance",
                "state": "String",
                "taskType": "TaskType",
                "templateId": "Int",
                "templateName": "String",
                "title": "String",
                "visibility": "TaskVisibility"
            }
        },

        "defaults": {},
        "runtimeScalars": {}
    }
};

"HoudiniHash=ffb0b0f0b91797261092ee84bb1606362bb635af94a27c14cf797677480a08f9";