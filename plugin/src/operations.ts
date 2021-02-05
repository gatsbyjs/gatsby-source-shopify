import { createClient } from "./client";

import {
  OPERATION_STATUS_QUERY,
  OPERATION_BY_ID,
  CREATE_PRODUCTS_OPERATION,
  CREATE_ORDERS_OPERATION,
  incrementalProductsQuery,
  incrementalOrdersQuery,
} from "./queries";

export interface BulkOperationRunQueryResponse {
  bulkOperationRunQuery: {
    userErrors: Error[];
    bulkOperation: {
      id: string;
    };
  };
}

export function createOperations(options: ShopifyPluginOptions) {
  const client = createClient(options);

  function currentOperation() {
    return client.request(OPERATION_STATUS_QUERY);
  }

  function createOperation(
    operationQuery: string
  ): Promise<BulkOperationRunQueryResponse> {
    return client.request(operationQuery);
  }

  async function finishLastOperation(): Promise<void> {
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
  async function completedOperation(
    operationId: string,
    interval = 1000
  ): Promise<{ node: { objectCount: string; url: string } }> {
    const operation = await client.request(OPERATION_BY_ID, {
      id: operationId,
    });

    if (operation.node.status === "COMPLETED") {
      return operation;
    }

    await new Promise((resolve) => setTimeout(resolve, interval));

    return completedOperation(operationId, interval);
  }

  return {
    incrementalProducts(date: Date) {
      return createOperation(incrementalProductsQuery(date));
    },

    incrementalOrders(date: Date) {
      return createOperation(incrementalOrdersQuery(date));
    },

    createProductsOperation() {
      return createOperation(CREATE_PRODUCTS_OPERATION);
    },

    createOrdersOperation() {
      return createOperation(CREATE_ORDERS_OPERATION);
    },

    finishLastOperation,
    completedOperation,
  };
}
