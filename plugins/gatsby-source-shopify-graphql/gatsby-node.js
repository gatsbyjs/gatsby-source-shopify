require("dotenv").config()
const fetch = require("node-fetch")
const { createNodeHelpers } = require("gatsby-node-helpers")
const { createInterface } = require("readline")
const { finishLastOperation, createOperation, completedOperation } = require('./operations')

module.exports.sourceNodes = async function({ reporter, actions, createNodeId, createContentDigest }) {
  const nodeHelpers = createNodeHelpers({
    typePrefix: `Shopify`,
    createNodeId,
    createContentDigest,
  })

  await finishLastOperation()

  const { bulkOperationRunQuery: { userErrors, bulkOperation} } = await createOperation()

  if (userErrors.length) {
    reporter.panic({
      context: {
        sourceMessage: `Couldn't perform bulk operation`
      }
    }, ...userErrors)
  }

  let resp = await completedOperation(bulkOperation.id)

  const results = await fetch(resp.node.url)

  /* FIXME
   * Getting warnings about this being experimental.
   * We want to read the stream one line at a time, but let's make
   * sure to do it in the recommended way.
   */
  const rl = createInterface({
    input: results.body,
    crlfDelay: Infinity,
  })

  const objects = []
  for await (const line of rl) {
    objects.push(JSON.parse(line))
  }

  // 'gid://shopify/Metafield/6936247730264'
  const pattern = /^gid:\/\/shopify\/(\w+)\/(.+)$/
  const factoryMap = {}
  for(var i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i]
    const [_, remoteType, shopifyId] = obj.id.match(pattern)
    if (!factoryMap[remoteType]) {
      factoryMap[remoteType] = nodeHelpers.createNodeFactory(remoteType)
    }

    if (obj.__parentId) {
      const [_, remoteType, id] = obj.__parentId.match(pattern)
      const field = remoteType.charAt(0).toLowerCase() + remoteType.slice(1)
      const idField = `${field}Id`
      obj[idField] = id
      delete obj.__parentId
    }

    const Node = factoryMap[remoteType]
    const node = Node({ ...obj, id: shopifyId })
    actions.createNode(node)
  }
}

exports.createSchemaCustomization = ({ actions }) => {
  actions.createTypes(`
    type ShopifyProductVariant implements Node {
      product: ShopifyProduct @link(from: "productId", by: "shopifyId")
    }

    type ShopifyProduct implements Node {
      variants: [ShopifyProductVariant]
    }
  `)
}

exports.createResolvers = ({ createResolvers }) => {
  createResolvers({
    ShopifyProduct: {
      variants: {
        type: ["ShopifyProductVariant"],
        resolve(source, args, context, info) {
          return context.nodeModel.runQuery({
            query: {
              filter: {
                productId: { eq: source.shopifyId }
              }
            },
            type: "ShopifyProductVariant",
            firstOnly: false,
          })
        }
      }
    },
  })
}