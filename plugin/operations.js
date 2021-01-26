const { client } = require("./client");
const {
  OPERATION_STATUS_QUERY,
  OPERATION_BY_ID,
  CREATE_PRODUCTS_OPERATION,
  CREATE_ORDERS_OPERATION,
  incrementalProductsQuery,
  incrementalOrdersQuery,
} = require("./queries");

function createOperation(operationQuery) {
  return client.request(operationQuery);
}

function incrementalProducts(date) {
  return createOperation(incrementalProductsQuery(date));
}

function incrementalOrders(date) {
  return createOperation(incrementalOrdersQuery(date));
}

function createProductsOperation() {
  return createOperation(CREATE_PRODUCTS_OPERATION);
}

function createOrdersOperation() {
  return createOperation(CREATE_ORDERS_OPERATION);
}

function currentOperation() {
  return client.request(OPERATION_STATUS_QUERY);
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
  console.log(operationId);
  const operation = await client.request(OPERATION_BY_ID, {
    id: operationId,
  });

  console.info(operation);

  if (operation.node.status === "COMPLETED") {
    return operation;
  }

  await new Promise((resolve) => setTimeout(resolve, interval));

  return completedOperation(operationId, interval);
}

module.exports = {
  currentOperation,
  finishLastOperation,
  completedOperation,
  createProductsOperation,
  createOrdersOperation,
  incrementalProducts,
  incrementalOrders,
};
