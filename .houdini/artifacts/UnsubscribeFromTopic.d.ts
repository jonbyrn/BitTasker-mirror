export type UnsubscribeFromTopic = {
    readonly "input": UnsubscribeFromTopic$input;
    readonly "result": UnsubscribeFromTopic$result;
};

export type UnsubscribeFromTopic$result = {
    readonly unsubscribeFromTopic: {
        readonly success: boolean;
        readonly message: string;
    };
};

type SubscribeToTopicInput = {
    topic: string;
};

export type UnsubscribeFromTopic$input = {
    input: SubscribeToTopicInput;
};

export type UnsubscribeFromTopic$optimistic = {
    readonly unsubscribeFromTopic?: {
        readonly success?: boolean;
        readonly message?: string;
    };
};

export type UnsubscribeFromTopic$artifact = {
    "name": "UnsubscribeFromTopic";
    "kind": "HoudiniMutation";
    "hash": "44b6ac04774b59b855ca5140b07e2d363c57a8636d8e81e163dd52c80d23c663";
    "raw": `mutation UnsubscribeFromTopic($input: SubscribeToTopicInput!) {
  unsubscribeFromTopic(input: $input) {
    success
    message
  }
}
`;
    "rootType": "Mutation";
    "stripVariables": [];
    "selection": {
        "fields": {
            "unsubscribeFromTopic": {
                "type": "NotificationResponse";
                "keyRaw": "unsubscribeFromTopic(input: $input)";
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