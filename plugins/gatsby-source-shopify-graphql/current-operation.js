const { client } = require("./client")
const { OPERATION_STATUS_QUERY } = require("./queries")

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

module.exports = {
  currentOperation,
  finishLastOperation,
}