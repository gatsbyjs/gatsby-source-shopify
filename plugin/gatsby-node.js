require("dotenv").config()
const fetch = require("node-fetch")
const { createNodeHelpers } = require("gatsby-node-helpers")
const { createInterface } = require("readline")
const { finishLastOperation, createProductsOperation, createOrdersOperation, completedOperation } = require('./operations')
const { nodeBuilder, idPattern } = require('./node-builder')
const { fetchEventsSince } = require('./events')

module.exports.pluginOptionsSchema = ({ Joi }) => {
  return Joi.object({
    shopifyConnections: Joi.array().default([]).items(Joi.string().valid('orders'))
  })
}

async function sourceAllNodes(gatsbyApi, pluginOptions) {
  const { reporter, actions, createNodeId, createContentDigest } = gatsbyApi
  const operations = [createProductsOperation]
  if (pluginOptions.shopifyConnections.includes('orders')) {
    operations.push(createOrdersOperation)
  }

  const nodeHelpers = createNodeHelpers({
    typePrefix: `Shopify`,
    createNodeId,
    createContentDigest,
  })

  for await (const op of operations) {
    await finishLastOperation()

    const { bulkOperationRunQuery: { userErrors, bulkOperation} } = await op()

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

    for(var i = 0; i < objects.length; i++) {
      const obj = objects[i]
      const builder = nodeBuilder(nodeHelpers)
      const node = builder.buildNode(obj)
      actions.createNode(node)
    }
  }

}

const shopifyNodeTypes = [
  `ShopifyLineItem`,
  `ShopifyMetafield`,
  `ShopifyOrder`,
  `ShopifyProduct`,
  `ShopifyProductVariant`,
  `ShopifyProductVariantPricePair`,
]

async function sourceChangedNodes(gatsbyApi) {
  const lastBuildTime = await gatsbyApi.cache.get(`LAST_BUILD_TIME`)
  const eventsPromise = fetchEventsSince(new Date(lastBuildTime))
  const touchNode = node => gatsbyApi.actions.touchNode({ nodeId: node.id })
  for (nodeType of shopifyNodeTypes) {
    gatsbyApi.getNodesByType(nodeType).forEach(touchNode)
  }

  // We'll do something with this later
  await eventsPromise
}

module.exports.sourceNodes = async function(gatsbyApi, pluginOptions) {
  const lastBuildTime = await gatsbyApi.cache.get(`LAST_BUILD_TIME`)
  if (lastBuildTime) {
    console.log(`Already did that at ${lastBuildTime}`)
    await sourceChangedNodes(gatsbyApi, pluginOptions)
  } else {
    await sourceAllNodes(gatsbyApi, pluginOptions)
  }

  await gatsbyApi.cache.set(`LAST_BUILD_TIME`, Date.now())
}

exports.onCreateNode = function({ node }) {
  if (node.internal.type === `ShopifyLineItem` && node.product) {
    const [_match, _type, shopifyId] = node.product.id.match(idPattern)
    node.productId = shopifyId
    delete node.product
  }
}

exports.createSchemaCustomization = ({ actions }) => {
  actions.createTypes(`
    type ShopifyProductVariant implements Node {
      product: ShopifyProduct @link(from: "productId", by: "shopifyId")
      metafields: [ShopifyMetafield]
      presentmentPrices: [ShopifyProductVariantPricePair]
    }

    type ShopifyProduct implements Node {
      variants: [ShopifyProductVariant]
    }

    type ShopifyMetafield implements Node {
      productVariant: ShopifyProductVariant @link(from: "productVariantId", by: "shopifyId")
    }

    type ShopifyProductVariantPricePair implements Node {
      productVariant: ShopifyProductVariant @link(from: "productVariantId", by: "shopifyId")
    }

    type ShopifyOrder implements Node {
      lineItems: [ShopifyLineItem]
    }

    type ShopifyLineItem implements Node {
      product: ShopifyProduct @link(from: "productId", by: "shopifyId")
    }
  `)
}

exports.createResolvers = ({ createResolvers }) => {
  createResolvers({
    ShopifyOrder: {
      lineItems: {
        type: ["ShopifyLineItem"],
        resolve(source, args, context, info) {
          return context.nodeModel.runQuery({
            query: {
              filter: {
                orderId: { eq: source.shopifyId }
              }
            },
            type: "ShopifyLineItem",
            firstOnly: false,
          })
        }
      }
    },
    ShopifyProductVariant: {
      presentmentPrices: {
        type: ["ShopifyProductVariantPricePair"],
        resolve(source, args, context, info) {
          return context.nodeModel.runQuery({
            query: {
              filter: {
                productVariantId: { eq: source.shopifyId }
              }
            },
            type: "ShopifyProductVariantPricePair",
            firstOnly: false,
          })
        }

      },
      metafields: {
        type: ["ShopifyMetafield"],
        resolve(source, args, context, info) {
          return context.nodeModel.runQuery({
            query: {
              filter: {
                productVariantId: { eq: source.shopifyId }
              }
            },
            type: "ShopifyMetafield",
            firstOnly: false,
          })
        }
      }
    },
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
