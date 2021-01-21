const { createRemoteFileNode } = require("gatsby-source-filesystem")
const { client } = require("./client")
const { OPERATION_STATUS_QUERY, OPERATION_BY_ID, CREATE_OPERATION } = require("./queries")

const TYPE_PREFIX = `Shopify`

function createOperation() {
  return client.request(CREATE_OPERATION)
}

function currentOperation() {
  return client.request(OPERATION_STATUS_QUERY)
}

async function finishLastOperation() {
  const { currentBulkOperation } = await currentOperation()
  if (currentBulkOperation && currentBulkOperation.id) {
    if (currentBulkOperation.status == `COMPLETED`) {
      return
    }
    await new Promise(resolve => setTimeout(resolve, 1000))
    return finishLastOperation()
  }
}

async function downloadAndCreateFileNode(
  { url, nodeId },
  {
    createNode,
    createNodeId,
    touchNode,
    store,
    cache,
    getCache,
    reporter,
    downloadImages,
  }){

    if (!downloadImages) return undefined

    const mediaDataCacheKey = `${TYPE_PREFIX}__Media__${url}`
    const cacheMediaData = await cache.get(mediaDataCacheKey)

    if (cacheMediaData) {
      const fileNodeID = cacheMediaData.fileNodeID
      touchNode({ nodeId: fileNodeID })
      return fileNodeID
    }
  
    console.info(`Creating remote file node for node ID: '${nodeId}'`)
    const fileNode = await createRemoteFileNode({
      url,
      store,
      cache,
      createNode,
      createNodeId,
      getCache,
      parentNodeId: nodeId,
      reporter,
    })
  
    if (fileNode) {
      const fileNodeID = fileNode.id
      await cache.set(mediaDataCacheKey, { fileNodeID })
      return fileNodeID
    }
  
    return undefined
}

/* Maybe the interval should be adjustable, because users
* with larger data sets could easily wait longer. We could
* perhaps detect that the interval being used is too small
* based on returned object counts and iteration counts, and
* surface feedback to the user suggesting that they increase
* the interval.
*/
async function completedOperation(operationId, interval = 1000) {
  console.log(operationId)
  const operation = await client.request(OPERATION_BY_ID, {
    id: operationId
  })

  console.info(operation)

  if (operation.node.status === 'COMPLETED') {
    return operation
  }

  await new Promise(resolve => setTimeout(resolve, interval))

  return completedOperation(operationId, interval)
}

module.exports = {
  currentOperation,
  finishLastOperation,
  completedOperation,
  createOperation,
  downloadAndCreateFileNode,
  TYPE_PREFIX
}
