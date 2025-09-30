export default {
    "name": "TriggerSavedSearchCheck",
    "kind": "HoudiniMutation",
    "hash": "90f3dcc819b660472ebe4f4d293694758d58db83ce784aff24a8901f831a2350",

    "raw": `mutation TriggerSavedSearchCheck($task: TaskBodyInput!) {
  triggerSavedSearchCheck(task: $task) {
    success
    matchCount
    message
  }
}
`,

    "rootType": "Mutation",
    "stripVariables": [],

    "selection": {
        "fields": {
            "triggerSavedSearchCheck": {
                "type": "SavedSearchNotificationResult",
                "keyRaw": "triggerSavedSearchCheck(task: $task)",

                "selection": {
                    "fields": {
                        "success": {
                            "type": "Boolean",
                            "keyRaw": "success",
                            "visible": true
                        },

                        "matchCount": {
                            "type": "Int",
                            "keyRaw": "matchCount",
                            "nullable": true,
                            "visible": true
                        },

                        "message": {
                            "type": "String",
                            "keyRaw": "message",
                            "nullable": true,
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
            "task": "TaskBodyInput"
        },

        "types": {
            "BudgetInput": {
                "currency": "String",
                "tier": "String",
                "type": "BudgetTypeEnum"
            },

            "LocationInput": {
                "displayName": "String",
                "latitude": "Float",
                "locationLoaded": "Boolean",
                "longitude": "Float",
                "zipCode": "String"
            },

            "TaskBodyInput": {
                "budget": "BudgetInput",
                "categories": "String",
                "dateRange": "String",
                "deadline": "String",
                "description": "String",
                "dropOffLocation": "LocationInput",
                "eventId": "String",
                "pickupLocation": "LocationInput",
                "skills": "String",
                "taskType": "TaskType",
                "title": "String"
            }
        },

        "defaults": {},
        "runtimeScalars": {}
    }
};

"HoudiniHash=14ea224abb8c880bda6afa77b44b9db454b533927e369f58de93595e48f04eb1";