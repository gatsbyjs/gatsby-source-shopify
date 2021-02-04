export declare const OPERATION_STATUS_QUERY = "\n    query {\n      currentBulkOperation {\n        id\n        status\n        errorCode\n        createdAt\n        completedAt\n        objectCount\n        fileSize\n        url\n        partialDataUrl\n      }\n    }\n  ";
export declare const OPERATION_BY_ID = "\nquery OPERATION_BY_ID($id: ID!) {\n  node(id: $id) {\n    ... on BulkOperation {\n      id\n      status\n      errorCode\n      createdAt\n      completedAt\n      objectCount\n      fileSize\n      url\n      partialDataUrl\n    }\n  }\n}\n";
export declare const CREATE_PRODUCTS_OPERATION: string;
export declare const CREATE_ORDERS_OPERATION: string;
export declare const incrementalProductsQuery: (date: Date) => string;
export declare const incrementalOrdersQuery: (date: Date) => string;
