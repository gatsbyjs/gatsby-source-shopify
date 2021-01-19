const { client } = require("./client")
const { OPERATION_STATUS_QUERY, OPERATION_BY_ID } = require("./queries")

function currentOperation() {
  return client.request(OPERATION_STATUS_QUERY)
}

async function finishLastOperation() {
  const { currentBulkOperation } = currentOperation()
  if (currentBulkOperation && currentBulkOperation.id) {
    await new Promise(resolve => setTimeout(resolve, 1000))
    return this.finishLastOperation()
  }

}

async function completedOperation(operationId) {
  console.log(operationId)
  const operation = await client.request(OPERATION_BY_ID, {
    id: operationId
  })

  console.log(operation)

  return operation
}

module.exports = {
  currentOperation,
  finishLastOperation,
  completedOperation,
}