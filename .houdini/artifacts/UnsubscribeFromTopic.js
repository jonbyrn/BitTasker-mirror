export default {
    "name": "UnsubscribeFromTopic",
    "kind": "HoudiniMutation",
    "hash": "44b6ac04774b59b855ca5140b07e2d363c57a8636d8e81e163dd52c80d23c663",

    "raw": `mutation UnsubscribeFromTopic($input: SubscribeToTopicInput!) {
  unsubscribeFromTopic(input: $input) {
    success
    message
  }
}
`,

    "rootType": "Mutation",
    "stripVariables": [],

    "selection": {
        "fields": {
            "unsubscribeFromTopic": {
                "type": "NotificationResponse",
                "keyRaw": "unsubscribeFromTopic(input: $input)",

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

"HoudiniHash=d5d31cd6c7d59c61e940ba307a69c3ca2d1df4920779ecd3128d83bd3883cd04";