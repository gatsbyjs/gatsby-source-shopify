export declare function createOperations(options: ShopifyPluginOptions): {
    incrementalProducts(date: Date): Promise<any>;
    incrementalOrders(date: Date): Promise<any>;
    createProductsOperation(): Promise<any>;
    createOrdersOperation(): Promise<any>;
    finishLastOperation: () => any;
    completedOperation: (operationId: string, interval?: number) => any;
};
