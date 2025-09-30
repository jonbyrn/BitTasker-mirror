export type SendNotification = {
    readonly "input": SendNotification$input;
    readonly "result": SendNotification$result;
};

export type SendNotification$result = {
    readonly sendNotification: {
        readonly success: boolean;
        readonly message: string;
    };
};

type SendNotificationInput = {
    body: string;
    deviceId?: string | null | undefined;
    title: string;
    type?: string | null | undefined;
};

export type SendNotification$input = {
    input: SendNotificationInput;
};

export type SendNotification$optimistic = {
    readonly sendNotification?: {
        readonly success?: boolean;
        readonly message?: string;
    };
};

export type SendNotification$artifact = {
    "name": "SendNotification";
    "kind": "HoudiniMutation";
    "hash": "9571a436b2ac3051d488103480b2b79f4d5cf600d0725ffe47174143ddf40e29";
    "raw": `mutation SendNotification($input: SendNotificationInput!) {
  sendNotification(input: $input) {
    success
    message
  }
}
`;
    "rootType": "Mutation";
    "stripVariables": [];
    "selection": {
        "fields": {
            "sendNotification": {
                "type": "NotificationResponse";
                "keyRaw": "sendNotification(input: $input)";
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
            "input": "SendNotificationInput";
        };
        "types": {
            "SendNotificationInput": {
                "body": "String";
                "deviceId": "String";
                "title": "String";
                "type": "String";
            };
        };
        "defaults": {};
        "runtimeScalars": {};
    };
};