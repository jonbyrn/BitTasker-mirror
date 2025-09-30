export type SubscribeToTopic = {
    readonly "input": SubscribeToTopic$input;
    readonly "result": SubscribeToTopic$result;
};

export type SubscribeToTopic$result = {
    readonly subscribeToTopic: {
        readonly success: boolean;
        readonly message: string;
    };
};

type SubscribeToTopicInput = {
    topic: string;
};

export type SubscribeToTopic$input = {
    input: SubscribeToTopicInput;
};

export type SubscribeToTopic$optimistic = {
    readonly subscribeToTopic?: {
        readonly success?: boolean;
        readonly message?: string;
    };
};

export type SubscribeToTopic$artifact = {
    "name": "SubscribeToTopic";
    "kind": "HoudiniMutation";
    "hash": "27475fafe6bee46950004329fbe7410ffa8dff0991b58e94519369401c5e228a";
    "raw": `mutation SubscribeToTopic($input: SubscribeToTopicInput!) {
  subscribeToTopic(input: $input) {
    success
    message
  }
}
`;
    "rootType": "Mutation";
    "stripVariables": [];
    "selection": {
        "fields": {
            "subscribeToTopic": {
                "type": "NotificationResponse";
                "keyRaw": "subscribeToTopic(input: $input)";
                "selection": {
                    "fields": {
                        "success": {
                            "type": "Boolean";
                            "keyRaw": "success";
                            "visible": true;
                        };
                        "message": {
                            "type": "String";
                            "keyRaw": "message";
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
            "input": "SubscribeToTopicInput";
        };
        "types": {
            "SubscribeToTopicInput": {
                "topic": "String";
            };
        };
        "defaults": {};
        "runtimeScalars": {};
    };
};