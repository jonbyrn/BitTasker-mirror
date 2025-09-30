export type MyNotificationPreferences = {
    readonly "input": MyNotificationPreferences$input;
    readonly "result": MyNotificationPreferences$result | undefined;
};

export type MyNotificationPreferences$result = {
    readonly myNotificationPreferences: {
        readonly id: string;
        readonly pushTaskMatches: boolean;
        readonly pushBidUpdates: boolean;
        readonly pushMessages: boolean;
        readonly pushPayments: boolean;
        readonly pushSystemUpdates: boolean;
        readonly email: boolean;
        readonly inApp: boolean;
        readonly push: boolean;
        readonly createdAt: string;
        readonly updatedAt: string;
    } | null;
};

export type MyNotificationPreferences$input = null;

export type MyNotificationPreferences$artifact = {
    "name": "MyNotificationPreferences";
    "kind": "HoudiniQuery";
    "hash": "80a30f57180348c8005276bb6a6d35e0e7c7bedab0d497b278590a10c1e5a1cc";
    "raw": `query MyNotificationPreferences {
  myNotificationPreferences {
    id
    pushTaskMatches
    pushBidUpdates
    pushMessages
    pushPayments
    pushSystemUpdates
    email
    inApp
    push
    createdAt
    updatedAt
  }
}
`;
    "rootType": "Query";
    "stripVariables": [];
    "selection": {
        "fields": {
            "myNotificationPreferences": {
                "type": "UserNotificationPreferences";
                "keyRaw": "myNotificationPreferences";
                "nullable": true;
                "selection": {
                    "fields": {
                        "id": {
                            "type": "ID";
                            "keyRaw": "id";
                            "visible": true;
                        };
                        "pushTaskMatches": {
                            "type": "Boolean";
                            "keyRaw": "pushTaskMatches";
                            "visible": true;
                        };
                        "pushBidUpdates": {
                            "type": "Boolean";
                            "keyRaw": "pushBidUpdates";
                            "visible": true;
                        };
                        "pushMessages": {
                            "type": "Boolean";
                            "keyRaw": "pushMessages";
                            "visible": true;
                        };
                        "pushPayments": {
                            "type": "Boolean";
                            "keyRaw": "pushPayments";
                            "visible": true;
                        };
                        "pushSystemUpdates": {
                            "type": "Boolean";
                            "keyRaw": "pushSystemUpdates";
                            "visible": true;
                        };
                        "email": {
                            "type": "Boolean";
                            "keyRaw": "email";
                            "visible": true;
                        };
                        "inApp": {
                            "type": "Boolean";
                            "keyRaw": "inApp";
                            "visible": true;
                        };
                        "push": {
                            "type": "Boolean";
                            "keyRaw": "push";
                            "visible": true;
                        };
                        "createdAt": {
                            "type": "DateTime";
                            "keyRaw": "createdAt";
                            "visible": true;
                        };
                        "updatedAt": {
                            "type": "DateTime";
                            "keyRaw": "updatedAt";
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
    "policy": "CacheOrNetwork";
    "partial": false;
};