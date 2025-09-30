export default {
    "name": "SubscribeToTopic",
    "kind": "HoudiniMutation",
    "hash": "27475fafe6bee46950004329fbe7410ffa8dff0991b58e94519369401c5e228a",

    "raw": `mutation SubscribeToTopic($input: SubscribeToTopicInput!) {
  subscribeToTopic(input: $input) {
    success
    message
  }
}
`,

    "rootType": "Mutation",
    "stripVariables": [],

    "selection": {
        "fields": {
            "subscribeToTopic": {
                "type": "NotificationResponse",
                "keyRaw": "subscribeToTopic(input: $input)",

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
            "input": "SubscribeToTopicInput"
        },

        "types": {
            "SubscribeToTopicInput": {
                "topic": "String"
            }
        },

        "defaults": {},
        "runtimeScalars": {}
    }
};

"HoudiniHash=b13559f379b7e7a9923974263bff602a25bbef9558795acffff9ef399f04d74b";