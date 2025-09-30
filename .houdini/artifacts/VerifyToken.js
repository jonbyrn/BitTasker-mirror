export default {
    "name": "VerifyToken",
    "kind": "HoudiniQuery",
    "hash": "74b915fc7d7c37fba7a4131b998029b29f5b9507c2402412a3c5450ec726fe87",

    "raw": `query VerifyToken($token: String!) {
  verifyToken(token: $token) {
    isValid
    user {
      id
      email
      name
      profilePictureUrl
      onboardingComplete
      userRole
      status
      isEmailVerified
      lastLoginAt
      createdAt
      updatedAt
    }
  }
}
`,

    "rootType": "Query",
    "stripVariables": [],

    "selection": {
        "fields": {
            "verifyToken": {
                "type": "TokenVerificationResult",
                "keyRaw": "verifyToken(token: $token)",

                "selection": {
                    "fields": {
                        "isValid": {
                            "type": "Boolean",
                            "keyRaw": "isValid",
                            "visible": true
                        },

                        "user": {
                            "type": "User",
                            "keyRaw": "user",
                            "nullable": true,

                            "selection": {
                                "fields": {
                                    "id": {
                                        "type": "ID",
                                        "keyRaw": "id",
                                        "visible": true
                                    },

                                    "email": {
                                        "type": "String",
                                        "keyRaw": "email",
                                        "nullable": true,
                                        "visible": true
                                    },

                                    "name": {
                                        "type": "String",
                                        "keyRaw": "name",
                                        "nullable": true,
                                        "visible": true
                                    },

                                    "profilePictureUrl": {
                                        "type": "String",
                                        "keyRaw": "profilePictureUrl",
                                        "nullable": true,
                                        "visible": true
                                    },

                                    "onboardingComplete": {
                                        "type": "Boolean",
                                        "keyRaw": "onboardingComplete",
                                        "visible": true
                                    },

                                    "userRole": {
                                        "type": "UserRole",
                                        "keyRaw": "userRole",
                                        "visible": true
                                    },

                                    "status": {
                                        "type": "UserStatus",
                                        "keyRaw": "status",
                                        "visible": true
                                    },

                                    "isEmailVerified": {
                                        "type": "Boolean",
                                        "keyRaw": "isEmailVerified",
                                        "visible": true
                                    },

                                    "lastLoginAt": {
                                        "type": "DateTime",
                                        "keyRaw": "lastLoginAt",
                                        "nullable": true,
                                        "visible": true
                                    },

                                    "createdAt": {
                                        "type": "DateTime",
                                        "keyRaw": "createdAt",
                                        "visible": true
                                    },

                                    "updatedAt": {
                                        "type": "DateTime",
                                        "keyRaw": "updatedAt",
                                        "visible": true
                                    }
                                }
                            },

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
            "token": "String"
        },

        "types": {},
        "defaults": {},
        "runtimeScalars": {}
    },

    "policy": "CacheOrNetwork",
    "partial": false
};

"HoudiniHash=0aa090beef15865e9da7051544622a9a86c086dd26e3d8098f8206aa80f5b03e";