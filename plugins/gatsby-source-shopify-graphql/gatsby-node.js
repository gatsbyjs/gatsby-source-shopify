require("dotenv").config()
const fetch = require("node-fetch")
const { createNodeHelpers } = require("gatsby-node-helpers")
const { createInterface } = require("readline")
const { finishLastOperation, createOperation, completedOperation } = require('./operations')
const { nodeBuilder } = require('./node-builder')

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

  for(var i = 0; i < objects.length; i++) {
    const obj = objects[i]
    const builder = nodeBuilder(nodeHelpers)
    const node = builder.buildNode(obj)
    actions.createNode(node)
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
  `)
}

exports.createResolvers = ({ createResolvers }) => {
  createResolvers({
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
