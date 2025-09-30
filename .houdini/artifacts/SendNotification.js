export default {
    "name": "SendNotification",
    "kind": "HoudiniMutation",
    "hash": "9571a436b2ac3051d488103480b2b79f4d5cf600d0725ffe47174143ddf40e29",

    "raw": `mutation SendNotification($input: SendNotificationInput!) {
  sendNotification(input: $input) {
    success
    message
  }
}
`,

    "rootType": "Mutation",
    "stripVariables": [],

    "selection": {
        "fields": {
            "sendNotification": {
                "type": "NotificationResponse",
                "keyRaw": "sendNotification(input: $input)",

                "selection": {
                    "fields": {
                        "success": {
                            "type": "Boolean",
                            "keyRaw": "success",
                            "visible": true
                        },

                        "message": {
                            "type": "String",
                            "keyRaw": "message",
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
            "input": "SendNotificationInput"
        },

        "types": {
            "SendNotificationInput": {
                "body": "String",
                "deviceId": "String",
                "title": "String",
                "type": "String"
            }
        },

        "defaults": {},
        "runtimeScalars": {}
    }
};

"HoudiniHash=4653cf687b9c80add42a36b87e0faf5c3ae8a3219f3bcab47dff8bc6032a2066";