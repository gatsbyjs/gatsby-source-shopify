"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOperations = void 0;
const client_1 = require("./client");
const queries_1 = require("./queries");
function createOperations(options) {
    const client = client_1.createClient(options);
    function currentOperation() {
        return client.request(queries_1.OPERATION_STATUS_QUERY);
    }
    function createOperation(operationQuery) {
        return client.request(operationQuery);
    }
    async function finishLastOperation() {
        const { currentBulkOperation } = await currentOperation();
        if (currentBulkOperation && currentBulkOperation.id) {
            if (currentBulkOperation.status == `COMPLETED`) {
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, 1000));
            return finishLastOperation();
        }
    }
    /* Maybe the interval should be adjustable, because users
     * with larger data sets could easily wait longer. We could
     * perhaps detect that the interval being used is too small
     * based on returned object counts and iteration counts, and
     * surface feedback to the user suggesting that they increase
     * the interval.
     */
    async function completedOperation(operationId, interval = 1000) {
        const operation = await client.request(queries_1.OPERATION_BY_ID, {
            id: operationId,
        });
        if (operation.node.status === "COMPLETED") {
            return operation;
        }
        await new Promise((resolve) => setTimeout(resolve, interval));
        return completedOperation(operationId, interval);
    }
    return {
        incrementalProducts(date) {
            return createOperation(queries_1.incrementalProductsQuery(date));
        },
        incrementalOrders(date) {
            return createOperation(queries_1.incrementalOrdersQuery(date));
        },
        createProductsOperation() {
            return createOperation(queries_1.CREATE_PRODUCTS_OPERATION);
        },
        createOrdersOperation() {
            return createOperation(queries_1.CREATE_ORDERS_OPERATION);
        },
        finishLastOperation,
        completedOperation,
    };
}
exports.createOperations = createOperations;
//# sourceMappingURL=operations.js.map