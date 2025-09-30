export type CheckOnboardingStatus = {
    readonly "input": CheckOnboardingStatus$input;
    readonly "result": CheckOnboardingStatus$result | undefined;
};

export type CheckOnboardingStatus$result = {
    readonly IsOnboardingComplete: {
        readonly isComplete: boolean;
        readonly missingFields: (string)[];
    };
};

export type CheckOnboardingStatus$input = null;

export type CheckOnboardingStatus$artifact = {
    "name": "CheckOnboardingStatus";
    "kind": "HoudiniQuery";
    "hash": "75861a5817e7fbe32a10a2a116dd2b9c0b87d92dd40e062d2ceb324907b2b5c0";
    "raw": `query CheckOnboardingStatus {
  IsOnboardingComplete {
    isComplete
    missingFields
  }
}
`;
    "rootType": "Query";
    "stripVariables": [];
    "selection": {
        "fields": {
            "IsOnboardingComplete": {
                "type": "OnboardingStatusDto";
                "keyRaw": "IsOnboardingComplete";
                "selection": {
                    "fields": {
                        "isComplete": {
                            "type": "Boolean";
                            "keyRaw": "isComplete";
                            "visible": true;
                        };
                        "missingFields": {
                            "type": "String";
                            "keyRaw": "missingFields";
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