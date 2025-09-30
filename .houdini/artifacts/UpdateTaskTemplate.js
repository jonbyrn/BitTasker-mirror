export default {
    "name": "UpdateTaskTemplate",
    "kind": "HoudiniMutation",
    "hash": "1b486b96b92153ac20f6295c73d3bd19ca84ebf62c1914131066f61fc455a1e9",

    "raw": `mutation UpdateTaskTemplate($updateTaskTemplateId: Int!, $input: UpdateTaskTemplateInput!) {
  updateTaskTemplate(id: $updateTaskTemplateId, input: $input) {
    id
  }
}
`,

    "rootType": "Mutation",
    "stripVariables": [],

    "selection": {
        "fields": {
            "updateTaskTemplate": {
                "type": "TaskTemplateResponse",
                "keyRaw": "updateTaskTemplate(id: $updateTaskTemplateId, input: $input)",

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
            "updateTaskTemplateId": "Int",
            "input": "UpdateTaskTemplateInput"
        },

        "types": {
            "RecurrencePatternInput": {
                "dayOfMonth": "Int",
                "daysOfWeek": "Int",
                "endDate": "DateTime",
                "frequency": "RecurrenceFrequency",
                "interval": "Int",
                "maxOccurrences": "Int"
            },

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

            "UpdateTaskInput": {
                "addressLine1": "String",
                "addressLine2": "String",
                "attachments": "AttachmentInput",
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
                "skillIds": "Int",
                "skillImportance": "SkillImportance",
                "state": "String",
                "status": "TaskStatus",
                "taskType": "TaskType",
                "title": "String",
                "visibility": "TaskVisibility"
            },

            "UpdateTaskTemplateInput": {
                "recurrencePattern": "RecurrencePatternInput",
                "task": "UpdateTaskInput"
            }
        },

        "defaults": {},
        "runtimeScalars": {}
    }
};

"HoudiniHash=f1ef104aa1b6089c24ac7cf144c4540c8ee4075a7abf542a8248087a5eea98d7";