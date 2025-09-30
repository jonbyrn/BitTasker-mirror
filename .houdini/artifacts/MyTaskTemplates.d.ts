import { TaskStatus } from "$houdini/graphql/enums";
import { RecurrenceFrequency } from "$houdini/graphql/enums";
import type { ValueOf } from "$houdini/runtime/lib/types";

export type MyTaskTemplates = {
    readonly "input": MyTaskTemplates$input;
    readonly "result": MyTaskTemplates$result | undefined;
};

export type MyTaskTemplates$result = {
    readonly taskTemplates: ({
        readonly id: string;
        readonly name: string | null;
        readonly description: string | null;
        readonly createdAt: string | null;
        readonly recurrencePattern: {
            readonly frequency: ValueOf<typeof RecurrenceFrequency>;
            readonly daysOfWeek: (number)[] | null;
            readonly dayOfMonth: number | null;
            readonly interval: number;
            readonly endDate: string | null;
            readonly maxOccurrences: number | null;
        } | null;
        readonly task: {
            readonly title: string;
            readonly description: string;
            readonly budget: number | null;
            readonly status: ValueOf<typeof TaskStatus>;
        };
    })[];
};

export type MyTaskTemplates$input = null;

export type MyTaskTemplates$artifact = {
    "name": "MyTaskTemplates";
    "kind": "HoudiniQuery";
    "hash": "519f1d09c6714d7cc36542bc74d11a6274b513752538ffbf566f5e92cb5c187c";
    "raw": `query MyTaskTemplates {
  taskTemplates {
    id
    name
    description
    createdAt
    recurrencePattern {
      frequency
      daysOfWeek
      dayOfMonth
      interval
      endDate
      maxOccurrences
    }
    task {
      title
      description
      budget
      status
      id
    }
  }
}
`;
    "rootType": "Query";
    "stripVariables": [];
    "selection": {
        "fields": {
            "taskTemplates": {
                "type": "TaskTemplateResponse";
                "keyRaw": "taskTemplates";
                "selection": {
                    "fields": {
                        "id": {
                            "type": "ID";
                            "keyRaw": "id";
                            "visible": true;
                        };
                        "name": {
                            "type": "String";
                            "keyRaw": "name";
                            "nullable": true;
                            "visible": true;
                        };
                        "description": {
                            "type": "String";
                            "keyRaw": "description";
                            "nullable": true;
                            "visible": true;
                        };
                        "createdAt": {
                            "type": "String";
                            "keyRaw": "createdAt";
                            "nullable": true;
                            "visible": true;
                        };
                        "recurrencePattern": {
                            "type": "RecurrencePattern";
                            "keyRaw": "recurrencePattern";
                            "nullable": true;
                            "selection": {
                                "fields": {
                                    "frequency": {
                                        "type": "RecurrenceFrequency";
                                        "keyRaw": "frequency";
                                        "visible": true;
                                    };
                                    "daysOfWeek": {
                                        "type": "Int";
                                        "keyRaw": "daysOfWeek";
                                        "nullable": true;
                                        "visible": true;
                                    };
                                    "dayOfMonth": {
                                        "type": "Int";
                                        "keyRaw": "dayOfMonth";
                                        "nullable": true;
                                        "visible": true;
                                    };
                                    "interval": {
                                        "type": "Int";
                                        "keyRaw": "interval";
                                        "visible": true;
                                    };
                                    "endDate": {
                                        "type": "DateTime";
                                        "keyRaw": "endDate";
                                        "nullable": true;
                                        "visible": true;
                                    };
                                    "maxOccurrences": {
                                        "type": "Int";
                                        "keyRaw": "maxOccurrences";
                                        "nullable": true;
                                        "visible": true;
                                    };
                                };
                            };
                            "visible": true;
                        };
                        "task": {
                            "type": "Task";
                            "keyRaw": "task";
                            "selection": {
                                "fields": {
                                    "title": {
                                        "type": "String";
                                        "keyRaw": "title";
                                        "visible": true;
                                    };
                                    "description": {
                                        "type": "String";
                                        "keyRaw": "description";
                                        "visible": true;
                                    };
                                    "budget": {
                                        "type": "Float";
                                        "keyRaw": "budget";
                                        "nullable": true;
                                        "visible": true;
                                    };
                                    "status": {
                                        "type": "TaskStatus";
                                        "keyRaw": "status";
                                        "visible": true;
                                    };
                                    "id": {
                                        "type": "ID";
                                        "keyRaw": "id";
                                        "visible": true;
                                    };
                                };
                            };
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