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

export interface ShopifyBulkOperation {
  execute: () => Promise<BulkOperationRunQueryResponse>;
  name: string;
  process: (
    objects: BulkResults,
    nodeBuilder: NodeBuilder,
    gatsbyApi: SourceNodesArgs,
    pluginOptions: ShopifyPluginOptions
  ) => Promise<NodeInput>[];
}

const finishedStatuses = [`COMPLETED`, `FAILED`, `CANCELED`, `EXPIRED`];
const failedStatuses = [`FAILED`, `CANCELED`];

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

  async function cancelOperation(id: string) {
    return client.request<BulkOperationCancelResponse>(CANCEL_OPERATION, {
      id,
    });
  }

  async function cancelOperationInProgress(): Promise<void> {
    let { currentBulkOperation: bulkOperation } = await currentOperation();
    if (!bulkOperation) {
      return;
    }

    if (bulkOperation.status === `RUNNING`) {
      reporter.info(
        `Canceling a currently running operation: ${bulkOperation.id}, this could take a few moments`
      );

      const { bulkOperationCancel } = await cancelOperation(bulkOperation.id);

      bulkOperation = bulkOperationCancel.bulkOperation;

      while (bulkOperation.status !== `CANCELED`) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        const currentOp = await currentOperation();
        bulkOperation = currentOp.currentBulkOperation;
      }
    } else {
      /**
       * Just because it's not running doesn't mean it's done. For
       * example, it could be CANCELING. We still have to wait for it
       * to be officially finished before we start a new one.
       */
      while (!finishedStatuses.includes(bulkOperation.status)) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        bulkOperation = (await currentOperation()).currentBulkOperation;
      }
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
    nodeStatsChangedCallback: (node: BulkOperationNode) => void,
    interval = 1000
  ): Promise<{ node: BulkOperationNode }> {
    let operation = await client.request<{
      node: BulkOperationNode;
    }>(OPERATION_BY_ID, {
      id: operationId,
    });

    nodeStatsChangedCallback(operation.node);

    while (true) {
      if (options.verboseLogging) {
        reporter.verbose(`
          Waiting for operation to complete

          ${operationId}

          Status: ${operation.node.status}

          Object count: ${operation.node.objectCount}

          Url: ${operation.node.url}
        `);
      }

      if (failedStatuses.includes(operation.node.status)) {
        throw new OperationError(operation.node);
      }

      if (operation.node.status === "COMPLETED") {
        return operation;
      }

      await new Promise((resolve) => setTimeout(resolve, interval));

      const nextOperation = await client.request<{
        node: BulkOperationNode;
      }>(OPERATION_BY_ID, {
        id: operationId,
      });

      const updated: boolean =
        JSON.stringify(operation.node) !== JSON.stringify(nextOperation.node);

      if (updated) nodeStatsChangedCallback(nextOperation.node);

      operation = nextOperation;
    }
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

    cancelOperationInProgress,
    cancelOperation,
    finishLastOperation,
    completedOperation,
  };
}
