import { NodeInput, SourceNodesArgs } from "gatsby";
import { createClient } from "./client";
import { collectionsProcessor } from "./processors";
import { OperationError } from "./errors";

import {
  OPERATION_STATUS_QUERY,
  OPERATION_BY_ID,
  CREATE_PRODUCTS_OPERATION,
  CREATE_ORDERS_OPERATION,
  CREATE_COLLECTIONS_OPERATION,
  CANCEL_OPERATION,
  incrementalProductsQuery,
  incrementalOrdersQuery,
  incrementalCollectionsQuery,
} from "./queries";

interface UserError {
  field: string[];
  message: string;
}

export interface BulkOperationRunQueryResponse {
  bulkOperationRunQuery: {
    userErrors: UserError[];
    bulkOperation: BulkOperationNode;
  };
}

export interface BulkOperationCancelResponse {
  bulkOperation: BulkOperationNode;
  userErrors: UserError[];
}

export interface ShopifyBulkOperation {
  execute: () => Promise<BulkOperationRunQueryResponse>;
  name: string;
  process: (
    objects: BulkResults,
    nodeBuilder: NodeBuilder,
    gatsbyApi: SourceNodesArgs
  ) => Promise<NodeInput>[];
}

type BulkOperationStatus =
  | "CANCELED"
  | "CANCELING"
  | "COMPLETED"
  | "CREATED"
  | "EXPIRED"
  | "FAILED"
  | "RUNNING";

interface CurrentBulkOperationResponse {
  currentBulkOperation: {
    id: string;
    status: BulkOperationStatus;
  };
}

const finishedStatuses = [`COMPLETED`, `FAILED`, `CANCELED`, `EXPIRED`];

function defaultProcessor(objects: BulkResults, builder: NodeBuilder) {
  return objects.map(builder.buildNode);
}

export function createOperations(
  options: ShopifyPluginOptions,
  { reporter }: SourceNodesArgs
) {
  const client = createClient(options);

  function currentOperation(): Promise<CurrentBulkOperationResponse> {
    return client.request(OPERATION_STATUS_QUERY);
  }

  function createOperation(
    operationQuery: string,
    name: string,
    process?: ShopifyBulkOperation["process"]
  ): ShopifyBulkOperation {
    return {
      execute: () =>
        client.request<BulkOperationRunQueryResponse>(operationQuery),
      name,
      process: process || defaultProcessor,
    };
  }

  async function finishLastOperation(): Promise<void> {
    let { currentBulkOperation } = await currentOperation();
    if (currentBulkOperation && currentBulkOperation.id) {
      const timer = reporter.activityTimer(
        `Waiting for operation ${currentBulkOperation.id} : ${currentBulkOperation.status}`
      );
      timer.start();

      while (!finishedStatuses.includes(currentBulkOperation.status)) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        currentBulkOperation = (await currentOperation()).currentBulkOperation;
        if (options.verboseLogging) {
          reporter.verbose(
            `Polling operation ${currentBulkOperation.id} : ${currentBulkOperation.status}`
          );
        }
      }

      timer.end();
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
  ): Promise<{ node: BulkOperationNode }> {
    const operation = await client.request<{
      node: BulkOperationNode;
    }>(OPERATION_BY_ID, {
      id: operationId,
    });

    if (options.verboseLogging) {
      reporter.verbose(`
      Waiting for operation to complete

      ${operationId}

      Status: ${operation.node.status}

      Object count: ${operation.node.objectCount}

      Url: ${operation.node.url}
    `);
    }

    if (operation.node.status === "FAILED") {
      throw new OperationError(operation.node);
    }

    if (operation.node.status === "COMPLETED") {
      return operation;
    }

    await new Promise((resolve) => setTimeout(resolve, interval));

    return completedOperation(operationId, interval);
  }

  return {
    incrementalProducts(date: Date) {
      return createOperation(
        incrementalProductsQuery(date),
        "INCREMENTAL_PRODUCTS"
      );
    },

    incrementalOrders(date: Date) {
      return createOperation(
        incrementalOrdersQuery(date),
        "INCREMENTAL_ORDERS"
      );
    },

    incrementalCollections(date: Date) {
      return createOperation(
        incrementalCollectionsQuery(date),
        "INCREMENTAL_COLLECTIONS",
        collectionsProcessor
      );
    },

    createProductsOperation: createOperation(
      CREATE_PRODUCTS_OPERATION,
      "PRODUCTS"
    ),

    createOrdersOperation: createOperation(CREATE_ORDERS_OPERATION, "ORDERS"),

    createCollectionsOperation: createOperation(
      CREATE_COLLECTIONS_OPERATION,
      "COLLECTIONS",
      collectionsProcessor
    ),

    cancelOperation(id: string) {
      return client.request<BulkOperationCancelResponse>(CANCEL_OPERATION, {
        id,
      });
    },

    finishLastOperation,
    completedOperation,
  };
}
